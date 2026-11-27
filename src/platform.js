/**
 * Browser stand-ins for the few storage services the engine uses (it was first written for Google Apps Script).
 * - SpreadsheetApp: small in-memory tables ("sheets"), saved in localStorage
 * - CacheService:   an in-memory map; live copies of running matches are saved too
 * - LockService:    a no-op (the browser runs one call at a time)
 * - Utilities:      random ids
 * This file is wrapped together with the engine in one function scope by tools/build.js.
 */
const HubStore = (function () {
  const KEY = 'mgh_db_v1', KEEP_GAMES = 120;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  // One-time move of data saved under the app's first key names (kg_*) to the current ones (mgh_*).
  try {
    Object.keys(localStorage).filter(k => k.indexOf('kg_') === 0).forEach(k => {
      const nk = 'mgh_' + k.slice(3);
      if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    });
  } catch (e) { /* storage blocked: nothing to move */ }
  function rid(n) {
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789', b = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(b);
    let s = ''; for (let i = 0; i < n; i++) s += abc[b[i] % 36];
    return s;
  }

  // This device's id. Every match it hosts starts with it, so friends know whom to connect to.
  let hostTag = lsGet('mgh_host') || '';
  if (!/^[a-z0-9]{8}$/.test(hostTag)) { hostTag = rid(8); lsSet('mgh_host', hostTag); }

  let db = null;
  try { db = JSON.parse(lsGet(KEY) || 'null'); } catch (e) { db = null; }
  if (!db || typeof db !== 'object') db = {};
  db.sheets = db.sheets || {}; db.cache = db.cache || {};
  const cache = new Map(Object.keys(db.cache).map(k => [k, db.cache[k]]));
  let dirty = false;

  /** Keeps only the newest matches, then fixes the row numbers remembered by the live copies. */
  function prune(keep) {
    const t = db.sheets.Games; if (!t || t.d.length - 1 <= keep) return;
    t.d = [t.d[0]].concat(t.d.slice(-keep));
    const col = t.d[0].indexOf('id'), rowOf = {};
    t.d.forEach((r, i) => { if (i) rowOf[String(r[col])] = i + 1; });
    Array.from(cache.keys()).forEach(k => {
      if (k.indexOf('f:') !== 0) return;
      try { const g = JSON.parse(cache.get(k)); if (rowOf[g.id]) { g._row = rowOf[g.id]; cache.set(k, JSON.stringify(g)); } else cache.delete(k); } catch (e) { cache.delete(k); }
    });
    dirty = true;
  }
  prune(KEEP_GAMES);

  class Sheet {
    constructor(t) { this.t = t; }
    getLastRow() { return this.t.d.length; }
    getLastColumn() { return this.t.cols; }
    getMaxRows() { return 1000; }
    setFrozenRows() { }
    getRange(r, c, nr, nc) {
      const t = this.t; nr = nr || 1; nc = nc || 1;
      return {
        getValues() {
          const o = [];
          for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (t.d[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined || v === null ? '' : v); } o.push(row); }
          return o;
        },
        setValues(v) {
          for (let i = 0; i < nr; i++) { t.d[r - 1 + i] = t.d[r - 1 + i] || []; for (let j = 0; j < nc; j++) t.d[r - 1 + i][c - 1 + j] = v[i][j]; }
          t.cols = Math.max(t.cols, c - 1 + nc); dirty = true;
        },
        setValue(v) { t.d[r - 1] = t.d[r - 1] || []; t.d[r - 1][c - 1] = v; t.cols = Math.max(t.cols, c); dirty = true; },
        setNumberFormat() { }
      };
    }
    getDataRange() {
      const t = this.t;
      return { getValues: () => t.d.map(r => { const o = []; for (let j = 0; j < t.cols; j++) o.push(r[j] === undefined || r[j] === null ? '' : r[j]); return o; }) };
    }
    appendRow(a) { this.t.d.push(a.slice()); this.t.cols = Math.max(this.t.cols, a.length); dirty = true; }
    deleteRow(i) { this.t.d.splice(i - 1, 1); dirty = true; }
  }
  const sheets = {};
  function sheet(name, create) {
    if (sheets[name]) return sheets[name];
    if (!db.sheets[name]) { if (!create) return null; db.sheets[name] = { d: [], cols: 0 }; dirty = true; }
    return (sheets[name] = new Sheet(db.sheets[name]));
  }

  const cacheApi = {
    get: k => (cache.has(k) ? cache.get(k) : null),
    put: (k, v) => { cache.set(k, v); if (k.indexOf('f:') === 0) dirty = true; },
    remove: k => { if (cache.delete(k) && k.indexOf('f:') === 0) dirty = true; },
    removeAll: ks => ks.forEach(k => cacheApi.remove(k)),
    getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; }
  };

  /** Writes everything to localStorage (only after a change). Live copies are kept only for running matches. */
  function save() {
    if (!dirty) return;
    const keep = {};
    cache.forEach((v, k) => {
      if (k.indexOf('f:') !== 0) return;
      try { if (JSON.parse(v).status === 'ACTIVE') keep[k] = v; } catch (e) { /* skip */ }
    });
    db.cache = keep;
    if (!lsSet(KEY, JSON.stringify(db))) { prune(30); db.cache = keep; lsSet(KEY, JSON.stringify(db)); }
    dirty = false;
  }

  return { hostTag: hostTag, rid: rid, sheet: sheet, cacheApi: cacheApi, save: save };
})();

const SpreadsheetApp = { openById: () => ({ getSheetByName: n => HubStore.sheet(n, false), insertSheet: n => HubStore.sheet(n, true) }) };
const CacheService = { getScriptCache: () => HubStore.cacheApi };
const LockService = { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) };
const Utilities = {
  getUuid: () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : HubStore.rid(32))
};
