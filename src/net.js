/**
 * Peer-to-peer layer. The browser that creates a match is its server: the match id starts with that device's id,
 * so a friend's browser connects straight to it (WebRTC through PeerJS) and calls the same engine functions there.
 * Matches hosted on this device are called directly.
 */
window.HubNet = (function () {
  const E = window.HubEngine, TAG = E.CONFIG.HOST_TAG, PREFIX = 'masudhub-';

  // Which argument holds the match id (decides where the call goes).
  const ID_ARG = {
    getGame: 0, ludoBotTurn: 0, joinRoom: 1, declineRoom: 1, startRoom: 1, cancelRoom: 1, removeSeat: 1, rematch: 1, resignGame: 1, react: 1,
    ludoRoll: 1, ludoMove: 1, ludoPair: 1, ludoIdle: 1, chessMove: 1, chessBotMove: 1,
    t29Bid: 1, t29Trump: 1, t29Play: 1, t29ShowTrump: 1, t29PairCall: 1, t29NextHand: 1, t29Bot: 1, monoAct: 1, monoBot: 1
  };
  // Which argument is the calling player. The host fills it in from the connection, so nobody can play for someone else.
  const WHO_ARG = { getGame: 3, getSummaries: 0, ludoBotTurn: -1 };
  Object.keys(ID_ARG).forEach(fn => { if (!(fn in WHO_ARG)) WHO_ARG[fn] = 0; });
  const REMOTE_OK = Object.assign({ getSummaries: 1 }, ID_ARG);

  const hostOf = id => { const m = /^([a-z0-9]{8})-g/.exec(String(id || '')); return m ? m[1] : ''; };
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignored */ } };

  function local(fn, args) {
    const f = E.api[fn]; if (typeof f !== 'function') throw new Error('Unknown action: ' + fn);
    try { return clone(f.apply(null, clone(args))); } finally { E.save(); }
  }

  // ---- who am I (sent with every call to a host) ----
  let me = { key: '', name: '', avatar: '' };
  function setMe(p) { me = { key: String(p.key || ''), name: String(p.name || ''), avatar: String(p.avatar || '') }; }

  // ---- matches hosted by friends that this device has opened (for the home screen) ----
  const remembered = () => lsGet('mgh_remote').split(',').filter(x => hostOf(x) && hostOf(x) !== TAG);
  function remember(id) { if (!hostOf(id) || hostOf(id) === TAG) return; const l = remembered().filter(x => x !== id); l.unshift(id); lsSet('mgh_remote', l.slice(0, 30).join(',')); }
  function forget(ids) { const drop = new Set(ids); lsSet('mgh_remote', remembered().filter(x => !drop.has(x)).join(',')); }

  // ---- PeerJS ----
  let peer = null, peerReady = null, problem = '';
  const listeners = [];
  function onStatus(fn) { listeners.push(fn); fn(status()); }
  function status() { return { ready: !!(peer && peer.open), problem: problem, id: TAG }; }
  function emit() { const s = status(); listeners.forEach(fn => { try { fn(s); } catch (e) { /* ignore */ } }); }

  function peerOptions() {
    // Local testing only: ?peerserver=localhost:9000 uses a PeerJS server on this machine.
    const q = new URLSearchParams(location.search).get('peerserver');
    if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { const [host, port] = q.split(':'); return { host: host, port: Number(port) || 9000, path: '/', secure: false, debug: 1 }; }
    return { debug: 1 };
  }
  function startPeer() {
    if (peer) return peerReady;
    if (typeof window.Peer !== 'function' || !window.RTCPeerConnection) {
      problem = 'This browser cannot connect to friends (WebRTC is missing). Robot matches still work.';
      peerReady = Promise.reject(new Error(problem)); peerReady.catch(() => { }); emit(); return peerReady;
    }
    peer = new window.Peer(PREFIX + TAG, peerOptions());
    peerReady = new Promise((resolve, reject) => {
      peer.on('open', () => { problem = ''; emit(); resolve(peer); });
      peer.on('error', e => {
        const type = e && e.type;
        if (type === 'peer-unavailable') { const m = /masudhub-([a-z0-9]{8})/.exec(String(e.message || '')); if (m) drop(m[1], 'The host of this match is offline. Ask them to open Masud Gaming Hub.'); return; }
        if (type === 'unavailable-id') problem = 'Masud Gaming Hub is already open in another tab or window on this device. Use that one, or close it and reload.';
        else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') problem = 'Cannot reach the connection server. Check the internet connection.';
        else if (type === 'browser-incompatible') problem = 'This browser cannot connect to friends.';
        emit(); reject(new Error(problem || String(e && e.message || e)));
      });
    });
    peerReady.catch(() => { });
    peer.on('connection', serve);
    peer.on('disconnected', () => { emit(); setTimeout(() => { try { if (peer && !peer.destroyed && peer.disconnected) peer.reconnect(); } catch (e) { /* ignore */ } }, 2500); });
    peer.on('open', emit);
    return peerReady;
  }

  // ---- guest side: one connection per host ----
  const conns = {};
  let seq = 0;
  function drop(tag, why) {
    const c = conns[tag]; if (!c) return; delete conns[tag];
    Object.keys(c.pending).forEach(id => { const p = c.pending[id]; clearTimeout(p.t); p.reject(new Error(why)); });
    if (c.fail) c.fail(new Error(why));
    try { if (c.conn) c.conn.close(); } catch (e) { /* ignore */ }
  }
  function connTo(tag) {
    if (conns[tag]) return conns[tag].ready;
    const c = conns[tag] = { pending: {}, conn: null, fail: null };
    c.ready = (peerReady || startPeer()).then(p => new Promise((resolve, reject) => {
      c.fail = reject;
      const conn = p.connect(PREFIX + tag, { reliable: true, serialization: 'json' });
      const t = setTimeout(() => drop(tag, 'The host of this match is not answering. They need to have Masud Gaming Hub open.'), 15000);
      conn.on('open', () => { clearTimeout(t); c.conn = conn; c.fail = null; resolve(c); });
      conn.on('data', m => {
        if (!m || m.t !== 'res' || !c.pending[m.id]) return;
        const pnd = c.pending[m.id]; delete c.pending[m.id]; clearTimeout(pnd.t);
        if (m.ok) pnd.resolve(m.value); else pnd.reject(new Error(m.error || 'The host could not do that.'));
      });
      conn.on('close', () => drop(tag, 'Lost the connection to the host. Trying again...'));
      conn.on('error', () => drop(tag, 'Lost the connection to the host. Trying again...'));
    }));
    c.ready.catch(() => { if (conns[tag] === c) delete conns[tag]; });
    return c.ready;
  }
  async function remote(tag, fn, args, ms) {
    const c = await connTo(tag);
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const t = setTimeout(() => { delete c.pending[id]; reject(new Error('The host did not answer in time.')); }, ms || 20000);
      c.pending[id] = { resolve: resolve, reject: reject, t: t };
      try { c.conn.send({ t: 'call', id: id, fn: fn, args: args, who: me }); } catch (e) { delete c.pending[id]; clearTimeout(t); reject(e); }
    });
  }

  // ---- host side: answer friends' calls ----
  function serve(conn) {
    conn.on('data', m => {
      if (!m || m.t !== 'call') return;
      const reply = (ok, v) => { try { conn.send(ok ? { t: 'res', id: m.id, ok: true, value: v } : { t: 'res', id: m.id, ok: false, error: String(v) }); } catch (e) { /* closed */ } };
      try {
        const who = m.who || {}, fn = String(m.fn || '');
        if (!conn._key) conn._key = String(who.key || '');
        if (!conn._key || String(who.key || '') !== conn._key) throw new Error('Please reload the page.');
        if (!Object.prototype.hasOwnProperty.call(REMOTE_OK, fn)) throw new Error('That is not allowed.');
        const args = Array.isArray(m.args) ? m.args.slice() : [];
        if (fn === 'getSummaries') args[1] = (Array.isArray(args[1]) ? args[1] : []).filter(id => hostOf(id) === TAG);
        else if (hostOf(args[ID_ARG[fn]]) !== TAG) throw new Error('This match is not on this device.');
        if (WHO_ARG[fn] >= 0) args[WHO_ARG[fn]] = conn._key;
        const sig = who.name + '|' + who.avatar;
        if (conn._sig !== sig) { local('registerPlayer', [conn._key, who.name, who.avatar]); conn._sig = sig; }
        reply(true, local(fn, args));
      } catch (e) { reply(false, e && e.message ? e.message : e); }
    });
  }

  // ---- home screen: my own matches plus the ones friends host ----
  async function home(email) {
    const h = local('getHome', [email]), groups = {};
    remembered().forEach(id => { (groups[hostOf(id)] = groups[hostOf(id)] || []).push(id); });
    await Promise.all(Object.keys(groups).map(tag => {
      const cut = new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000));
      return Promise.race([remote(tag, 'getSummaries', [email, groups[tag]], 4000), cut]).then(r => {
        h.games = h.games.concat(r.games || []); h.recent = h.recent.concat(r.recent || []);
        const seen = new Set((r.games || []).concat(r.recent || []).map(x => x.id));
        forget(groups[tag].filter(id => !seen.has(id)));   // the host no longer has it (or I left)
      }, () => { /* host offline: show it later */ });
    }));
    h.games.sort((a, b) => b.updatedAt - a.updatedAt); h.recent.sort((a, b) => b.updatedAt - a.updatedAt); h.recent = h.recent.slice(0, 6);
    return h;
  }

  /** The app calls every engine function through here. */
  async function call(fn, ...args) {
    const gid = fn in ID_ARG ? String(args[ID_ARG[fn]] || '') : '', tag = hostOf(gid);
    if (tag && tag !== TAG) {
      const r = await remote(tag, fn, args);
      remember(gid); if (fn === 'rematch' && r && r.id) remember(r.id);
      return r;
    }
    if (fn === 'getHome') return home(args[0]);
    return local(fn, args);
  }

  const isRemote = id => { const t = hostOf(id); return !!t && t !== TAG; };
  return { call: call, setMe: setMe, start: startPeer, onStatus: onStatus, status: status, isRemote: isRemote, hostOf: hostOf, newKey: () => 'p' + E.rid(11) };
})();
