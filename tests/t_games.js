const {make}=require('./harness');const assert=require('assert');
const {api,ctx}=make();const A=api;
['a@x.com','b@x.com'].forEach(e=>A.login(e,e[0]));
// ---------- 29: pure-state robot games ----------
let hands=0,passAll=0,fails=0,made=0;
for(let g=0;g<60;g++){
  const st=ctx.t29Init_();let guard=0;
  while(st.phase!=='over'&&guard++<3000){
    if(st.phase==='summary'){
      const s=st.summary; assert.strictEqual(s.pts[0]+s.pts[1],29,'points sum '+JSON.stringify(s.pts)); hands++; if(s.made)made++;else fails++;
      ctx.t29Next_(st);continue;}
    const seat=ctx.t29Actor_(st);assert(seat>=0,'actor '+st.phase);
    ctx.t29BotAct_(st,seat);
  }
  assert(st.phase==='over','finished'); hands++;
  assert(st.winnerTeam===0||st.winnerTeam===1);
}
console.log('29 robot games ok. hands',hands,'made',made,'failed',fails,'redeals seen?');
// rules
{const mk=()=>{const st=ctx.t29Init_();st.phase='play';st.bidder=0;st.target=20;st.turn=1;st.trick=[];st.tricksWon=[0,0];st.revealed=true;st.trump='H';st.revealIdx=0;st.hiddenCard=null;return st;};
 let st=mk();st.hands[1]=['KH','QH','7S','8S','7D','8D','7C','8C'];st.tricksWon=[0,1];
 assert(ctx.t29CanPair_(st,1));ctx.t29Pair_(st,1);assert.strictEqual(st.target,24,'defenders raise target');
 st=mk();st.turn=0;st.hands[0]=['KH','QH','7S','8S','7D','8D','7C','8C'];st.tricksWon=[1,0];ctx.t29Pair_(st,0);assert.strictEqual(st.target,16);
 st=mk();st.hands[1]=['KH','QH','7S','8S','7D','8D','7C','8C'];st.revealed=false;st.trump=null;assert(!ctx.t29CanPair_(st,1),'no pair before trump is shown');
 // follow suit + hidden trump: cut only after asking
 st=mk();st.revealed=false;st.trump=null;st.hiddenCard='7H';st.hasHidden=true;st.turn=0;
 st.hands=[['7S','8S','JD','8D','QC','KC','AC','TC'],['AS','7C','8C','QD','KD','9C','KS','QS'],['JS','TS','JC','9D','AD','TD','QH','KH'],['9S','AH','TH','JH','9H','8H','QH','KS']];
 ctx.t29Play_(st,0,'7S');assert.throws(()=>ctx.t29Play_(st,1,'7C'),/follow/);
 ctx.t29Play_(st,1,'AS');ctx.t29Play_(st,2,'JS');ctx.t29Play_(st,3,'9S');assert.strictEqual(st.turn,2,'JS wins');assert.strictEqual(st.pts[0]+st.pts[1],6);
 // trick 2: lead clubs by seat 2: seat 3 has no club -> may ask for trump
 st=mk();st.revealed=false;st.trump=null;st.hiddenCard='7H';st.hasHidden=true;st.turn=2;st.hands=[['7S','8S','JD','8D','QC','KC','AC','TC'],['AS','7C','8C','QD','KD','9C','KS','QS'],['JS','TS','JC','9D','AD','TD','QD','KD'],['9S','AH','TH','JH','9H','8H','QS','KS']];
 ctx.t29Play_(st,2,'JC');ctx.t29Play_(st,3,'9S');assert.strictEqual(st.turn,0);
 ctx.t29Play_(st,0,'QC');ctx.t29Play_(st,1,'9C');assert.strictEqual(st.turn,2,'seat 2 JC wins (trump not shown, 9S discard does not cut)');
 // ask-for-trump flow
 st=mk();st.revealed=false;st.trump=null;st.hiddenCard='7H';st.hasHidden=true;st.bidder=0;st.hands[0]=['KC','QC','AC','TC','8C','7C','JC'];st.turn=2;
 st.hands[2]=['JC','7S'];st.hands[3]=['9S','AH','TH','JH'];st.hands[1]=['AS','9C'];
 ctx.t29Play_(st,2,'JC');assert(ctx.t29CanShow_(st,3));ctx.t29Show_(st,3);assert(st.revealed&&st.trump==='H'&&st.hands[0].indexOf('7H')!==-1);
 assert.throws(()=>ctx.t29Play_(st,3,'9S'),/trump/);ctx.t29Play_(st,3,'JH');ctx.t29Play_(st,0,'KC');ctx.t29Play_(st,1,'9C');assert.strictEqual(st.turn,3,'asker cut with JH and wins');
 // bidder's last card is the hidden trump
 st=mk();st.revealed=false;st.trump=null;st.hiddenCard='7H';st.bidder=0;st.hands[0]=[];st.turn=0;st.tricks=7;st.tricksWon=[3,4];st.hands[1]=['AS'];st.hands[2]=['JS'];st.hands[3]=['9S'];
 assert.strictEqual(JSON.stringify(ctx.t29Legal_(st,0)),'["7H"]');ctx.t29Play_(st,0,'7H');assert(st.revealed&&st.trump==='H');ctx.t29Play_(st,1,'AS');ctx.t29Play_(st,2,'JS');ctx.t29Play_(st,3,'9S');
 
 console.log('29 rules ok');}
// ---------- 29 through the API: hidden cards ----------
const r=A.createRoom('a@x.com',{type:'t29',slots:[{bot:true},{bot:true},{bot:true}]});
let g=A.getGame(r.id,0,0,'a@x.com');
assert(g.status==='ACTIVE'&&g.mine&&g.mine.hand.length===4,'my 4 cards');
assert(!g.state.hands&&!g.state.deck,'hands hidden in public state');
assert(!A.getGame(r.id,0,0,'b@x.com').mine,'stranger sees no cards');
let steps=0;
while(g.status==='ACTIVE'&&steps++<4000){
  const st=g.state;
  if(st.phase==='summary'){const o=A.t29NextHand('a@x.com',r.id,g.revision);g=o.game;g.mine=o.mine;continue;}
  const actor=g.players.map((p,i)=>i)[ctx.t29Actor_(Object.assign({},st,{hands:null}))];
  const seat=(st.phase==='bid')?st.bidTurn:(st.phase==='trump')?st.bidder:st.turn;
  let o;
  if(g.players[seat].bot)o=A.t29Bot('a@x.com',r.id,g.revision);
  else{
    const full=JSON.parse(ctx.CacheService.getScriptCache().get('h:'+r.id));const clone=JSON.parse(JSON.stringify(full));
    const before=JSON.stringify([full.hands[seat],full.revealed,full.pair,full.trick.length,full.phase,full.bidLog.length]);
    ctx.t29BotAct_(clone,seat);
    if(st.phase==='bid')o=A.t29Bid('a@x.com',r.id,clone.bidLog.length>full.bidLog.length?clone.bidLog[clone.bidLog.length-1].bid:0,g.revision);
    else if(st.phase==='trump')o=A.t29Trump('a@x.com',r.id,full.hands[seat].filter(c=>clone.hands[seat].indexOf(c)===-1)[0]||clone.hiddenCard,g.revision);
    else if(clone.revealed&&!full.revealed&&clone.trick.length===full.trick.length)o=A.t29ShowTrump('a@x.com',r.id,g.revision);
    else if(clone.pair&&!full.pair)o=A.t29PairCall('a@x.com',r.id,g.revision);
    else{const played=clone.trick.length>full.trick.length?clone.trick[clone.trick.length-1].card:clone.last.cards[3].card;o=A.t29Play('a@x.com',r.id,played,g.revision);}
  }
  assert(o.ok,JSON.stringify(o).slice(0,200));g=o.game;g.mine=o.mine;
}
assert.strictEqual(g.status,'FINISHED');console.log('29 API game finished in',steps,'steps:',g.result);
// ---------- Business: robot games ----------
let finished=0;
for(let n=0;n<40;n++){
  const players=2+(n%3),st=ctx.monoInit_(players,n%2?'QUICK':'CLASSIC');let guard=0;
  while(st.phase!=='over'&&guard++<20000){const seat=st.turn;ctx.monoBotAct_(st,seat);
    for(let i=0;i<players;i++){assert(st.cash[i]>=0,'cash>=0');}}
  assert.strictEqual(st.phase,'over','mono game over (n='+n+', guard '+guard+')');finished++;
}
console.log('Business robot games ok:',finished);
// rent / build / bankrupt unit checks
{const st=ctx.monoInit_(2,'CLASSIC');st.owner[1]=0;st.owner[3]=0;assert.strictEqual(ctx.monoRent_(st,1,[1,1]),4,'double base rent with set');
 st.turn=0;st.phase='end';ctx.monoBuild_(st,0,1);assert.strictEqual(st.houses[1],1);assert.throws(()=>ctx.monoBuild_(st,0,1),/evenly|cannot/);
 ctx.monoBuild_(st,0,3);assert.strictEqual(ctx.monoRent_(st,1,[1,1]),10);
 st.owner[5]=1;st.owner[15]=1;assert.strictEqual(ctx.monoRent_(st,5,[1,1]),50);
 st.cash[0]=10;const bk=ctx.monoPay_(st,0,1,5000);assert(bk&&st.bankrupt[0]);assert.strictEqual(st.owner[1],1,'assets to creditor');}
// Business via API
const rm=A.createRoom('a@x.com',{type:'mono',mode:'CLASSIC',playerCount:3,slots:[{bot:true},{bot:true}]});
let mg=A.getGame(rm.id,0,0,'a@x.com');assert.strictEqual(mg.status,'ACTIVE');
let k=0;while(mg.status==='ACTIVE'&&k++<6000){const st=mg.state;let o;
  if(mg.players[st.turn].bot)o=A.monoBot('a@x.com',rm.id,mg.revision);
  else{const seat=st.turn;const p=st.phase;o=A.monoAct('a@x.com',rm.id,p==='roll'?'roll':p==='buy'?(st.cash[seat]>600?'buy':'skip'):'end',0,mg.revision);}
  assert(o.ok,JSON.stringify(o).slice(0,150));mg=o.game;}
console.log('Business API game:',mg.status,mg.result,'steps',k);
console.log('ALL GAME TESTS PASS');
