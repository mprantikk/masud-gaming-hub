/**
 * Masud Gaming Hub - extra games: Twenty-Nine (29, "Queen marriage") and Monopoly (Dhaka edition).
 * This file belongs next to Code.gs in the same Apps Script project. It needs no setup of its own.
 */

// ============================================================================
// Shared helpers
// ============================================================================
function shuffle_(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

function seatGuard_(g, type, rev) {
  if (g.type !== type) throw new Error('This is a different kind of match.');
  if (g.status !== 'ACTIVE') throw new Error('This match is not running.');
  if (Number(rev) !== g.revision) return { ok: false, conflict: true, game: pub_(g), mine: mineFor_(g, '') };
  return null;
}

function humanAt_(g, seat, email) {
  const p = g.players[seat];
  return !!p && !p.bot && String(p.email).toLowerCase() === String(email || '').toLowerCase();
}

/** What only this player may see (their own cards). */
function mineFor_(g, email) {
  if (g.type !== 't29' || !g.state || !g.state.hands) return null;
  const seat = seatOf_(g, email);
  if (seat === -1) return null;
  return t29Mine_(g.state, seat);
}

function reply_(g, email, extra) {
  const out = { ok: true, game: pub_(g), mine: mineFor_(g, email) };
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return out;
}

// ============================================================================
// TWENTY-NINE
// Four players, two teams (seats 1+3 against seats 2+4). 32 cards. J > 9 > A > 10 > K > Q > 8 > 7.
// Points: J=3, 9=2, A=1, 10=1 (28 in total) + 1 for the last trick = 29.
// Hidden trump: the bidder puts one card face down. The trump suit is shown only when somebody who cannot
// follow suit asks for it (or when the bidder has to play that card as the very last one).
// ============================================================================
const T29_RANKS = ['J', '9', 'A', 'T', 'K', 'Q', '8', '7'];
const T29_PTS = { J: 3, '9': 2, A: 1, T: 1, K: 0, Q: 0, '8': 0, '7': 0 };
const T29_SUITS = ['S', 'H', 'D', 'C'];
const T29_MIN_BID = 16, T29_MAX_BID = 29, T29_WIN = 6;

function t29Rank_(c) { return c.charAt(0); }
function t29Suit_(c) { return c.charAt(1); }
function t29Str_(c) { return 8 - T29_RANKS.indexOf(t29Rank_(c)); }
function t29Pts_(c) { return T29_PTS[t29Rank_(c)] || 0; }
function t29Sort_(hand) {
  return hand.sort(function (a, b) {
    const sa = T29_SUITS.indexOf(t29Suit_(a)), sb = T29_SUITS.indexOf(t29Suit_(b));
    return sa !== sb ? sa - sb : t29Str_(b) - t29Str_(a);
  });
}

function t29Deal_(st) {
  const deck = [];
  T29_SUITS.forEach(function (s) { T29_RANKS.forEach(function (r) { deck.push(r + s); }); });
  shuffle_(deck);
  st.hands = [0, 1, 2, 3].map(function () { return t29Sort_(deck.splice(0, 4)); });
  st.deck = deck;
  st.phase = 'bid'; st.bidTurn = (st.dealer + 1) % 4; st.high = 0; st.highSeat = -1; st.passed = [false, false, false, false];
  st.bidLog = []; st.trump = null; st.hiddenCard = null; st.revealed = false; st.revealIdx = null; st.revealBy = -1; st.mustTrump = -1;
  st.bidder = -1; st.target = 0; st.turn = -1; st.trick = []; st.tricksWon = [0, 0]; st.tricks = 0; st.pts = [0, 0];
  st.pair = null; st.last = null; st.summary = null; st.hasHidden = false;
}

function t29Init_() {
  const st = { ver: 2, dealer: Math.floor(Math.random() * 4), game: [0, 0], hand: 1, seq: 0, winnerTeam: -1, notice: '' };
  t29Deal_(st);
  return st;
}

function t29TeamOf_(seat) { return seat % 2; }

function t29Follows_(st, hand) {
  if (!st.trick.length) return hand.slice();
  const lead = t29Suit_(st.trick[0].card);
  return hand.filter(function (c) { return t29Suit_(c) === lead; });
}

function t29Legal_(st, seat) {
  if (st.phase !== 'play' || st.turn !== seat) return [];
  const hand = st.hands[seat];
  if (!hand.length && st.hiddenCard && seat === st.bidder) return [st.hiddenCard];   // the very last card is the hidden trump card
  if (!st.trick.length) return hand.slice();
  const follow = t29Follows_(st, hand);
  if (follow.length) return follow;
  if (st.mustTrump === seat && st.trump) {                                            // you asked for the trump: you must cut if you can
    const tr = hand.filter(function (c) { return t29Suit_(c) === st.trump; });
    if (tr.length) return tr;
  }
  return hand.slice();
}

function t29CanShow_(st, seat) {
  if (st.phase !== 'play' || st.turn !== seat || st.revealed || !st.hiddenCard || !st.trick.length) return false;
  const hand = st.hands[seat];
  return hand.length > 0 && t29Follows_(st, hand).length === 0;
}

function t29CanPair_(st, seat) {
  if (st.phase !== 'play' || st.pair || !st.revealed || !st.trump || st.turn !== seat) return false;
  if (st.tricksWon[t29TeamOf_(seat)] < 1) return false;
  const h = st.hands[seat];
  return h.indexOf('K' + st.trump) !== -1 && h.indexOf('Q' + st.trump) !== -1;
}

function t29Mine_(st, seat) {
  return { seat: seat, hand: st.hands[seat].slice(), legal: t29Legal_(st, seat), canPair: t29CanPair_(st, seat), canShow: t29CanShow_(st, seat),
    hidden: seat === st.bidder && st.hiddenCard ? st.hiddenCard : null };
}

/** Everything except the cards in hand (and the hidden trump card) is public. */
function t29Public_(st) {
  const o = {};
  Object.keys(st).forEach(function (k) { if (k !== 'hands' && k !== 'deck' && k !== 'hiddenCard') o[k] = st[k]; });
  o.counts = st.hands.map(function (h) { return h.length; });
  return o;
}

function t29Bid_(st, seat, bid) {
  if (st.phase !== 'bid' || st.bidTurn !== seat) throw new Error('It is not your turn to bid.');
  bid = Math.floor(Number(bid) || 0);
  if (bid > 0) {
    if (bid < T29_MIN_BID || bid > T29_MAX_BID) throw new Error('Bid between ' + T29_MIN_BID + ' and ' + T29_MAX_BID + '.');
    if (bid <= st.high) throw new Error('Bid higher than ' + st.high + ' or pass.');
    st.high = bid; st.highSeat = seat;
    st.bidLog.push({ seat: seat, bid: bid });
  } else {
    st.passed[seat] = true;
    st.bidLog.push({ seat: seat, bid: 0 });
  }
  const active = [0, 1, 2, 3].filter(function (s) { return !st.passed[s]; });
  if (st.highSeat === -1 && !active.length) {            // everybody passed: deal again
    st.dealer = (st.dealer + 1) % 4; st.redeals = Number(st.redeals || 0) + 1;
    t29Deal_(st); st.notice = 'Everyone passed. New cards were dealt.';
    return;
  }
  if (st.highSeat !== -1 && (active.length === 1 || st.high >= T29_MAX_BID)) {
    st.phase = 'trump'; st.bidder = st.highSeat; st.target = st.high; st.notice = '';
    return;
  }
  let s = (seat + 1) % 4;
  while (st.passed[s]) s = (s + 1) % 4;
  st.bidTurn = s;
}

/** The bidder hides one card face down: its suit becomes the trump suit (shown later). Then 4 more cards are dealt. */
function t29Trump_(st, seat, card) {
  if (st.phase !== 'trump' || st.bidder !== seat) throw new Error('You choose the trump card only after winning the bid.');
  card = String(card);
  const i = st.hands[seat].indexOf(card);
  if (i === -1) throw new Error('Pick one of your own cards.');
  st.hands[seat].splice(i, 1); st.hiddenCard = card; st.hasHidden = true;
  for (let k = 0; k < 4; k++) st.hands[k] = t29Sort_(st.hands[k].concat(st.deck.splice(0, 4)));
  st.phase = 'play'; st.turn = (st.dealer + 1) % 4; st.trick = []; st.notice = '';
}

function t29IsTrump_(st, c, idx) { return st.revealed && !!st.trump && t29Suit_(c) === st.trump && idx >= (st.revealIdx || 0); }

function t29TrickWinner_(st, trick) {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const a = trick[i].card, b = trick[best].card, ta = t29IsTrump_(st, a, i), tb = t29IsTrump_(st, b, best);
    if (ta !== tb) { if (ta) best = i; }
    else if (t29Suit_(a) === t29Suit_(b) && t29Str_(a) > t29Str_(b)) best = i;
  }
  return trick[best].seat;
}

function t29Reveal_(st, by) {
  st.revealed = true; st.trump = t29Suit_(st.hiddenCard); st.revealIdx = st.trick.length; st.revealBy = by;
  st.hands[st.bidder] = t29Sort_(st.hands[st.bidder].concat([st.hiddenCard])); st.hiddenCard = null; st.hasHidden = false;
}

function t29Show_(st, seat) {
  if (!t29CanShow_(st, seat)) throw new Error('You can ask for the trump only when you cannot follow the suit.');
  t29Reveal_(st, seat); st.mustTrump = seat;
}

function t29Play_(st, seat, card) {
  if (st.phase !== 'play' || st.turn !== seat) throw new Error('It is not your turn.');
  card = String(card);
  const legal = t29Legal_(st, seat);
  if (legal.indexOf(card) === -1) throw new Error(st.mustTrump === seat ? 'You asked for the trump, so you must play a trump card.' : 'You must follow the suit that was led.');
  if (st.hiddenCard && card === st.hiddenCard) {                 // last card of the bidder: the trump card turns face up as it is played
    t29Reveal_(st, seat);
  }
  const hand = st.hands[seat];
  hand.splice(hand.indexOf(card), 1);
  if (st.mustTrump === seat) st.mustTrump = -1;
  st.trick.push({ seat: seat, card: card });
  st.seq++; st.notice = '';
  const info = { trickDone: false };
  if (st.trick.length < 4) { st.turn = (seat + 1) % 4; return info; }
  const winner = t29TrickWinner_(st, st.trick);
  let pts = 0; st.trick.forEach(function (x) { pts += t29Pts_(x.card); });
  const team = t29TeamOf_(winner), lastTrick = st.tricks === 7;
  if (lastTrick) pts += 1;
  st.pts[team] += pts; st.tricksWon[team]++; st.tricks++;
  st.last = { cards: st.trick.slice(), winner: winner, pts: pts, seq: st.seq, final: lastTrick, trump: st.trump };
  st.trick = []; st.turn = winner; st.revealIdx = st.revealed ? 0 : null; info.trickDone = true; info.winner = winner;
  if (lastTrick) t29EndHand_(st);
  return info;
}

function t29Pair_(st, seat) {
  if (!t29CanPair_(st, seat)) throw new Error('You cannot declare the marriage now.');
  const team = t29TeamOf_(seat), bidTeam = t29TeamOf_(st.bidder);
  st.pair = { seat: seat, team: team };
  if (team === bidTeam) st.target = Math.max(T29_MIN_BID, st.target - 4); else st.target = st.target + 4;
  st.notice = 'Marriage declared: King + Queen of trumps. The target is now ' + st.target + '.';
}

function t29EndHand_(st) {
  const bidTeam = t29TeamOf_(st.bidder), made = st.pts[bidTeam] >= st.target;
  st.game[bidTeam] += made ? 1 : -1;
  st.summary = { bidder: st.bidder, bidTeam: bidTeam, target: st.target, pts: st.pts.slice(), made: made, game: st.game.slice(), hand: st.hand, trump: st.trump };
  st.winnerTeam = -1;
  if (st.game[0] >= T29_WIN || st.game[1] <= -T29_WIN) st.winnerTeam = 0;
  else if (st.game[1] >= T29_WIN || st.game[0] <= -T29_WIN) st.winnerTeam = 1;
  if (st.winnerTeam === -1 && st.hand >= 25) { st.winnerTeam = st.game[0] >= st.game[1] ? 0 : 1; st.capped = true; }
  st.phase = st.winnerTeam === -1 ? 'summary' : 'over';
}

function t29Next_(st) {
  if (st.phase !== 'summary') throw new Error('The hand is not finished yet.');
  st.dealer = (st.dealer + 1) % 4; st.hand++;
  t29Deal_(st);
}

// ---- robot -----------------------------------------------------------------
function t29SuitScore_(hand, suit) {
  const val = { J: 5, '9': 4, A: 3, T: 2, K: 2, Q: 1, '8': 0.5, '7': 0 };
  let sc = 0;
  hand.forEach(function (c) {
    if (t29Suit_(c) === suit) sc += val[t29Rank_(c)] * 1.5 + 1.5;
    else if (t29Rank_(c) === 'J') sc += 1.5; else if (t29Rank_(c) === 'A') sc += 1;
  });
  return sc;
}
function t29BestSuit_(hand) {
  let best = null, bs = -1;
  T29_SUITS.forEach(function (s) {
    if (!hand.some(function (c) { return t29Suit_(c) === s; })) return;
    const v = t29SuitScore_(hand, s); if (v > bs) { bs = v; best = s; }
  });
  return { suit: best, score: bs };
}

function t29BotAct_(st, seat) {
  if (st.phase === 'bid') {
    const b = t29BestSuit_(st.hands[seat]);
    const want = b.score >= 13 ? Math.min(22, T29_MIN_BID + Math.floor((b.score - 13) / 2)) : 0;
    const need = Math.max(T29_MIN_BID, st.high + 1);
    t29Bid_(st, seat, want >= need ? need : 0);
    return;
  }
  if (st.phase === 'trump') {
    const suit = t29BestSuit_(st.hands[seat]).suit;
    const cards = st.hands[seat].filter(function (c) { return t29Suit_(c) === suit; }).sort(function (a, b) { return (t29Pts_(a) - t29Pts_(b)) || (t29Str_(a) - t29Str_(b)); });
    t29Trump_(st, seat, cards[0]); return;
  }
  if (st.phase !== 'play') return;
  if (t29CanPair_(st, seat)) { t29Pair_(st, seat); return; }
  const known = st.revealed ? st.trump : (seat === st.bidder && st.hiddenCard ? t29Suit_(st.hiddenCard) : null);
  const myTeam = t29TeamOf_(seat), bidTeam = t29TeamOf_(st.bidder);
  if (t29CanShow_(st, seat)) {
    const partnerWinning = t29TeamOf_(t29TrickWinner_(st, st.trick)) === myTeam;
    const hasTrump = seat === st.bidder ? st.hands[seat].some(function (c) { return t29Suit_(c) === known; }) : true;
    if (!partnerWinning && hasTrump && (seat === st.bidder || Math.random() < 0.7)) { t29Show_(st, seat); return; }
  }
  const legal = t29Legal_(st, seat);
  const lowest = function (arr) { return arr.slice().sort(function (a, b) { return (t29Pts_(a) - t29Pts_(b)) || (t29Str_(a) - t29Str_(b)); })[0]; };
  const strongest = function (arr) { return arr.slice().sort(function (a, b) { return t29Str_(b) - t29Str_(a); })[0]; };
  let pick;
  if (legal.length === 1) pick = legal[0];
  else if (!st.trick.length) {
    const mineTeam = myTeam === bidTeam;
    const trumps = known ? legal.filter(function (c) { return t29Suit_(c) === known; }) : [];
    const strong = legal.filter(function (c) { return t29Suit_(c) !== known && (t29Rank_(c) === 'J' || t29Rank_(c) === '9' || t29Rank_(c) === 'A'); });
    if (mineTeam && st.revealed && trumps.length && (trumps.indexOf('J' + known) !== -1 || trumps.indexOf('9' + known) !== -1)) pick = strongest(trumps);
    else if (strong.length) pick = strongest(strong);
    else pick = lowest(legal.filter(function (c) { return t29Suit_(c) !== known; }).length ? legal.filter(function (c) { return t29Suit_(c) !== known; }) : legal);
  } else {
    const curWin = t29TrickWinner_(st, st.trick), partnerWinning = t29TeamOf_(curWin) === myTeam, last = st.trick.length === 3;
    if (partnerWinning) pick = last ? legal.slice().sort(function (a, b) { return t29Pts_(b) - t29Pts_(a); })[0] : lowest(legal);
    else {
      const winners = legal.filter(function (c) { return t29TrickWinner_(st, st.trick.concat([{ seat: seat, card: c }])) === seat; });
      pick = winners.length ? winners.sort(function (a, b) { return t29Str_(a) - t29Str_(b); })[0] : lowest(legal);
    }
  }
  t29Play_(st, seat, pick);
}

function t29Actor_(st) {
  if (st.phase === 'bid') return st.bidTurn;
  if (st.phase === 'trump') return st.bidder;
  if (st.phase === 'play') return st.turn;
  return -1;
}

function t29Team_(g, team) {
  return g.players.map(function (p, i) { return i; }).filter(function (i) { return i % 2 === team; });
}

function afterT29_(g) {
  if (g.state.phase === 'over') {
    const idx = t29Team_(g, g.state.winnerTeam), names = idx.map(function (i) { return g.players[i].name; }).join(' & ');
    finish_(g, idx, 'Team ' + names + ' won (' + g.state.game[0] + ' : ' + g.state.game[1] + ')');
  } else saveGame_(g);
}

function t29Seat_(g, email) {
  const seat = seatOf_(g, email);
  if (seat === -1) throw new Error('You are only watching this match.');
  return seat;
}

function t29Bid(email, id, bid, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 't29', rev); if (bad) return bad;
    t29Bid_(g.state, t29Seat_(g, email), bid); afterT29_(g);
    return reply_(g, email);
  });
}
function t29Trump(email, id, card, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 't29', rev); if (bad) return bad;
    t29Trump_(g.state, t29Seat_(g, email), card); afterT29_(g);
    return reply_(g, email);
  });
}
function t29Play(email, id, card, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 't29', rev); if (bad) return bad;
    const info = t29Play_(g.state, t29Seat_(g, email), card); afterT29_(g);
    return reply_(g, email, { info: info });
  });
}
function t29ShowTrump(email, id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 't29', rev); if (bad) return bad;
    t29Show_(g.state, t29Seat_(g, email)); afterT29_(g);
    return reply_(g, email);
  });
}
function t29PairCall(email, id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 't29', rev); if (bad) return bad;
    t29Pair_(g.state, t29Seat_(g, email)); afterT29_(g);
    return reply_(g, email);
  });
}
function t29NextHand(email, id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 't29', rev); if (bad) return bad;
    t29Seat_(g, email); t29Next_(g.state); afterT29_(g);
    return reply_(g, email);
  });
}
/** Any player's browser can nudge a robot to act. One robot action per call. */
function t29Bot(email, id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 't29', rev); if (bad) return bad;
    const st = g.state, seat = t29Actor_(st);
    if (seat === -1 || !g.players[seat].bot) return { ok: false, notBot: true, game: pub_(g), mine: mineFor_(g, email) };
    t29BotAct_(st, seat); afterT29_(g);
    return reply_(g, email);
  });
}

// ============================================================================
// BUSINESS (Monopoly-style, with Dhaka places)
// ============================================================================
const MONO_GROUPS = {
  brown: { cost: 50, color: '#8b5a3c' }, sky: { cost: 50, color: '#8fd3f4' }, pink: { cost: 100, color: '#e86aa6' }, orange: { cost: 100, color: '#f39c3d' },
  red: { cost: 150, color: '#e0463c' }, yellow: { cost: 150, color: '#f1d02f' }, green: { cost: 200, color: '#2e9e5b' }, navy: { cost: 200, color: '#2b4c9b' }
};

function mP_(name, group, price, rent) { return { t: 'prop', n: name, g: group, p: price, r: rent }; }
const MONO_BOARD = [
  { t: 'go', n: 'START' },
  mP_('Kamrangirchar', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { t: 'fortune', n: 'Fortune Box' },
  mP_('Jatrabari', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { t: 'tax', n: 'Income Tax', v: 200 },
  { t: 'rail', n: 'Kamalapur Station', p: 200 },
  mP_('Mirpur', 'sky', 100, [6, 30, 90, 270, 400, 550]),
  { t: 'chance', n: 'Surprise' },
  mP_('Mohammadpur', 'sky', 100, [6, 30, 90, 270, 400, 550]),
  mP_('Uttara', 'sky', 120, [8, 40, 100, 300, 450, 600]),
  { t: 'jail', n: 'Jail (visiting)' },
  mP_('Farmgate', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  { t: 'util', n: 'Electricity', p: 150 },
  mP_('Tejgaon', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  mP_('Karwan Bazar', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  { t: 'rail', n: 'Airport Station', p: 200 },
  mP_('Malibagh', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { t: 'fortune', n: 'Fortune Box' },
  mP_('Rampura', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  mP_('Badda', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { t: 'free', n: 'Tea Break' },
  mP_('Motijheel', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { t: 'chance', n: 'Surprise' },
  mP_('Paltan', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  mP_('Shahbagh', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  { t: 'rail', n: 'Tongi Station', p: 200 },
  mP_('Dhanmondi', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  mP_('Lalmatia', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  { t: 'util', n: 'Water Supply', p: 150 },
  mP_('Gulshan 1', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { t: 'gotojail', n: 'Go to Jail' },
  mP_('Banani', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  mP_('Baridhara', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { t: 'fortune', n: 'Fortune Box' },
  mP_('Gulshan 2', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  { t: 'rail', n: 'Cantonment Station', p: 200 },
  { t: 'chance', n: 'Surprise' },
  mP_('Bashundhara', 'navy', 350, [35, 175, 500, 1100, 1300, 1500]),
  { t: 'tax', n: 'Luxury Tax', v: 100 },
  mP_('Hatirjheel', 'navy', 400, [50, 200, 600, 1400, 1700, 2000])
];

const MONO_CARDS = [
  { x: 'Your cousin sends you a wedding gift. Collect 100.', t: 'cash', v: 100 },
  { x: 'You win a quiz show. Collect 150.', t: 'cash', v: 150 },
  { x: 'Bank error in your favour. Collect 200.', t: 'cash', v: 200 },
  { x: 'You sell old furniture. Collect 50.', t: 'cash', v: 50 },
  { x: 'Traffic jam fine. Pay 50.', t: 'cash', v: -50 },
  { x: 'Doctor visit. Pay 100.', t: 'cash', v: -100 },
  { x: 'School fees. Pay 150.', t: 'cash', v: -150 },
  { x: 'Advance to START. Collect 200.', t: 'move', to: 0 },
  { x: 'Take a rickshaw to Gulshan 2.', t: 'move', to: 34 },
  { x: 'Take a bus to Kamalapur Station.', t: 'move', to: 5 },
  { x: 'Go back 3 spaces.', t: 'back', v: 3 },
  { x: 'Go directly to Jail.', t: 'jail' },
  { x: 'It is your birthday! Every player gives you 20.', t: 'each', v: 20 },
  { x: 'You host a dinner. Pay every player 25.', t: 'each', v: -25 }
];

function monoPlayers_(st) { return st.cash.length; }
function monoOwned_(st, seat) { return Object.keys(st.owner).filter(function (k) { return st.owner[k] === seat; }).map(Number); }
function monoGroup_(group) { const out = []; MONO_BOARD.forEach(function (s, i) { if (s.t === 'prop' && s.g === group) out.push(i); }); return out; }
function monoPrice_(i) { const s = MONO_BOARD[i]; return s.p; }
function monoHasSet_(st, seat, group) { return monoGroup_(group).every(function (i) { return st.owner[i] === seat; }); }
function monoEv_(st, ev) { if (!st.ev) st.ev = []; st.evSeq = (st.evSeq || 0) + 1; ev.n = st.evSeq; st.ev.push(ev); if (st.ev.length > 70) st.ev = st.ev.slice(-70); }
function monoLog_(st, text) { st.seq++; st.log.push({ seq: st.seq, p: st.turn, text: text }); st.log = st.log.slice(-12); }

function monoInit_(n, mode) {
  const z = function (v) { const a = []; for (let i = 0; i < n; i++) a.push(v); return a; };
  return { ver: 1, mode: mode, turn: 0, phase: 'roll', dice: [0, 0], rollSeq: 0, moveSeq: 0, doubles: 0, again: false, pending: null,
    cash: z(mode === 'QUICK' ? 1000 : 1500), pos: z(0), jail: z(false), tries: z(0), bankrupt: z(false), owner: {}, houses: {}, mort: {},
    ev: [], evSeq: 0, round: 1, maxRound: mode === 'QUICK' ? 20 : 100, winner: -1, log: [], seq: 0, lastMove: null, card: null };
}

function monoRent_(st, idx, dice) {
  const s = MONO_BOARD[idx], owner = st.owner[idx];
  if (st.mort[idx]) return 0;
  if (s.t === 'prop') {
    const h = st.houses[idx] || 0;
    if (h > 0) return s.r[h];
    return monoHasSet_(st, owner, s.g) ? s.r[0] * 2 : s.r[0];
  }
  if (s.t === 'rail') {
    const c = monoOwned_(st, owner).filter(function (i) { return MONO_BOARD[i].t === 'rail'; }).length;
    return [0, 25, 50, 100, 200][c];
  }
  const u = monoOwned_(st, owner).filter(function (i) { return MONO_BOARD[i].t === 'util'; }).length;
  return (dice[0] + dice[1]) * (u >= 2 ? 10 : 4);
}

function monoWorth_(st, seat) {
  let w = st.cash[seat];
  monoOwned_(st, seat).forEach(function (i) {
    const s = MONO_BOARD[i];
    w += st.mort[i] ? s.p / 2 : s.p;
    if (s.t === 'prop') w += (st.houses[i] || 0) * MONO_GROUPS[s.g].cost;
  });
  return w;
}

function monoAlive_(st) { return st.cash.map(function (c, i) { return i; }).filter(function (i) { return !st.bankrupt[i]; }); }

/** Pays money. Sells buildings and mortgages property automatically when cash runs short. Returns true if the payer went bankrupt. */
function monoPay_(st, from, to, amount, why) {
  if (amount <= 0) return false;
  let guard = 0;
  while (st.cash[from] < amount && guard++ < 200) {
    const owned = monoOwned_(st, from);
    const built = owned.filter(function (i) { return (st.houses[i] || 0) > 0; }).sort(function (a, b) { return st.houses[b] - st.houses[a]; });
    if (built.length) { const i = built[0]; st.houses[i]--; st.cash[from] += MONO_GROUPS[MONO_BOARD[i].g].cost / 2; continue; }
    const free = owned.filter(function (i) { return !st.mort[i]; }).sort(function (a, b) { return MONO_BOARD[a].p - MONO_BOARD[b].p; });
    if (free.length) { const i = free[0]; st.mort[i] = true; st.cash[from] += MONO_BOARD[i].p / 2; continue; }
    break;
  }
  if (st.cash[from] >= amount) {
    st.cash[from] -= amount; if (to >= 0) st.cash[to] += amount;
    if (why !== 'silent') monoEv_(st, { t: 'pay', from: from, to: to, v: amount, why: why || '' });
    return false;
  }
  if (why !== 'silent') { monoEv_(st, { t: 'pay', from: from, to: to, v: st.cash[from], why: why || '' }); monoEv_(st, { t: 'bust', p: from }); }
  // bankrupt: everything goes to the creditor (or back to the bank)
  if (to >= 0) st.cash[to] += st.cash[from];
  st.cash[from] = 0;
  monoOwned_(st, from).forEach(function (i) {
    st.houses[i] = 0;
    if (to >= 0) st.owner[i] = to; else { delete st.owner[i]; delete st.mort[i]; }
  });
  st.bankrupt[from] = true;
  return true;
}

function monoCheckWinner_(st) {
  const alive = monoAlive_(st);
  if (alive.length === 1) { st.winner = alive[0]; st.phase = 'over'; return true; }
  return false;
}

function monoGoJail_(st, seat) {
  monoEv_(st, { t: 'move', p: seat, from: st.pos[seat], to: 10, jump: true }); monoEv_(st, { t: 'jail', p: seat });
  st.pos[seat] = 10; st.jail[seat] = true; st.tries[seat] = 0; st.again = false; st.doubles = 0;
}

function monoMoveTo_(st, seat, to, collect, opts) {
  const from = st.pos[seat];
  monoEv_(st, { t: 'move', p: seat, from: from, to: to, jump: !!(opts && opts.jump) });
  if (collect && to < from) { st.cash[seat] += 200; monoLog_(st, 'passed START: +200'); monoEv_(st, { t: 'go', p: seat, v: 200 }); }
  st.pos[seat] = to; st.moveSeq++;
  st.lastMove = { seq: st.moveSeq, seat: seat, from: from, to: to, dice: st.dice.slice() };
}

function monoLand_(st, seat, viaCard) {
  const idx = st.pos[seat], sq = MONO_BOARD[idx], name = 'P' + (seat + 1);
  st.card = null;
  if (sq.t === 'prop' || sq.t === 'rail' || sq.t === 'util') {
    const owner = st.owner[idx];
    if (owner === undefined) {
      if (st.cash[seat] >= sq.p) { st.pending = { idx: idx, price: sq.p }; st.phase = 'buy'; return; }
      monoLog_(st, 'Not enough cash to buy ' + sq.n + '.');
    } else if (owner !== seat) {
      const rent = monoRent_(st, idx, st.dice);
      if (rent > 0) {
        monoLog_(st, 'Pays ' + rent + ' rent for ' + sq.n + '.');
        st.lastPay = { from: seat, to: owner, v: rent, seq: st.seq };
        if (monoPay_(st, seat, owner, rent, 'rent')) monoLog_(st, 'Bankrupt!');
      }
    }
  } else if (sq.t === 'tax') {
    monoLog_(st, 'Pays ' + sq.v + ' ' + sq.n + '.');
    if (monoPay_(st, seat, -1, sq.v, 'tax')) monoLog_(st, 'Bankrupt!');
  } else if (sq.t === 'gotojail') {
    monoLog_(st, 'Goes to Jail!'); monoGoJail_(st, seat); st.moveSeq++;
    st.lastMove = { seq: st.moveSeq, seat: seat, from: 30, to: 10, dice: st.dice.slice(), jump: true };
  } else if ((sq.t === 'chance' || sq.t === 'fortune') && !viaCard) {
    const c = MONO_CARDS[Math.floor(Math.random() * MONO_CARDS.length)];
    st.card = { seat: seat, x: c.x, seq: st.seq + 1 }; monoLog_(st, c.x); monoEv_(st, { t: 'card', p: seat, x: c.x });
    if (c.t === 'cash') { if (c.v > 0) { st.cash[seat] += c.v; monoEv_(st, { t: 'gain', p: seat, v: c.v }); } else if (monoPay_(st, seat, -1, -c.v, 'card')) monoLog_(st, 'Bankrupt!'); }
    else if (c.t === 'each') {
      monoAlive_(st).forEach(function (o) {
        if (o === seat || st.bankrupt[seat]) return;
        if (c.v > 0) { if (monoPay_(st, o, seat, c.v)) monoLog_(st, 'P' + (o + 1) + ' is bankrupt!'); }
        else if (monoPay_(st, seat, o, -c.v)) monoLog_(st, 'Bankrupt!');
      });
    }
    else if (c.t === 'jail') { monoGoJail_(st, seat); st.moveSeq++; st.lastMove = { seq: st.moveSeq, seat: seat, from: idx, to: 10, dice: st.dice.slice(), jump: true }; }
    else if (c.t === 'move') { monoMoveTo_(st, seat, c.to, true, { jump: true }); monoLand_(st, seat, true); return; }
    else if (c.t === 'back') { monoMoveTo_(st, seat, (idx + 40 - c.v) % 40, false, { jump: true }); monoLand_(st, seat, true); return; }
  }
}

function monoNextTurn_(st) {
  if (monoCheckWinner_(st)) return;
  const n = monoPlayers_(st);
  let s = st.turn;
  do { s = (s + 1) % n; if (s <= st.turn) st.round++; } while (st.bankrupt[s]);
  st.turn = s; st.phase = 'roll'; st.doubles = 0; st.again = false; st.pending = null; monoEv_(st, { t: 'turn', p: s });
  if (st.maxRound && st.round > st.maxRound) {
    let best = -1, bw = -1;
    monoAlive_(st).forEach(function (i) { const w = monoWorth_(st, i); if (w > bw) { bw = w; best = i; } });
    st.winner = best; st.phase = 'over'; st.byWorth = true;
  }
}

function monoRoll_(st, seat) {
  if (st.turn !== seat || st.phase !== 'roll') throw new Error('You cannot roll now.');
  const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6), dbl = d1 === d2;
  st.dice = [d1, d2]; st.rollSeq++; st.card = null; st.lastPay = null; monoEv_(st, { t: 'roll', p: seat, d: [d1, d2], dbl: dbl });
  if (st.jail[seat]) {
    if (dbl) { st.jail[seat] = false; st.again = false; monoLog_(st, 'Rolled a double and left Jail.'); }
    else {
      st.tries[seat]++;
      if (st.tries[seat] >= 3) {
        monoLog_(st, 'Third failed try: pays 50 and leaves Jail.');
        if (monoPay_(st, seat, -1, 50, 'jail')) { monoLog_(st, 'Bankrupt!'); monoNextTurn_(st); return; }
        st.jail[seat] = false;
      } else { monoLog_(st, 'Rolled ' + d1 + '+' + d2 + ': still in Jail.'); st.phase = 'end'; st.again = false; return; }
    }
    monoMoveTo_(st, seat, (st.pos[seat] + d1 + d2) % 40, true); monoLog_(st, 'Rolled ' + d1 + '+' + d2 + '.');
  } else {
    if (dbl) st.doubles++; else st.doubles = 0;
    if (st.doubles >= 3) { monoLog_(st, 'Third double in a row: Go to Jail!'); const from = st.pos[seat]; monoGoJail_(st, seat); st.moveSeq++; st.lastMove = { seq: st.moveSeq, seat: seat, from: from, to: 10, dice: st.dice.slice(), jump: true }; st.phase = 'end'; return; }
    st.again = dbl;
    monoLog_(st, 'Rolled ' + d1 + '+' + d2 + (dbl ? ' (double!)' : '') + '.');
    monoMoveTo_(st, seat, (st.pos[seat] + d1 + d2) % 40, true);
  }
  monoLand_(st, seat, false);
  if (monoCheckWinner_(st)) return;
  if (st.bankrupt[seat]) { monoNextTurn_(st); return; }
  if (st.phase !== 'buy') st.phase = 'end';
}

function monoJailPay_(st, seat) {
  if (st.turn !== seat || st.phase !== 'roll' || !st.jail[seat]) throw new Error('You are not in Jail.');
  if (st.cash[seat] < 50) throw new Error('You need 50 to pay the fine.');
  st.cash[seat] -= 50; st.jail[seat] = false; st.tries[seat] = 0; monoLog_(st, 'Pays 50 and leaves Jail.'); monoEv_(st, { t: 'pay', from: seat, to: -1, v: 50, why: 'jail' });
}

function monoBuy_(st, seat) {
  if (st.turn !== seat || st.phase !== 'buy' || !st.pending) throw new Error('There is nothing to buy.');
  const p = st.pending;
  if (st.cash[seat] < p.price) throw new Error('Not enough cash.');
  st.cash[seat] -= p.price; st.owner[p.idx] = seat; st.pending = null; st.phase = 'end';
  monoLog_(st, 'Buys ' + MONO_BOARD[p.idx].n + ' for ' + p.price + '.'); monoEv_(st, { t: 'buy', p: seat, idx: p.idx, v: p.price });
}

function monoSkip_(st, seat) {
  if (st.turn !== seat || st.phase !== 'buy') throw new Error('There is nothing to skip.');
  monoLog_(st, 'Does not buy ' + MONO_BOARD[st.pending.idx].n + '.'); st.pending = null; st.phase = 'end';
}

function monoEnd_(st, seat) {
  if (st.turn !== seat || st.phase !== 'end') throw new Error('Finish your move first.');
  if (st.again && !st.jail[seat] && !st.bankrupt[seat]) { st.phase = 'roll'; st.again = false; st.card = null; return; }
  monoNextTurn_(st);
}

function monoCanBuild_(st, seat, idx) {
  const s = MONO_BOARD[idx];
  if (!s || s.t !== 'prop' || st.owner[idx] !== seat) return false;
  if (st.turn !== seat || (st.phase !== 'roll' && st.phase !== 'end')) return false;
  const grp = monoGroup_(s.g);
  if (!grp.every(function (i) { return st.owner[i] === seat && !st.mort[i]; })) return false;
  const h = st.houses[idx] || 0;
  if (h >= 5) return false;
  const min = Math.min.apply(null, grp.map(function (i) { return st.houses[i] || 0; }));
  if (h > min) return false;
  return st.cash[seat] >= MONO_GROUPS[s.g].cost;
}

function monoBuild_(st, seat, idx) {
  if (!monoCanBuild_(st, seat, idx)) throw new Error('You cannot build there (own the whole colour, build evenly, and keep enough cash).');
  const s = MONO_BOARD[idx];
  st.cash[seat] -= MONO_GROUPS[s.g].cost; st.houses[idx] = (st.houses[idx] || 0) + 1;
  monoLog_(st, (st.houses[idx] === 5 ? 'Builds a hotel on ' : 'Builds a house on ') + s.n + '.'); monoEv_(st, { t: 'build', p: seat, idx: idx, v: MONO_GROUPS[s.g].cost });
}

function monoSell_(st, seat, idx) {
  const s = MONO_BOARD[idx];
  if (!s || s.t !== 'prop' || st.owner[idx] !== seat || st.turn !== seat) throw new Error('You cannot sell there.');
  const h = st.houses[idx] || 0;
  if (h < 1) throw new Error('No building to sell.');
  const max = Math.max.apply(null, monoGroup_(s.g).map(function (i) { return st.houses[i] || 0; }));
  if (h < max) throw new Error('Sell from the most built property first.');
  st.houses[idx] = h - 1; st.cash[seat] += MONO_GROUPS[s.g].cost / 2;
  monoLog_(st, 'Sells a building on ' + s.n + '.');
}

function monoMortgage_(st, seat, idx, undo) {
  const s = MONO_BOARD[idx];
  if (!s || st.owner[idx] !== seat || st.turn !== seat) throw new Error('You cannot do that.');
  if (!undo) {
    if (st.mort[idx]) throw new Error('Already mortgaged.');
    if (s.t === 'prop' && monoGroup_(s.g).some(function (i) { return (st.houses[i] || 0) > 0; })) throw new Error('Sell the buildings of this colour first.');
    st.mort[idx] = true; st.cash[seat] += s.p / 2; monoLog_(st, 'Mortgages ' + s.n + '.');
  } else {
    const cost = Math.ceil(s.p / 2 * 1.1);
    if (!st.mort[idx]) throw new Error('This property is not mortgaged.');
    if (st.cash[seat] < cost) throw new Error('You need ' + cost + ' to take the mortgage back.');
    st.cash[seat] -= cost; delete st.mort[idx]; monoLog_(st, 'Takes the mortgage back on ' + s.n + '.');
  }
}

function monoBotAct_(st, seat) {
  if (st.phase === 'roll') {
    if (st.jail[seat] && st.cash[seat] >= 500) { monoJailPay_(st, seat); return; }
    monoRoll_(st, seat); return;
  }
  if (st.phase === 'buy') {
    const p = st.pending, s = MONO_BOARD[p.idx];
    let completes = false;
    if (s.t === 'prop') completes = monoGroup_(s.g).filter(function (i) { return st.owner[i] !== seat; }).length === 1;
    if (st.cash[seat] - p.price >= 50 || (completes && st.cash[seat] - p.price >= 0)) monoBuy_(st, seat); else monoSkip_(st, seat);
    return;
  }
  if (st.phase === 'end') {
    const options = monoOwned_(st, seat).filter(function (i) { return monoCanBuild_(st, seat, i) && st.cash[seat] - MONO_GROUPS[MONO_BOARD[i].g].cost >= 100; });
    if (options.length) { options.sort(function (a, b) { return MONO_GROUPS[MONO_BOARD[a].g].cost - MONO_GROUPS[MONO_BOARD[b].g].cost; }); monoBuild_(st, seat, options[0]); return; }
    const back = monoOwned_(st, seat).filter(function (i) { return st.mort[i] && st.cash[seat] > 700; });
    if (back.length) { monoMortgage_(st, seat, back[0], true); return; }
    monoEnd_(st, seat);
  }
}

function afterMono_(g) {
  const st = g.state;
  if (st.phase === 'over') {
    const w = st.winner;
    finish_(g, [w], g.players[w].name + ' won' + (st.byWorth ? ' on net worth after ' + st.maxRound + ' rounds' : ' - everyone else went bankrupt'));
  } else saveGame_(g);
}

function monoSeat_(g, email) {
  const seat = seatOf_(g, email);
  if (seat === -1) throw new Error('You are only watching this match.');
  return seat;
}

function monoAct(email, id, action, arg, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 'mono', rev); if (bad) return bad;
    const st = g.state, seat = monoSeat_(g, email);
    action = String(action);
    if (action === 'roll') monoRoll_(st, seat);
    else if (action === 'jailpay') monoJailPay_(st, seat);
    else if (action === 'buy') monoBuy_(st, seat);
    else if (action === 'skip') monoSkip_(st, seat);
    else if (action === 'end') monoEnd_(st, seat);
    else if (action === 'build') monoBuild_(st, seat, Number(arg));
    else if (action === 'sell') monoSell_(st, seat, Number(arg));
    else if (action === 'mortgage') monoMortgage_(st, seat, Number(arg), false);
    else if (action === 'unmortgage') monoMortgage_(st, seat, Number(arg), true);
    else throw new Error('Unknown action.');
    afterMono_(g);
    return reply_(g, email);
  });
}

function monoBot(email, id, rev) {
  return lockRun_(function () {
    const g = must_(id), bad = seatGuard_(g, 'mono', rev); if (bad) return bad;
    const st = g.state;
    if (!g.players[st.turn] || !g.players[st.turn].bot) return { ok: false, notBot: true, game: pub_(g), mine: null };
    // play a whole robot turn (and any robot turns after it) in ONE call, so the screen gets a full replay instead of one tiny step
    let n = 0;
    while (n++ < 30 && st.phase !== 'over' && g.players[st.turn] && g.players[st.turn].bot) monoBotAct_(st, st.turn);
    afterMono_(g);
    return reply_(g, email);
  });
}

/** Static board data for the browser (names, prices, colours). */
function monoBoardInfo() {
  return { board: MONO_BOARD, groups: MONO_GROUPS };
}
