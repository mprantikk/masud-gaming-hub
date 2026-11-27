/**
 * End-to-end: two browsers (host + friend) play Ludo over a real peer-to-peer connection.
 * Uses a PeerJS server on this machine (devDependency "peer") and serves docs/ locally.
 * Run: npm run build && npm run e2e
 */
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');
const express = require('express');

const DOCS = path.join(__dirname, '../../docs'), WEB = 8080, PEER = 9000;
const Q = '?peerserver=127.0.0.1:' + PEER;

function serve() {
  return new Promise(r => {
    const s = http.createServer((req, res) => {
      const f = path.join(DOCS, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      if (!f.startsWith(DOCS) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(f).pipe(res);
    }).listen(WEB, '127.0.0.1', () => r(s));
  });
}
const wait = (page, expr, ms) => page.waitForFunction(expr, null, { timeout: ms || 20000 });

(async () => {
  const web = await serve();
  const app = express(), peerHttp = app.listen(PEER, '127.0.0.1'); app.use('/', ExpressPeerServer(peerHttp, { path: '/' }));
  const peer = { close: () => peerHttp.close() };
  const browser = await chromium.launch();
  const errors = [], pages = {};
  async function open(name) {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if (process.env.E2E_DEBUG) console.log('  [' + name + ']', m.text().slice(0, 200)); });
    pages[name] = page;
    return page;
  }
  try {
    // host
    const A = await open('host');
    await A.goto('http://127.0.0.1:' + WEB + '/' + Q);
    await A.fill('#gateName', 'Masud'); await A.click('text=Let\'s play');
    await wait(A, () => !document.getElementById('portal').classList.contains('hidden'));
    await wait(A, () => /Online/.test(document.getElementById('netNote').textContent));
    await A.evaluate(() => showLobby('ludo')); await A.selectOption('#ludoCount', '2');
    await A.click('text=Create match');
    await wait(A, () => !document.getElementById('room').classList.contains('hidden'));
    const link = await A.inputValue('#roomLink');
    assert(/\?room=[a-z0-9]{8}-g/.test(link), 'room link carries the host id: ' + link);
    console.log('host created', link);

    // friend opens the link
    const B = await open('friend');
    await B.goto(link + '&peerserver=127.0.0.1:' + PEER);
    await B.waitForFunction(() => typeof setMessage === 'function');
    await B.evaluate(() => { const o = window.setMessage; window.setMessage = function (m, el) { if (m) console.log('MSG: ' + m); return o.apply(this, arguments); }; });
    await B.fill('#gateName', 'Rafi'); await B.click('text=Let\'s play');
    await wait(B, () => !document.getElementById('room').classList.contains('hidden'));
    await wait(B, () => game && game.status === 'LOBBY');
    console.log('friend room actions:', await B.evaluate(() => document.getElementById('roomActions').innerText + ' | seats: ' + game.players.map(p => p.status).join()));
    await B.click('#roomActions >> text=Take a seat');
    await wait(B, () => game && game.status === 'ACTIVE');
    await wait(A, () => game && game.status === 'ACTIVE');
    const names = await A.evaluate(() => game.players.map(p => p.name + ':' + p.color).join(','));
    assert(/Masud:red/.test(names) && /Rafi:yellow/.test(names), names);
    console.log('match started:', names);

    // play a few turns: whoever's turn it is rolls / moves through the real UI functions
    let rolls = 0;
    for (let i = 0; i < 40 && rolls < 6; i++) {
      for (const P of [A, B]) {
        const did = await P.evaluate(async () => {
          if (!game || busy || fxBusy || !ludo || !canPlayColor(ludo.turn)) return 0;
          if (!ludo.rolled) { await rollDice(); return 1; }
          return 0;
        });
        rolls += did;
      }
      await A.waitForTimeout(700);
    }
    const seqA = await A.evaluate(() => game.state.rollSeq), turnInfo = await A.evaluate(() => game.revision);
    await wait(B, s => game.state.rollSeq >= s, 15000).catch(() => {});
    const seqB = await B.evaluate(() => game.state.rollSeq);
    console.log('rolls made', rolls, 'rollSeq host', seqA, 'friend', seqB, 'revision', turnInfo);
    assert(rolls >= 2 && seqA >= 2, 'both players could roll');

    // the friend's home screen lists the match hosted on the other device
    await B.evaluate(() => showPortal());
    await wait(B, () => document.querySelectorAll('#matches .match').length >= 1, 15000);
    console.log('friend home shows the remote match');

    // the friend cannot act for the host (the host fills in the caller from the connection)
    const hostKey = await A.evaluate(() => meKey), rid = link.split('room=')[1];
    const cheat = await B.evaluate(async ([hk, id]) => {
      const g = await HubNet.call('getGame', id, 0, 0, meKey);
      try { const r = await HubNet.call('ludoIdle', hk, id, g.revision); return r && r.ok ? 'allowed' : JSON.stringify(r).slice(0, 80); } catch (e) { return e.message; }
    }, [hostKey, rid]);
    assert(/creator/.test(cheat), 'the host must treat the caller as the friend, not as the host');

    // the host reloads the page: the match is saved on the device and the friend keeps playing
    const before = await A.evaluate(() => game.state.rollSeq);
    await A.goto(link + '&peerserver=127.0.0.1:' + PEER);
    await wait(A, () => game && game.status === 'ACTIVE' && !document.getElementById('ludoView').classList.contains('hidden'));
    const after = await A.evaluate(() => game.state.rollSeq);
    assert(after >= before, 'state kept after reload: ' + before + ' -> ' + after);
    await wait(A, () => /Online/.test(document.getElementById('netNote').textContent));
    const again = await B.evaluate(async id => (await HubNet.call('getGame', id, 0, 0, meKey)).state.rollSeq, link.split('room=')[1]).catch(e => 'ERR ' + e.message);
    console.log('after host reload: host rollSeq', after, 'friend sees', again);
    assert(again === after, 'friend reconnects to the host after a reload');

    // a robot match works on one device
    await A.evaluate(() => showPortal()); await A.evaluate(() => showLobby('ludo')); await A.selectOption('#ludoCount', '2');
    await A.click('text=Play against robots now');
    await wait(A, () => game && game.status === 'ACTIVE' && game.players.some(p => p.bot));
    console.log('robot match started on the host device');

    assert(!errors.length, 'page errors: ' + errors.join(' | '));
    console.log('E2E P2P PASS');
  } catch (e) {
    for (const n of Object.keys(pages)) console.log('--', n, await pages[n].evaluate(() => ({ msg: document.getElementById('message').textContent, net: (document.getElementById('netNote') || {}).textContent, view: Array.from(document.querySelectorAll('section')).filter(x => !x.classList.contains('hidden')).map(x => x.id).join() })).catch(x => x.message));
    throw e;
  } finally {
    await browser.close(); web.close(); try { peer.close && peer.close(); } catch (e) { }
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
})().catch(e => { console.error('E2E FAIL', e); process.exitCode = 1; setTimeout(() => process.exit(1), 300); });
