/**
 * Masud Gaming Hub - game engine.
 *
 * Runs in the browser of the player who hosts a match (see src/platform.js and src/net.js). Friends connect to that
 * browser peer-to-peer and call the same functions. Storage is a small in-memory "sheet" saved in localStorage.
 *
 * - Players are identified by a random id kept on their device, plus a name and an emoji avatar. No password.
 * - There are no coins or balances. The host can write an optional "bet" note
 *   (for example "Loser buys dinner"). Bets are settled in person.
 *
 * Ludo track: positions 0..50 shared track, 51..55 home column, 56 Home.
 */
const CONFIG = {
  APP_NAME: 'Masud Gaming Hub',
  HOST_TAG: '',   // set by the platform: this device's id, put in front of every match id it hosts
  MAX_BET_CHARS: 80,
  COLORS: ['red', 'green', 'yellow', 'blue'],
  START: { red: 0, green: 13, yellow: 26, blue: 39 },
  SAFE: [0, 8, 13, 21, 26, 34, 39, 47],
  ENTRY: 0,   // a token that comes out on a 6 stands on its own start square (a star, so it is safe)
  TRACK_LAST: 50,
  FINISH: 56,
  BOT_NAMES: ['Robo Max', 'Bolt', 'Pixel', 'Turbo', 'Zippy', 'Ninja', 'Comet', 'Sparky']
};

const SCHEMA = {
  Users: ['email', 'name', 'avatar', 'wins', 'played', 'createdAt', 'updatedAt'],
  Photos: ['email', 'photo', 'updatedAt'],
  Games: ['id', 'type', 'mode', 'status', 'bet', 'createdBy', 'players', 'state', 'settings', 'chat', 'result', 'revision', 'createdAt', 'updatedAt']
};
// Columns stored as plain text so Sheets never converts values like 007, 1e5 or true.
const TEXT_COLS = { Users: ['email', 'name', 'avatar'], Photos: ['email'], Games: ['id', 'createdBy', 'bet', 'result'] };

// ----------------------------------------------------------------------------
// Sheet helpers
// ----------------------------------------------------------------------------
let SS_ = null;
const SH_ = {};
function ss_() { return SS_ || (SS_ = SpreadsheetApp.openById('local')); }

function sheet_(name) {
  if (SH_[name]) return SH_[name];
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const head = SCHEMA[name];
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(function (h) { sh.getRange(1, head.indexOf(h) + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  } else {
    const ex = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
    head.forEach(function (h) {
      if (ex.indexOf(h) === -1) { sh.getRange(1, ex.length + 1).setValue(h); ex.push(h); }
    });
  }
  SH_[name] = sh;
  return sh;
}

function headers_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }

function readAll_(name) {
  const v = sheet_(name).getDataRange().getValues();
  const head = v[0].map(String), rows = [];
  for (let i = 1; i < v.length; i++) {
    const o = { _row: i + 1 };
    for (let j = 0; j < head.length; j++) o[head[j]] = v[i][j];
    rows.push(o);
  }
  return rows;
}

/** Reads only the last n data rows (fast on a big sheet). */
function readTail_(name, n) {
  const sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return [];
  const first = Math.max(2, last - n + 1), cols = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, cols).getValues()[0].map(String);
  const v = sh.getRange(first, 1, last - first + 1, cols).getValues(), rows = [];
  for (let i = 0; i < v.length; i++) {
    const o = { _row: first + i };
    for (let j = 0; j < head.length; j++) o[head[j]] = v[i][j];
    rows.push(o);
  }
  return rows;
}

function putRow_(name, obj) {
  const sh = sheet_(name), head = headers_(sh);
  const arr = head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
  if (obj._row) sh.getRange(obj._row, 1, 1, head.length).setValues([arr]);
  else { sh.appendRow(arr); obj._row = sh.getLastRow(); }
}

function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/^[=+\-@\s]+/, '').trim().substring(0, max || 40);
}
function pj_(v, fb) { try { return v ? JSON.parse(String(v)) : fb; } catch (e) { return fb; } }
function nowMs_() { return Date.now(); }

function lockRun_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function cache_() { return CacheService.getScriptCache(); }
function cacheDrop_(key) { try { cache_().remove(key); } catch (e) { /* optional */ } }

// ----------------------------------------------------------------------------
// Users
// ----------------------------------------------------------------------------
function normUser_(key) {
  key = String(key || '').trim().toLowerCase();
  if (!/^[a-z0-9._@+\-]{2,60}$/.test(key)) throw new Error('Invalid player id. Please reload the page.');
  return key;
}

function getUser_(key) {
  key = String(key || '').toLowerCase();
  const rows = readAll_('Users');
  for (let i = 0; i < rows.length; i++) if (String(rows[i].email).toLowerCase() === key) return rows[i];
  return null;
}

function ensureUser_(key, name, avatar) {
  key = normUser_(key);
  let u = getUser_(key);
  if (!u) {
    u = { email: key, name: clean_(name, 30) || key.split('@')[0], avatar: clean_(avatar, 8) || '😎', wins: 0, played: 0, createdAt: nowMs_(), updatedAt: nowMs_() };
    putRow_('Users', u);
  } else {
    let changed = false;
    if (name && clean_(name, 30) && clean_(name, 30) !== u.name) { u.name = clean_(name, 30); changed = true; }
    if (avatar && clean_(avatar, 8) && clean_(avatar, 8) !== u.avatar) { u.avatar = clean_(avatar, 8); changed = true; }
    if (changed) { u.updatedAt = nowMs_(); putRow_('Users', u); cacheDrop_('p:' + key); }
  }
  return u;
}

function publicUser_(u) {
  return { email: u.email, name: u.name, avatar: u.avatar, wins: Number(u.wins || 0), played: Number(u.played || 0) };
}

function login(email, name, avatar) {
  const key = normUser_(email), u = getUser_(key);
  const same = u && (!name || !clean_(name, 30) || clean_(name, 30) === u.name) && (!avatar || !clean_(avatar, 8) || clean_(avatar, 8) === u.avatar);
  if (!same) lockRun_(function () { ensureUser_(key, name, avatar); });
  const home = getHome(key);
  return { ok: true, profile: home.profile, home: home };
}

function getProfiles(emails) {
  const out = {}, miss = {};
  (emails || []).slice(0, 40).forEach(function (e) {
    const k = String(e).toLowerCase();
    let hit = null;
    try { hit = cache_().get('p:' + k); } catch (x) { hit = null; }
    if (hit) out[k] = JSON.parse(hit); else miss[k] = true;
  });
  if (Object.keys(miss).length) {
    const fresh = {};
    readAll_('Users').forEach(function (u) {
      const k = String(u.email).toLowerCase();
      if (miss[k]) fresh[k] = { name: u.name, avatar: u.avatar, photo: '' };
    });
    readAll_('Photos').forEach(function (p) {
      const k = String(p.email).toLowerCase();
      if (fresh[k]) fresh[k].photo = String(p.photo || '');
    });
    Object.keys(fresh).forEach(function (k) {
      out[k] = fresh[k];
      try { cache_().put('p:' + k, JSON.stringify(fresh[k]), 600); } catch (x) { /* optional */ }
    });
  }
  return out;
}

/** Registered players for the "invite" picker (no photos, so it stays light). */
function listUsers() {
  return readAll_('Users').map(function (u) { return { email: String(u.email), name: String(u.name), avatar: String(u.avatar || '') }; })
    .sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; }).slice(0, 300);
}

function getHome(email) {
  const key = normUser_(email);
  const users = readAll_('Users');
  let u = null;
  for (let i = 0; i < users.length; i++) if (String(users[i].email).toLowerCase() === key) { u = users[i]; break; }
  if (!u) u = ensureUser_(key);
  const me = String(u.email).toLowerCase();
  const games = [], finished = [];
  overlayLive_(readTail_('Games', 120)).forEach(function (r) {
    const g = hydrate_(r);
    if (g.type === 'snake') return;
    const idx = g.players.findIndex(function (p) { return !p.bot && String(p.email).toLowerCase() === me && p.status !== 'declined'; });
    if (idx === -1) return;
    const item = summary_(g, me, idx);
    if (g.status === 'LOBBY' || g.status === 'ACTIVE') games.push(item); else if (g.status === 'FINISHED') finished.push(item);
  });
  games.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  finished.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  const board = users.filter(function (x) { return Number(x.played || 0) > 0; })
    .sort(function (a, b) { return (Number(b.wins) - Number(a.wins)) || (Number(a.played) - Number(b.played)); }).slice(0, 10)
    .map(function (x) { return { email: String(x.email), name: x.name, avatar: x.avatar, wins: Number(x.wins || 0), played: Number(x.played || 0) }; });
  return { profile: publicUser_(u), games: games, recent: finished.slice(0, 4), leaderboard: board };
}

/** A friend's browser says who it is before its first call (their name and avatar are kept in this host's user list). */
function registerPlayer(email, name, avatar) {
  const key = normUser_(email), u = getUser_(key);
  const same = u && (!name || clean_(name, 30) === u.name) && (!avatar || clean_(avatar, 8) === u.avatar);
  if (!same) lockRun_(function () { ensureUser_(key, name, avatar); });
  return { ok: true };
}

/** Home-screen rows for matches this device hosts, asked for by a friend who plays in them. */
function getSummaries(email, ids) {
  const me = String(email || '').toLowerCase(), out = { games: [], recent: [] };
  (ids || []).slice(0, 40).forEach(function (id) {
    const g = findGame_(String(id)); if (!g) return;
    const idx = g.players.findIndex(function (p) { return !p.bot && String(p.email).toLowerCase() === me && p.status !== 'declined'; });
    if (idx === -1) return;
    const item = summary_(g, me, idx);
    if (g.status === 'LOBBY' || g.status === 'ACTIVE') out.games.push(item); else if (g.status === 'FINISHED') out.recent.push(item);
  });
  return out;
}

function summary_(g, me, idx) {
  const p = g.players[idx];
  const myTurn = g.status === 'ACTIVE' && ((g.type === 'ludo' && g.state && g.state.turn === p.color) ||
    (g.type === 'chess' && g.state && ((g.state.turn === 'w' && idx === 0) || (g.state.turn === 'b' && idx === 1))) ||
    (g.type === 'mono' && g.state && g.state.turn === idx) || (g.type === 't29' && g.state && t29Actor_(g.state) === idx));
  return { id: g.id, type: g.type, mode: g.mode, status: g.status, bet: g.bet, result: g.result, updatedAt: Number(g.updatedAt || 0),
    names: g.players.map(function (x) { return x.name || '(open seat)'; }).join(' · '), invited: p.status === 'invited',
    creator: String(g.createdBy).toLowerCase() === me, myTurn: !!myTurn };
}

// ----------------------------------------------------------------------------
// Game storage
// ----------------------------------------------------------------------------
function hydrate_(o) {
  o.players = pj_(o.players, []); o.state = pj_(o.state, {}); o.settings = pj_(o.settings, {}); o.chat = pj_(o.chat, []);
  o.bet = String(o.bet == null ? '' : o.bet); o.revision = Number(o.revision || 1);
  return o;
}

/**
 * Speed: the whole match is kept in the cache (read-through / write-through). During a running match the Sheet
 * is only updated every few moves (and always when the match starts, ends or is in the lobby), so a move does
 * not have to open the spreadsheet at all.
 */
function findGame_(id) {
  try { const s = cache_().get('f:' + id); if (s) { const cg = JSON.parse(s); if (cg && cg.id === id) return cg; } } catch (e) { /* fall back to the sheet */ }
  const g = findGameSheet_(id);
  if (g) { g._flushedAt = nowMs_(); g._flushedRev = g.revision; g._flushedStatus = g.status; }
  return g;
}

/** The Sheet can be a few moves behind for running matches: use the live copy from the cache for those. */
function overlayLive_(rows) {
  try {
    const keys = rows.filter(function (r) { return String(r.status) === 'ACTIVE'; }).map(function (r) { return 'f:' + r.id; });
    if (!keys.length) return rows;
    const m = cache_().getAll(keys);
    rows.forEach(function (r) {
      const s = m['f:' + r.id]; if (!s) return;
      const g = JSON.parse(s);
      r.players = JSON.stringify(g.players); r.state = JSON.stringify(g.state); r.settings = JSON.stringify(g.settings); r.chat = JSON.stringify(g.chat || []);
      r.status = g.status; r.revision = g.revision; r.result = g.result; r.updatedAt = g.updatedAt;
    });
  } catch (e) { /* the sheet copy is good enough */ }
  return rows;
}

function findGameSheet_(id) {
  const sh = sheet_('Games'), last = sh.getLastRow();
  if (last < 2) return null;
  const head = headers_(sh), col = head.indexOf('id');
  const ids = sh.getRange(2, col + 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      const row = i + 2, vals = sh.getRange(row, 1, 1, head.length).getValues()[0], o = { _row: row };
      head.forEach(function (h, j) { o[h] = vals[j]; });
      return hydrate_(o);
    }
  }
  return null;
}

function cachePut_(g) {
  try {
    cache_().put('g:' + g.id, JSON.stringify(pub_(g)), 600);
    if (g.type === 't29' && g.state && g.state.hands) cache_().put('h:' + g.id, JSON.stringify(g.state), 600);
  } catch (e) { /* optional */ }
}

function saveGame_(g, bump) {
  if (bump !== false) g.revision = Number(g.revision || 1) + 1;
  g.updatedAt = nowMs_();
  const now = g.updatedAt;
  let flush = !g._row || g.status !== 'ACTIVE' || g.status !== g._flushedStatus || !g._flushedAt || (now - g._flushedAt) > 20000 || (g.revision - (g._flushedRev || 0)) >= 10;
  if (!flush) {   // keep the full match in the cache; if that fails (too big) write to the sheet instead
    try { cache_().put('f:' + g.id, JSON.stringify(g), 21600); } catch (e) { flush = true; }
  }
  if (flush) {
    const o = Object.assign({}, g, { players: JSON.stringify(g.players), state: JSON.stringify(g.state), settings: JSON.stringify(g.settings), chat: JSON.stringify(g.chat || []) });
    putRow_('Games', o);
    g._row = o._row; g._flushedAt = now; g._flushedRev = g.revision; g._flushedStatus = g.status;
    try { cache_().put('f:' + g.id, JSON.stringify(g), 21600); } catch (e) { cacheDrop_('f:' + g.id); }
  }
  cachePut_(g);
}

function must_(id) {
  const g = findGame_(id);
  if (!g) throw new Error('Match not found. Please check the link.');
  return g;
}

function seatOf_(g, email) {
  email = String(email || '').toLowerCase();
  return g.players.findIndex(function (p) { return !p.bot && p.status === 'accepted' && String(p.email).toLowerCase() === email; });
}

function pub_(g) {
  return { id: g.id, type: g.type, mode: g.mode, status: g.status, bet: g.bet, createdBy: g.createdBy,
    players: g.players.map(function (p) { return { email: p.bot ? '' : p.email, name: p.name, avatar: p.avatar, bot: !!p.bot, status: p.status, color: p.color || '', resigned: !!p.resigned }; }),
    state: g.type === 't29' && g.state && g.state.hands ? t29Public_(g.state) : g.state, settings: g.settings, chat: g.chat || [], result: g.result, winners: g.settings.winners || [], revision: g.revision, updatedAt: Number(g.updatedAt || 0) };
}

/** Fast path: the cache holds the last saved copy of every game, so polling does not read the Sheet. */
function getGame(id, rev, chatSeq, email) {
  let pub = null;
  try { const hit = cache_().get('g:' + id); if (hit) pub = JSON.parse(hit); } catch (e) { pub = null; }
  if (!pub) { const g = must_(id); cachePut_(g); pub = pub_(g); }
  if (Number(rev) && Number(rev) === pub.revision) {
    const last = pub.chat && pub.chat.length ? pub.chat[pub.chat.length - 1].seq : 0;
    if (Number(chatSeq || 0) === last) return { same: true, revision: pub.revision };   // nothing new: tiny reply
  }
  if (pub.type === 't29' && pub.status === 'ACTIVE') {         // add only this viewer's own cards
    let st = null;
    try { const h = cache_().get('h:' + id); if (h) st = JSON.parse(h); } catch (e) { st = null; }
    if (!st) { const g = must_(id); cachePut_(g); st = g.state; }
    const seat = pub.players.findIndex(function (p) { return !p.bot && p.status === 'accepted' && String(p.email).toLowerCase() === String(email || '').toLowerCase(); });
    const out = Object.assign({}, pub); out.mine = seat === -1 || !st.hands ? null : t29Mine_(st, seat);
    return out;
  }
  return pub;
}

// ----------------------------------------------------------------------------
// Rooms: create / join / start / cancel
// ----------------------------------------------------------------------------
function botSeat_(n) {
  return { email: 'bot' + n, name: CONFIG.BOT_NAMES[n % CONFIG.BOT_NAMES.length] + ' 🤖', avatar: '🤖', bot: true, status: 'accepted' };
}

function newId_() { return (CONFIG.HOST_TAG ? CONFIG.HOST_TAG + '-' : '') + 'g' + Utilities.getUuid().replace(/-/g, '').substring(0, 11); }
function gameTitle_(g) { return ({ ludo: 'Ludo', chess: 'Chess', t29: 'Twenty-Nine (29)', mono: 'Monopoly' }[g.type] || 'a game') + (g.mode === 'TEAM' ? ' (2v2 teams)' : g.mode === 'QUICK' ? ' (quick)' : ''); }

/**
 * opts: { type:'ludo'|'chess', mode:'CLASSIC'|'QUICK'|'TEAM', playerCount, bet,
 *         slots:[ {email,name} | {bot:true} | {open:true} ... ] }   (slots = the seats after yours, in seat order)
 * TEAM mode seat order: you (red), opponent 1 (green), your teammate (yellow), opponent 2 (blue).
 * An invited seat waits for that player to join; an open seat is taken by whoever opens the match link first.
 */
function createRoom(email, opts) {
  return lockRun_(function () {
    opts = opts || {};
    const me = ensureUser_(email);
    const type = String(opts.type || '').toLowerCase();
    if (['ludo', 'chess', 't29', 'mono'].indexOf(type) === -1) throw new Error('Please pick a game.');
    let mode = String(opts.mode || 'CLASSIC').toUpperCase();
    if (type === 'chess' || type === 't29') mode = 'CLASSIC';
    if (type === 'mono' && mode !== 'QUICK') mode = 'CLASSIC';
    if (['CLASSIC', 'QUICK', 'TEAM'].indexOf(mode) === -1) throw new Error('Unknown game mode.');
    let count = type === 'chess' ? 2 : type === 't29' ? 4 : Math.max(2, Math.min(4, Math.floor(Number(opts.playerCount) || 4)));
    if (type === 'ludo' && mode === 'TEAM') count = 4;
    const slots = Array.isArray(opts.slots) ? opts.slots : [];
    const players = [{ email: me.email, name: me.name, avatar: me.avatar, bot: false, status: 'accepted' }];
    const seen = {}; seen[me.email] = true;
    let botN = 0;
    for (let i = 0; i < count - 1; i++) {
      const s = slots[i] || { open: true };
      if (s.bot) { players.push(botSeat_(botN++)); }
      else if (s.email) {
        const u = ensureUser_(s.email, s.name);
        if (seen[u.email]) throw new Error('Each player must be different: ' + u.email);
        seen[u.email] = true;
        players.push({ email: u.email, name: u.name, avatar: u.avatar, bot: false, status: 'invited' });
      } else players.push({ email: '', name: '', avatar: '', bot: false, status: 'open' });
    }
    const g = { id: newId_(), type: type, mode: mode, status: 'LOBBY', bet: clean_(opts.bet, CONFIG.MAX_BET_CHARS), createdBy: me.email, players: players, state: {},
      settings: { playerCount: count, hints: type === 'chess' && !!opts.hints }, chat: [], result: '', revision: 1, createdAt: nowMs_(), updatedAt: nowMs_() };
    saveGame_(g, false);
    maybeAutoStart_(g);
    return { ok: true, id: g.id };
  });
}

function maybeAutoStart_(g) {
  const full = g.players.length >= 2 && g.players.every(function (p) { return p.status === 'accepted'; });
  if (g.status === 'LOBBY' && full) startNow_(g);
}

/** Accept an invite, or take an open seat from a shared link. */
function joinRoom(email, id) {
  return lockRun_(function () {
    const u = ensureUser_(email);
    const g = must_(id);
    if (g.status !== 'LOBBY') throw new Error('This match has already started or ended.');
    let idx = g.players.findIndex(function (p) { return !p.bot && String(p.email).toLowerCase() === u.email; });
    if (idx !== -1 && g.players[idx].status === 'accepted') return { ok: true, game: pub_(g) };
    if (idx === -1) idx = g.players.findIndex(function (p) { return p.status === 'open'; });
    if (idx === -1) throw new Error('No seat is free in this match. You can still watch.');
    const p = g.players[idx];
    p.email = u.email; p.name = u.name; p.avatar = u.avatar; p.status = 'accepted';
    saveGame_(g);
    maybeAutoStart_(g);
    return { ok: true, game: pub_(g) };
  });
}

function declineRoom(email, id) {
  return lockRun_(function () {
    const g = must_(id);
    if (g.status !== 'LOBBY') throw new Error('Nothing to decline.');
    if (String(g.createdBy).toLowerCase() === String(email).toLowerCase()) return cancelNow_(g, 'Cancelled by the host');
    return leaveLobby_(g, email);
  });
}

function leaveLobby_(g, email) {
  const idx = g.players.findIndex(function (p) { return !p.bot && String(p.email).toLowerCase() === String(email).toLowerCase(); });
  if (idx === -1) throw new Error('You are not in this match.');
  const p = g.players[idx];
  if (p.status === 'invited') p.status = 'declined';
  else { p.status = 'open'; p.email = ''; p.name = ''; p.avatar = ''; }
  saveGame_(g);
  maybeAutoStart_(g);
  return { ok: true, game: pub_(g) };
}

/** Host takes out a seat that has not been accepted (invited, open or declined). If everyone left has joined, the match starts. */
function removeSeat(email, id, idx) {
  return lockRun_(function () {
    const g = must_(id);
    if (String(g.createdBy).toLowerCase() !== String(email).toLowerCase()) throw new Error('Only the host can remove a seat.');
    if (g.status !== 'LOBBY') throw new Error('The match already started.');
    idx = Number(idx);
    const p = g.players[idx];
    if (!p) throw new Error('That seat does not exist.');
    if (p.bot || p.status === 'accepted') throw new Error('Only seats that have not joined can be removed.');
    g.players.splice(idx, 1);
    saveGame_(g);
    maybeAutoStart_(g);
    return { ok: true, game: pub_(g) };
  });
}

function startRoom(email, id) {
  return lockRun_(function () {
    const g = must_(id);
    if (String(g.createdBy).toLowerCase() !== String(email).toLowerCase()) throw new Error('Only the host can start the match.');
    if (g.status !== 'LOBBY') throw new Error('The match already started.');
    startNow_(g);
    return { ok: true, game: pub_(g) };
  });
}

function startNow_(g) {
  let seats;
  if (g.mode === 'TEAM') {
    let n = 0;
    seats = g.players.map(function (p) { return p.status === 'accepted' ? p : botSeat_(n++ + 3); });
  } else {
    seats = g.players.filter(function (p) { return p.status === 'accepted'; });
  }
  if (g.type === 't29') {      // Twenty-Nine always has 4 seats: empty seats are filled by robots
    let n = 0;
    seats = g.players.map(function (p) { return p.status === 'accepted' ? p : botSeat_(n++ + 3); });
  }
  const humans = seats.filter(function (p) { return !p.bot; });
  if (!humans.length || seats.length < 2) throw new Error('You need at least 2 players. Add a robot or wait for a friend.');
  if (g.type === 'chess' && seats.length !== 2) throw new Error('Chess needs exactly 2 players.');
  g.players = seats;
  if (g.type === 'ludo') {
    const colors = colorsFor_(seats.length);
    seats.forEach(function (p, i) { p.color = colors[i]; });
    g.state = ludoInit_(colors, g.mode);
    g.settings.playerCount = seats.length;
  } else if (g.type === 't29') {
    g.state = t29Init_(); g.settings.playerCount = 4;
  } else if (g.type === 'mono') {
    g.state = monoInit_(seats.length, g.mode); g.settings.playerCount = seats.length;
  } else {
    g.state = { fen: 'start', moves: [], turn: 'w', lastMove: null };
    seats[0].color = 'white'; seats[1].color = 'black';
  }
  g.status = 'ACTIVE';
  saveGame_(g);
}

function cancelNow_(g, why) {
  g.status = 'CANCELLED'; g.result = why;
  saveGame_(g);
  return { ok: true, game: pub_(g) };
}

function cancelRoom(email, id) {
  return lockRun_(function () {
    const g = must_(id);
    if (String(g.createdBy).toLowerCase() !== String(email).toLowerCase()) throw new Error('Only the host can cancel.');
    if (g.status !== 'LOBBY') throw new Error('Only a waiting lobby can be cancelled. Use Resign in a running match.');
    return cancelNow_(g, 'Cancelled by the host');
  });
}

function rematch(email, id) {
  return lockRun_(function () {
    const old = must_(id), me = ensureUser_(email);
    if (seatOf_(old, me.email) === -1) throw new Error('Only players can ask for a rematch.');
    const players = old.players.map(function (p) {
      const isMe = !p.bot && String(p.email).toLowerCase() === me.email;
      return { email: p.email, name: p.name, avatar: p.avatar, bot: !!p.bot, status: p.bot || isMe ? 'accepted' : 'invited' };
    });
    const g = { id: newId_(), type: old.type, mode: old.mode, status: 'LOBBY', bet: old.bet, createdBy: me.email, players: players, state: {},
      settings: { playerCount: players.length, hints: !!(old && old.settings && old.settings.hints) }, chat: [], result: '', revision: 1, createdAt: nowMs_(), updatedAt: nowMs_() };
    saveGame_(g, false);
    maybeAutoStart_(g);
    return { ok: true, id: g.id };
  });
}

// ----------------------------------------------------------------------------
// Results
// ----------------------------------------------------------------------------
function finish_(g, winnerIdx, label) {
  g.status = 'FINISHED';
  g.settings.winners = winnerIdx.map(function (i) { return g.players[i].bot ? g.players[i].name : g.players[i].email; });
  g.players.forEach(function (p, i) {
    if (p.bot) return;
    const u = getUser_(p.email);
    if (u) { u.played = Number(u.played || 0) + 1; if (winnerIdx.indexOf(i) !== -1) u.wins = Number(u.wins || 0) + 1; putRow_('Users', u); }
  });
  g.result = label;
  saveGame_(g);
}

function draw_(g, label) {
  g.status = 'FINISHED'; g.result = label; g.settings.winners = [];
  saveGame_(g);
}

function teamOf_(color) { return color === 'red' || color === 'yellow' ? 'A' : 'B'; }
function teamColors_(color) { return teamOf_(color) === 'A' ? ['red', 'yellow'] : ['green', 'blue']; }
function colorsFor_(n) { return n === 2 ? ['red', 'yellow'] : n === 3 ? ['red', 'green', 'yellow'] : ['red', 'green', 'yellow', 'blue']; }

function winnerSeatsLudo_(g, winner) {
  const out = [];
  g.players.forEach(function (p, i) {
    if (winner.indexOf('team-') === 0) { if (teamOf_(p.color) === (winner === 'team-red-yellow' ? 'A' : 'B')) out.push(i); }
    else if (p.color === winner) out.push(i);
  });
  return out;
}

function winLabel_(g, idxs) {
  const names = idxs.map(function (i) { return g.players[i].name; });
  return (g.mode === 'TEAM' ? 'Team ' + names.join(' & ') : names.join(' & ')) + ' won';
}

// ----------------------------------------------------------------------------
// Ludo rules
// ----------------------------------------------------------------------------
function ludoInit_(colors, mode) {
  const coins = { red: [-1, -1, -1, -1], green: [-1, -1, -1, -1], yellow: [-1, -1, -1, -1], blue: [-1, -1, -1, -1] };
  if (mode === 'QUICK') colors.forEach(function (c) { coins[c][0] = CONFIG.ENTRY; });
  return { ver: 2, turn: colors[Math.floor(Math.random() * colors.length)], dice: 0, rolled: false, rollSeq: 0, moveSeq: 0, lastMove: null,
    activeColors: colors.slice(), mode: mode, quickTarget: 2, teamMode: mode === 'TEAM', coins: coins, winner: null, pending: [], bonus: 0, pairs: [] };
}

function colorDone_(state, color) {
  return (state.coins[color] || []).every(function (p) { return p === CONFIG.FINISH; });
}
/** The next player in order; a player whose 4 tokens are all home has nothing left to roll for and is skipped. */
function nextActive_(state, color) {
  const a = state.activeColors, i = a.indexOf(color);
  for (let n = 1; n <= a.length; n++) {
    const c = a[(i + n) % a.length];
    if (!colorDone_(state, c)) return c;
  }
  return a[(i + 1) % a.length];
}

// ---- Pairs ("jora"): two tokens on one square are declared a pair and then move together ----
function splitK_(k) { const a = String(k).split(':'); return { color: a[0], coin: Number(a[1]) }; }
function pairOf_(state, color, i) {
  const k = color + ':' + i, ps = state.pairs || [];
  for (let n = 0; n < ps.length; n++) { if (ps[n][0] === k) return splitK_(ps[n][1]); if (ps[n][1] === k) return splitK_(ps[n][0]); }
  return null;
}
function gcell_(state, color, i) {
  const p = state.coins[color][i];
  return (p >= 0 && p <= CONFIG.TRACK_LAST) ? (CONFIG.START[color] + p) % 52 : -1;
}
function cleanPairs_(state) {
  state.pairs = (state.pairs || []).filter(function (p) {
    const a = splitK_(p[0]), b = splitK_(p[1]), ga = gcell_(state, a.color, a.coin);
    return ga >= 0 && ga === gcell_(state, b.color, b.coin);
  });
}
/** Couples that can be declared now: two tokens (mine, or my team mate's) on the same track square. */
function pairCandidates_(state, color) {
  const allies = state.teamMode ? teamColors_(color) : [color], cells = {}, out = [];
  allies.forEach(function (c) {
    if (state.activeColors.indexOf(c) === -1) return;
    state.coins[c].forEach(function (p, i) {
      const g = gcell_(state, c, i); if (g < 0 || pairOf_(state, c, i) || CONFIG.SAFE.indexOf(g) !== -1) return;   // no pairing on a star
      (cells[g] = cells[g] || []).push({ color: c, coin: i });
    });
  });
  Object.keys(cells).forEach(function (g) {
    const arr = cells[g].sort(function (a, b) { return (a.color === color ? 0 : 1) - (b.color === color ? 0 : 1); });
    // never pair tokens of different colours on the square where one of them turns into its home column
    const bad = function (x, y) { return x.color !== y.color && (state.coins[x.color][x.coin] === CONFIG.TRACK_LAST || state.coins[y.color][y.coin] === CONFIG.TRACK_LAST); };
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      if (arr[i].color !== color && arr[j].color !== color) continue;
      if (bad(arr[i], arr[j])) continue;
      if (!out.some(function (o) { return o.cell === g; })) { const pr = [arr[i].color + ':' + arr[i].coin, arr[j].color + ':' + arr[j].coin]; pr.cell = g; out.push(pr); }
    }
  });
  return out;
}

/** A kick only counts if another token of the kicker can play the bonus roll (the kicking token must stay put). */
function hasScope_(state, color, idx, partner) {
  return state.coins[color].some(function (p, i) {
    if (i === idx || (partner && partner.color === color && partner.coin === i)) return false;
    return p !== CONFIG.FINISH;
  });
}

/** A single token may not jump over an opponent's pair: it has to land exactly on the pair's square first. */
function passBlocked_(state, color, pos, step) {
  if (pos < 0 || step < 2) return false;
  const allied = state.teamMode ? teamColors_(color) : [color];
  for (let k = 1; k < step; k++) {
    const q = pos + k;
    if (q > CONFIG.TRACK_LAST) break;
    const global = (CONFIG.START[color] + q) % 52;
    const hit = state.activeColors.some(function (other) {
      if (allied.indexOf(other) !== -1) return false;
      return state.coins[other].some(function (p, i) { return p >= 0 && p <= CONFIG.TRACK_LAST && (CONFIG.START[other] + p) % 52 === global && pairOf_(state, other, i); });
    });
    if (hit) return true;
  }
  return false;
}

function movableRaw_(state, color, dice) {
  const out = [];
  const locked = state.lock && state.lock.color === color ? state.lock.coin : -1;
  state.coins[color].forEach(function (p, i) {
    if (i === locked) return;
    const pr = pairOf_(state, color, i);
    if (pr && pr.color === color && pr.coin === locked) return;   // its pair mate is the kicker and must stay put
    let step = dice;
    if (pr) {   // a pair moves half the roll (4 -> 2 squares); an odd roll cannot move a pair
      if (dice % 2 !== 0) return;
      step = dice / 2;
      const q = state.coins[pr.color][pr.coin]; if (!(q >= 0 && q < CONFIG.FINISH && q + step <= CONFIG.FINISH)) return;
    }
    if (!pr && passBlocked_(state, color, p, step)) return;   // cannot jump over an opponent's pair
    if (p === -1 ? dice === 6 : (p >= 0 && p < CONFIG.FINISH && p + step <= CONFIG.FINISH)) out.push(i);
  });
  return out;
}

/**
 * Only a pair can move, and some stored roll (an odd one, say) cannot be played by it.
 * Then the rolls may only be played if EVERY stored roll can still be used, e.g. 6,6,3: the pair may take the 6s
 * only if it reaches a star and splits, so that the 3 can be played afterwards. Otherwise none of them can be played.
 */
function pairOnlyStrict_(state, color) {
  if (!state.pairs || !state.pairs.length || !state.pending || !state.pending.length) return false;
  let any = false, stuck = false, single = false;
  state.pending.forEach(function (d) {
    const m = movableRaw_(state, color, d);
    if (!m.length) stuck = true;
    m.forEach(function (i) { any = true; if (!pairOf_(state, color, i)) single = true; });
  });
  return any && stuck && !single;
}

/** Can every stored roll still be used, starting from this state (simulated move by move)? */
function usesAll_(state, color, memo) {
  if (state.winner || !state.pending.length) return true;
  const key = JSON.stringify(state.coins) + '|' + state.pending.slice().sort().join(',') + '|' + JSON.stringify(state.pairs);
  if (memo[key] !== undefined) return memo[key];
  let ok = false;
  const seen = {};
  for (let k = 0; k < state.pending.length && !ok; k++) {
    const d = state.pending[k]; if (seen[d]) continue; seen[d] = true;
    const idxs = movableRaw_(state, color, d), tried = {};
    for (let j = 0; j < idxs.length && !ok; j++) {
      const pr = pairOf_(state, color, idxs[j]), sig = pr ? [color + ':' + idxs[j], pr.color + ':' + pr.coin].sort().join('+') : color + ':' + idxs[j];
      if (tried[sig]) continue; tried[sig] = true;
      ok = playsOut_(state, color, idxs[j], k, memo);
    }
  }
  memo[key] = ok; return ok;
}

function playsOut_(state, color, idx, dieIdx, memo) {
  const s = JSON.parse(JSON.stringify(state)); s._raw = true;
  const left = s.pending.length - 1;
  moveCore_(s, color, idx, dieIdx);
  if (s.winner || left === 0) return true;
  if (s.pending.length !== left) return false;   // the turn ended with rolls unused
  return usesAll_(s, color, memo);
}

function movable_(state, color, dice) {
  const raw = movableRaw_(state, color, dice);
  if (!raw.length || state._raw || !pairOnlyStrict_(state, color)) return raw;
  const memo = {}, k = state.pending.indexOf(dice);
  return raw.filter(function (i) { return k >= 0 && playsOut_(state, color, i, k, memo); });
}

/** Remember which tokens may really move (only needed in the strict pair case) so the screen can match the server. */
function refreshAllow_(state) {
  state.allow = null;
  if (!state.rolled || !pairOnlyStrict_(state, state.turn)) return;
  const a = {}; state.pending.forEach(function (d) { a[d] = movable_(state, state.turn, d); }); state.allow = a;
}

/** Would a token landing on `dest` have kicked someone? (used for the "no scope" message) */
function wouldKick_(state, color, dest, byPair) {
  const global = (CONFIG.START[color] + dest) % 52;
  if (CONFIG.SAFE.indexOf(global) !== -1) return false;
  const allied = state.teamMode ? teamColors_(color) : [color];
  return state.activeColors.some(function (other) {
    if (allied.indexOf(other) !== -1) return false;
    return state.coins[other].some(function (p, i) { return p >= 0 && p <= CONFIG.TRACK_LAST && (CONFIG.START[other] + p) % 52 === global && (byPair || !pairOf_(state, other, i)); });
  });
}

function capture_(state, color, dest, byPair) {
  const res = { captured: [] };
  if (dest < 0 || dest > CONFIG.TRACK_LAST) return res;
  const global = (CONFIG.START[color] + dest) % 52;
  if (CONFIG.SAFE.indexOf(global) !== -1) return res;
  const allied = state.teamMode ? teamColors_(color) : [color];
  state.activeColors.forEach(function (other) {
    if (allied.indexOf(other) !== -1) return;
    state.coins[other] = state.coins[other].map(function (p, i) {
      if (p >= 0 && p <= CONFIG.TRACK_LAST && (CONFIG.START[other] + p) % 52 === global && (byPair || !pairOf_(state, other, i))) { res.captured.push({ color: other, coin: i, from: p }); return -1; }
      return p;
    });
  });
  return res;
}

function winnerOf_(state, color) {
  const target = state.mode === 'QUICK' ? state.quickTarget : 4;
  const done = state.coins[color].filter(function (p) { return p === CONFIG.FINISH; }).length;
  if (!state.teamMode) return done >= target ? color : null;
  const allies = teamColors_(color);
  const ok = allies.every(function (a) { return state.coins[a].every(function (p) { return p === CONFIG.FINISH; }); });
  return ok ? (teamOf_(color) === 'A' ? 'team-red-yellow' : 'team-green-blue') : null;
}

/** Old matches (made before rolls were stacked) have no pending list: build it from the single roll they hold. */
function ludoNorm_(state) {
  if (!Array.isArray(state.pending)) state.pending = state.rolled && state.dice ? [state.dice] : [];
  if (!state.bonus) state.bonus = 0;
  if (!Array.isArray(state.pairs)) state.pairs = [];
}

/** True when at least one stored roll can still be played by someone. */
function legalAny_(state) {
  return state.pending.some(function (d) { return movable_(state, state.turn, d).length > 0; });
}

/** The turn's rolls are used up: give a bonus roll if one was earned, otherwise pass the turn. */
function endCycle_(state) {
  state.pending = []; state.rolled = false; state.lock = null; state.allow = null;
  if (colorDone_(state, state.turn)) state.bonus = 0;   // all 4 home: no bonus roll needed
  if (state.bonus > 0) { state.bonus -= 1; state.lock = state.lockNext || null; state.lockNext = null; return true; }
  state.lockNext = null; state.turn = nextActive_(state, state.turn); return false;
}

/**
 * A roll is only stored. A six means "roll again" (three sixes in a row cancel everything).
 * When the cycle ends with a non-six, the player uses the stored rolls in any order they like.
 */
function rollCore_(state) {
  ludoNorm_(state); state.actAt = nowMs_();
  const dice = Math.floor(Math.random() * 6) + 1;
  state.dice = dice; state.rollSeq = Number(state.rollSeq || 0) + 1;
  const info = { dice: dice, noMoves: false, threeSixes: false, extraTurn: false };
  state.pending.push(dice);
  if (dice === 6) {
    if (state.pending.filter(function (d) { return d === 6; }).length >= 3) {
      // three sixes in a row do not count: they are dropped and the player rolls again; only the next roll(s) count
      info.threeSixes = true; info.extraTurn = true; state.pending = []; state.rolled = false; return info;
    }
    state.rolled = false; info.extraTurn = true; return info;
  }
  if (!legalAny_(state)) {
    info.noMoves = true; info.extraTurn = endCycle_(state); return info;
  }
  state.rolled = true; refreshAllow_(state);
  return info;
}

function moveCore_(state, color, idx, dieIdx) {
  ludoNorm_(state); state.actAt = nowMs_();
  dieIdx = Number(dieIdx) >= 0 && Number(dieIdx) < state.pending.length ? Number(dieIdx) : 0;
  const die = state.pending[dieIdx]; state.dice = die; state.pending.splice(dieIdx, 1);
  const partner = pairOf_(state, color, idx), step = partner ? die / 2 : die;
  const old = state.coins[color][idx], dest = old === -1 ? CONFIG.ENTRY : old + step;
  state.lock = null;
  state.coins[color][idx] = dest;
  let pairInfo = null;
  if (partner) {
    const q = state.coins[partner.color][partner.coin];
    state.coins[partner.color][partner.coin] = q + step;
    pairInfo = { color: partner.color, coin: partner.coin, from: q, to: q + step };
  }
  // a pair can kick a pair; a single token cannot kick a pair. No kick when nobody else can play the bonus roll.
  const canKick = hasScope_(state, color, idx, partner);
  const cap = canKick ? capture_(state, color, dest, !!partner) : { captured: [] };
  const noKick = !canKick && dest >= 0 && dest <= CONFIG.TRACK_LAST && wouldKick_(state, color, dest, !!partner);
  const reachedHome = (old !== CONFIG.FINISH && dest === CONFIG.FINISH) || (!!pairInfo && pairInfo.to === CONFIG.FINISH);
  let pairSplit = false;
  if (partner) {
    // The pair travels together until it reaches a safe square (or the home column); then it splits.
    const g = dest <= CONFIG.TRACK_LAST ? (CONFIG.START[color] + dest) % 52 : -1;
    if (dest > CONFIG.TRACK_LAST || pairInfo.to > CONFIG.TRACK_LAST || CONFIG.SAFE.indexOf(g) !== -1) {
      state.pairs = state.pairs.filter(function (p) { return p.indexOf(color + ':' + idx) === -1; }); pairSplit = true;
    }
  }
  cleanPairs_(state);
  state.winner = winnerOf_(state, color) || null;
  state.rolled = false;
  if (!state.winner && (cap.captured.length > 0 || reachedHome)) {
    state.bonus += 1; if (cap.captured.length) state.lockNext = { color: color, coin: idx };
  }
  let extra = false;
  if (state.winner) { state.pending = []; state.bonus = 0; }
  else if (state.pending.length && legalAny_(state)) { state.rolled = true; refreshAllow_(state); }
  else extra = endCycle_(state);
  state.moveSeq = Number(state.moveSeq || 0) + 1;
  state.lastMove = { seq: state.moveSeq, color: color, coin: idx, from: old, to: dest, die: die, captured: cap.captured, reachedHome: reachedHome, pair: pairInfo };
  return { noKick: noKick, paired: !!partner, pairSplit: pairSplit, captured: cap.captured, reachedHome: reachedHome, extraTurn: extra, winner: state.winner, remaining: state.pending.length };
}

function afterLudo_(g) {
  if (g.state.winner) {
    const idx = winnerSeatsLudo_(g, g.state.winner);
    finish_(g, idx, winLabel_(g, idx));
  } else saveGame_(g);
}

function ludoGuard_(g, rev) {
  if (g.type !== 'ludo') throw new Error('This is not a Ludo match.');
  if (g.status !== 'ACTIVE') throw new Error('This match is not running.');
  if (Number(rev) !== g.revision) return { ok: false, conflict: true, game: pub_(g) };
  return null;
}

function seatForTurn_(g) { return g.players.find(function (p) { return p.color === g.state.turn; }); }

/** A fresh chance to pair stops the next roll until the player answers (or 15 seconds pass). */
function offerPending_(state) { return !!(state.offer && nowMs_() - state.offer.t < 15000); }

function ludoRoll(email, id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = ludoGuard_(g, rev); if (bad) return bad;
    const seat = seatForTurn_(g);
    if (!seat || seat.bot || String(seat.email).toLowerCase() !== String(email).toLowerCase()) throw new Error('It is not your turn.');
    if (g.state.rolled || g.state.winner) throw new Error('Move a token first.');
    ludoNorm_(g.state);
    if (offerPending_(g.state) && g.state.offer.color !== seat.color) throw new Error('Wait a moment: a player is deciding whether to pair.');
    g.state.offer = null;
    const info = rollCore_(g.state);
    const ownState = JSON.parse(JSON.stringify(g.state)), steps = botLoop_(g);
    if (steps.length) afterLudo_(g); else saveGame_(g);
    return { ok: true, game: pub_(g), info: info, ownState: steps.length ? ownState : null, steps: steps };
  });
}

function ludoMove(email, id, color, coin, rev, dieIdx) {
  return lockRun_(function () {
    const g = must_(id), bad = ludoGuard_(g, rev); if (bad) return bad;
    const seat = seatForTurn_(g);
    if (!seat || seat.bot || String(seat.email).toLowerCase() !== String(email).toLowerCase()) throw new Error('It is not your turn.');
    ludoNorm_(g.state);
    color = String(color); coin = Number(coin);
    if (!g.state.rolled || color !== g.state.turn) throw new Error('That token cannot move.');
    let di = Number(dieIdx);
    if (!(di >= 0 && di < g.state.pending.length)) di = g.state.pending.findIndex(function (d) { return movable_(g.state, color, d).indexOf(coin) !== -1; });
    if (di < 0 || movable_(g.state, color, g.state.pending[di]).indexOf(coin) === -1) throw new Error('That token cannot move with this roll.');
    g.state.offer = null;
    const info = moveCore_(g.state, color, coin, di);
    const ownState = JSON.parse(JSON.stringify(g.state)), steps = botLoop_(g);
    afterLudo_(g);
    return { ok: true, game: pub_(g), info: info, ownState: steps.length ? ownState : null, steps: steps };
  });
}

/** Declare a pair ('pair') or turn the offer down ('skip'). The player who just landed two tokens together can answer at once. */
function ludoPair(email, id, mode, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = ludoGuard_(g, rev); if (bad) return bad;
    ludoNorm_(g.state);
    const st = g.state, me = g.players.find(function (p) { return !p.bot && String(p.email).toLowerCase() === String(email).toLowerCase(); });
    if (!me) throw new Error('You are only watching this match.');
    const myOffer = st.offer && st.offer.color === me.color;
    if (!myOffer && st.turn !== me.color) throw new Error('It is not your turn.');
    const color = me.color;
    if (mode === 'skip') { st.offer = null; saveGame_(g); return { ok: true, game: pub_(g) }; }
    if (mode === 'split') throw new Error('A pair can only split on a safe square.');
    const cands = pairCandidates_(st, color);
    if (!cands.length) { st.offer = null; saveGame_(g); throw new Error('Put two tokens on the same square first.'); }
    cands.forEach(function (c) { st.pairs.push([c[0], c[1]]); });
    st.offer = null;
    saveGame_(g);
    return { ok: true, game: pub_(g) };
  });
}

/** Any player's browser can nudge a robot to play its turn. One action per call (roll, then move). */
function ludoBot(id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = ludoGuard_(g, rev); if (bad) return bad;
    const seat = seatForTurn_(g);
    if (!seat || !seat.bot) return { ok: false, notBot: true, game: pub_(g) };
    ludoNorm_(g.state); if (offerPending_(g.state)) return { ok: true, waiting: true, game: pub_(g), info: {} };
    g.state.offer = null;
    let info;
    if (!g.state.rolled) { info = rollCore_(g.state); saveGame_(g); }
    else {
      ludoNorm_(g.state); const pick = botChoose_(g.state, g.state.turn);
      info = moveCore_(g.state, g.state.turn, pick.coin, pick.die); afterLudo_(g);
    }
    return { ok: true, game: pub_(g), info: info };
  });
}

/**
 * The match creator can let the robot play for a player who is not rolling or moving (one roll or one move per call).
 */
function ludoIdle(email, id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = ludoGuard_(g, rev); if (bad) return bad;
    if (String(g.createdBy).toLowerCase() !== String(email).toLowerCase()) throw new Error('Only the match creator can use the robot.');
    const seat = seatForTurn_(g);
    if (!seat || seat.bot || g.state.winner) return { ok: false, notIdle: true, game: pub_(g) };
    ludoNorm_(g.state);
    g.state.offer = null;
    let info;
    if (!g.state.rolled) info = rollCore_(g.state);
    else { const pick = botChoose_(g.state, g.state.turn); info = moveCore_(g.state, g.state.turn, pick.coin, pick.die); }
    g.state.auto = { color: seat.color, t: nowMs_() };
    afterLudo_(g);
    return { ok: true, game: pub_(g), info: info, auto: true };
  });
}

/** Plays a whole robot turn (roll, move, bonus rolls...) in ONE call and returns each step so browsers can animate it. */
/** Plays the robot's whole turn (if it is a robot's turn) and returns each step, so a human's move can be answered in the same call. */
function botLoop_(g) {
  const steps = [], seat = seatForTurn_(g);
  if (!seat || !seat.bot || g.state.winner) return steps;
  ludoNorm_(g.state); if (offerPending_(g.state)) return steps;
  g.state.offer = null;
  const startColor = g.state.turn;
  for (let n = 0; n < 40 && !g.state.winner && g.state.turn === startColor; n++) {
    let info;
    if (!g.state.rolled) info = rollCore_(g.state);
    else {
      ludoNorm_(g.state); const pick = botChoose_(g.state, g.state.turn);
      info = moveCore_(g.state, g.state.turn, pick.coin, pick.die);
    }
    steps.push({ state: JSON.parse(JSON.stringify(g.state)), info: info });
  }
  return steps;
}

function ludoBotTurn(id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = ludoGuard_(g, rev); if (bad) return bad;
    const seat = seatForTurn_(g);
    if (!seat || !seat.bot) return { ok: false, notBot: true, game: pub_(g) };
    ludoNorm_(g.state); if (offerPending_(g.state)) return { ok: true, waiting: true, game: pub_(g), steps: [] };
    g.state.offer = null;
    const startColor = g.state.turn, steps = [];
    for (let n = 0; n < 40 && !g.state.winner && g.state.turn === startColor; n++) {
      let info;
      if (!g.state.rolled) info = rollCore_(g.state);
      else {
        ludoNorm_(g.state); const pick = botChoose_(g.state, g.state.turn);
        info = moveCore_(g.state, g.state.turn, pick.coin, pick.die);
      }
      steps.push({ state: JSON.parse(JSON.stringify(g.state)), info: info });
    }
    afterLudo_(g);
    return { ok: true, game: pub_(g), steps: steps };
  });
}

function botScore_(state, color, i) {
  {
    const pr0 = pairOf_(state, color, i), p = state.coins[color][i], dest = p === -1 ? CONFIG.ENTRY : p + (pr0 ? state.dice / 2 : state.dice);
    let s = Math.random() * 3;
    if (p === -1) s += 50;
    if (dest === CONFIG.FINISH) s += 90;
    if (dest > CONFIG.TRACK_LAST && dest < CONFIG.FINISH) s += 35;
    if (dest <= CONFIG.TRACK_LAST) {
      const global = (CONFIG.START[color] + dest) % 52;
      if (CONFIG.SAFE.indexOf(global) !== -1) s += 22;
      const allies = state.teamMode ? teamColors_(color) : [color];
      state.activeColors.forEach(function (o) {
        if (allies.indexOf(o) !== -1) return;
        state.coins[o].forEach(function (q) { if (q >= 0 && q <= CONFIG.TRACK_LAST && (CONFIG.START[o] + q) % 52 === global && CONFIG.SAFE.indexOf(global) === -1) s += 120; });
      });
    }
    s += (p < 0 ? 0 : p) / 8;
    return s;
  }
}

/** The robot looks at every stored roll and every token and plays the best pair. */
function botChoose_(state, color) {
  let best = null;
  state.pending.forEach(function (d, di) {
    const keep = state.dice; state.dice = d;
    movable_(state, color, d).forEach(function (i) { const s = botScore_(state, color, i); if (!best || s > best.s) best = { die: di, coin: i, s: s }; });
    state.dice = keep;
  });
  return best;
}

// ----------------------------------------------------------------------------
// Chess (moves are validated by chess.js in the browsers)
// ----------------------------------------------------------------------------
/** Whose turn it is. The board position (FEN) is the truth, the stored turn is only a fallback. */
function chessTurn_(g) {
  const parts = String(g.state.fen || '').split(' ');
  return parts[1] === 'w' || parts[1] === 'b' ? parts[1] : g.state.turn;
}

function chessApply_(g, mv) {
  const turn = chessTurn_(g);
  if (mv.end) {   // the side to move has no legal move: just record the result
    g.state.turn = turn;
  } else {
    g.state.fen = String(mv.fen || ''); g.state.moves.push(String(mv.san || ''));
    const np = String(mv.fen || '').split(' ')[1];
    g.state.turn = np === 'w' || np === 'b' ? np : (turn === 'w' ? 'b' : 'w');
    g.state.lastMove = { from: String(mv.from || ''), to: String(mv.to || ''), capture: !!mv.capture, check: !!mv.check };
  }
  const over = String(mv.over || '');
  if (over === 'w' || over === 'b') {
    const w = over === 'w' ? 0 : 1;
    finish_(g, [w], g.players[w].name + ' won by checkmate');
  } else if (over === 'draw') draw_(g, 'The game is a draw');
  else saveGame_(g);
}

function chessMove(email, id, mv, rev) {
  return lockRun_(function () {
    const g = must_(id);
    if (g.type !== 'chess' || g.status !== 'ACTIVE') throw new Error('This chess match is not running.');
    if (Number(rev) !== g.revision) return { ok: false, conflict: true, game: pub_(g) };
    const idx = seatOf_(g, email);
    const turn = chessTurn_(g);
    if (idx === -1 || (turn === 'w' ? 0 : 1) !== idx) throw new Error('It is not your turn.');
    chessApply_(g, mv);
    return { ok: true, game: pub_(g) };
  });
}

/** The robot's move is worked out in a player's browser and saved here. Only allowed when it is the robot's turn. */
function chessBotMove(email, id, mv, rev) {
  return lockRun_(function () {
    const g = must_(id);
    if (g.type !== 'chess' || g.status !== 'ACTIVE') throw new Error('This chess match is not running.');
    if (Number(rev) !== g.revision) return { ok: false, conflict: true, game: pub_(g) };
    if (seatOf_(g, email) === -1) throw new Error('You are only watching this match.');
    const botIdx = chessTurn_(g) === 'w' ? 0 : 1;
    if (!g.players[botIdx] || !g.players[botIdx].bot) throw new Error('It is not the robot\'s turn.');
    chessApply_(g, mv);
    return { ok: true, game: pub_(g) };
  });
}

// ----------------------------------------------------------------------------
// Resign / chat
// ----------------------------------------------------------------------------
function resignGame(email, id) {
  return lockRun_(function () {
    const g = must_(id), idx = seatOf_(g, email);
    if (g.status === 'LOBBY') return String(g.createdBy).toLowerCase() === String(email).toLowerCase() ? cancelNow_(g, 'Cancelled by the host') : leaveLobby_(g, email);
    if (g.status !== 'ACTIVE') return { ok: true, game: pub_(g) };
    if (idx === -1) throw new Error('You are only watching this match.');
    const me = g.players[idx];
    if (g.type === 't29') {
      const wt = idx % 2 === 0 ? 1 : 0, winners = t29Team_(g, wt);
      g.state.phase = 'over'; g.state.winnerTeam = wt;
      finish_(g, winners, me.name + ' resigned. Team ' + winners.map(function (i) { return g.players[i].name; }).join(' & ') + ' won');
      return { ok: true, game: pub_(g), mine: null };
    }
    if (g.type === 'mono') {
      const st0 = g.state;
      if (st0.bankrupt[idx]) return { ok: true, game: pub_(g) };
      monoPay_(st0, idx, -1, 999999, 'silent'); monoLog_(st0, me.name + ' resigned.');
      if (st0.turn === idx && !monoCheckWinner_(st0)) monoNextTurn_(st0);
      afterMono_(g);
      return { ok: true, game: pub_(g) };
    }
    if (g.type === 'chess') { const w = idx === 0 ? 1 : 0; finish_(g, [w], me.name + ' resigned. ' + g.players[w].name + ' won'); return { ok: true, game: pub_(g) }; }
    const st = g.state, active = st.activeColors.slice();
    if (active.indexOf(me.color) === -1) return { ok: true, game: pub_(g) };
    if (st.teamMode || active.length <= 2) {
      const winners = g.players.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return st.teamMode ? teamOf_(x.p.color) !== teamOf_(me.color) : x.p.color !== me.color; }).map(function (x) { return x.i; });
      st.winner = st.teamMode ? (teamOf_(me.color) === 'A' ? 'team-green-blue' : 'team-red-yellow') : g.players[winners[0]].color;
      finish_(g, winners, me.name + ' resigned. ' + winLabel_(g, winners));
    } else {
      const next = nextActive_(st, me.color);
      st.activeColors = active.filter(function (c) { return c !== me.color; });
      me.resigned = true;
      if (st.turn === me.color) { st.turn = next; st.rolled = false; st.pending = []; st.bonus = 0; st.lock = null; st.lockNext = null; }
      if (st.pairs) { st.pairs = st.pairs.filter(function (p) { return splitK_(p[0]).color !== me.color && splitK_(p[1]).color !== me.color; }); }
      saveGame_(g);
    }
    return { ok: true, game: pub_(g) };
  });
}

/** Emoji / short chat. Does not change the game revision, so it never blocks a move. */
function react(email, id, emoji, text) {
  return lockRun_(function () {
    const g = must_(id), u = getUser_(email);
    const last = g.chat.length ? g.chat[g.chat.length - 1].seq : 0;
    g.chat.push({ seq: last + 1, by: u ? u.name : 'Guest', email: String(email).toLowerCase(), emoji: clean_(emoji, 8), text: clean_(text, 100), t: nowMs_() });
    g.chat = g.chat.slice(-14);
    saveGame_(g, false);
    return { ok: true, seq: last + 1 };
  });
}
