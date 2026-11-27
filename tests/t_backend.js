const {make}=require('./harness');const assert=require('assert');
const {api,ctx}=make();
const A=api;
A.login('a@x.com','Ann');A.login('b@x.com','Bob');A.login('c@x.com','Cy');
assert(A.listUsers().length===3);
const r=A.createRoom('a@x.com',{type:'ludo',mode:'CLASSIC',playerCount:2,bet:'',slots:[{email:'b@x.com',name:'Bob'}]});
A.joinRoom('b@x.com',r.id);
let g=A.getGame(r.id);assert(g.status==='ACTIVE',g.status);
const g2=A.getGame(r.id,g.revision,0);assert(g2.same,'same reply');
// --- Ludo stacked rolls: see t_ludo_rules.js for the full rule tests; here a lock check
const S=ctx.ludoInit_(['red','green'],'CLASSIC');S.turn='red';
const realRand=Math.random;
function seq(vals){let i=0;Math.random=()=>{const v=vals[i++];return (v-1)/6+0.01}}
const K=ctx.ludoInit_(['red','green'],'CLASSIC');K.turn='red';
K.coins.red=[3,10,-1,-1];K.coins.green=[-1,-1,-1,-1];K.coins.green[0]=45;K.pending=[3];K.dice=3;K.rolled=true;
const mi=ctx.moveCore_(K,'red',0,0);assert(mi.captured.length===1&&mi.extraTurn&&K.turn==='red'&&!K.rolled);
assert(K.lock&&K.lock.coin===0,'kicker locked for the bonus roll');
assert(ctx.movable_(K,'red',2).indexOf(0)===-1&&ctx.movable_(K,'red',2).indexOf(1)!==-1,'lock');
const K2=ctx.ludoInit_(['red','green'],'CLASSIC');K2.turn='red';K2.coins.red=[3,-1,-1,-1];K2.coins.green[0]=45;K2.pending=[3];K2.dice=3;K2.rolled=true;
ctx.moveCore_(K2,'red',0,0);seq([2]);const i2=ctx.rollCore_(K2);assert(i2.noMoves&&K2.turn==='green','locked sole coin => pass');
// bot batched turn
Math.random=realRand;
const r2=A.createRoom('a@x.com',{type:'ludo',mode:'CLASSIC',playerCount:2,bet:'',slots:[{bot:true}]});
let gg=A.getGame(r2.id);
for(let n=0;n<5&&gg.status!=='LOBBY'&&gg.status!=='ACTIVE';n++);
gg=A.getGame(r2.id);
let guard=0;
let chained=0;
while(gg.state.turn!==gg.players.find(p=>p.bot).color&&guard++<200&&!chained){ // human plays until bot's turn (the bot's turn is now chained into the human's reply)
  const me=gg.players.find(p=>!p.bot);
  let rr;if(!gg.state.rolled){rr=A.ludoRoll('a@x.com',r2.id,gg.revision)}else{const P=Array.from(gg.state.pending);let di=P.findIndex(d=>ctx.movable_(gg.state,gg.state.turn,d).length);const L=ctx.movable_(gg.state,gg.state.turn,P[di]);rr=A.ludoMove('a@x.com',r2.id,gg.state.turn,L[0],gg.revision,di)}
  if(rr&&rr.steps&&rr.steps.length){chained=rr.steps.length;assert(rr.ownState&&rr.game.revision>=0,'chain has ownState');}
  gg=A.getGame(r2.id);
}
let br;if(chained){br={ok:true,steps:new Array(chained),game:gg};console.log('bot turn chained in human reply, steps',chained);}else{br=A.ludoBotTurn(r2.id,gg.revision);assert(br.ok&&br.steps.length>=1,'bot steps');}
console.log('BACKEND TESTS PASS; bot steps',br.steps.length);
// stacked rolls: a six is only stored; nothing moves until the cycle ends
{const S=ctx.ludoInit_(['red','green'],'CLASSIC');S.turn='red';S.coins.red=[49,54,56,56];
 seq([6]);let i=ctx.rollCore_(S);assert(i.extraTurn&&!S.rolled&&JSON.stringify(Array.from(S.pending))==='[6]'&&S.coins.red[0]===49);
 seq([5]);i=ctx.rollCore_(S);assert(S.rolled&&S.pending.length===2,'both rolls stored');
 const V=ctx.ludoInit_(['red','green'],'CLASSIC');V.turn='red';V.coins.red=[55,56,56,56];seq([6]);const k=ctx.rollCore_(V);assert(k.extraTurn&&V.turn==='red');
 console.log('STACKED ROLLS PASS');}
