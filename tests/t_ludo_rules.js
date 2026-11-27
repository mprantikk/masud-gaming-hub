const {make}=require('./harness');const assert=require('assert');const {ctx:ctx0,api}=make();const ctx=ctx0;ctx.CONFIG=api.CONFIG;
const realRand=Math.random;const rolls=[];ctx.Math.random=()=>{const v=rolls.shift();return v===undefined?realRand():(v-1)/6+0.01};
const mk=(colors)=>{const s=ctx.ludoInit_(colors||['red','yellow'],'CLASSIC');s.turn='red';return s};
const J=x=>JSON.stringify(x);
// 1) 6 then 4: nothing moves between rolls; both stored; player chooses
let s=mk(); s.coins.red=[10,-1,-1,-1];
rolls.push(6); let i=ctx.rollCore_(s); assert(i.extraTurn&&!s.rolled&&J(s.pending)==='[6]','six = roll again, no forced move'); assert.strictEqual(s.turn,'red');
rolls.push(4); i=ctx.rollCore_(s); assert(s.rolled&&J(s.pending)==='[6,4]','both stored');
// use the 4 first on token 0, then 6 to bring out token 1
let r=ctx.moveCore_(s,'red',0,1); assert.strictEqual(s.coins.red[0],14); assert(s.rolled&&J(s.pending)==='[6]');
r=ctx.moveCore_(s,'red',1,0); assert.strictEqual(s.coins.red[1],0); assert.strictEqual(s.turn,'yellow','turn passes after last roll');
// 2) three sixes cancel
s=mk(); s.coins.red=[10,20,-1,-1]; rolls.push(6,6,6); ctx.rollCore_(s);ctx.rollCore_(s); i=ctx.rollCore_(s);
assert(i.threeSixes&&s.turn==='red'&&!s.rolled&&!s.pending.length&&J(s.coins.red)==='[10,20,-1,-1]','three sixes dropped, same player rolls again');
// user's examples: 6,6,6,3 -> [3]; 6,6,6,6,4 -> [6,4]; 6x6,2 -> [2]
[[[6,6,6,3],'[3]'],[[6,6,6,6,4],'[6,4]'],[[6,6,6,6,6,6,2],'[2]']].forEach(([seq,exp])=>{s=mk();s.coins.red=[10,20,-1,-1];rolls.push(...seq);seq.forEach(()=>{if(!s.rolled&&s.turn==='red')ctx.rollCore_(s);});assert.strictEqual(J(s.pending),exp,seq+' -> '+J(s.pending));assert(s.rolled&&s.turn==='red');});
// 3) capture with the 6 of a stack: opp token 6 ahead is capturable (6 then 3 not three sixes)
s=mk(); s.coins.red=[5,-1,-1,-1];
const g=(ctx.CONFIG.START.red+11)%52; // cell red token at 11
s.coins.yellow=[-1,-1,-1,-1]; // place yellow token at same global cell
const ypos=((g-ctx.CONFIG.START.yellow)%52+52)%52; 
if(ctx.CONFIG.SAFE.indexOf(g)===-1&&ypos<=ctx.CONFIG.TRACK_LAST){ s.coins.yellow[0]=ypos; rolls.push(6,3); ctx.rollCore_(s); ctx.rollCore_(s);
 r=ctx.moveCore_(s,'red',0,0); assert.strictEqual(r.captured.length,1,'6 captures'); assert.strictEqual(s.coins.yellow[0],-1); assert(s.bonus===1||s.pending.length,'bonus earned');
 assert.strictEqual(s.turn,'red'); } else console.log('skip capture cell safe');
// 4) pending unusable roll gets dropped at end: all tokens in base, roll 3 -> no moves, pass
s=mk(); rolls.push(3); i=ctx.rollCore_(s); assert(i.noMoves&&s.turn==='yellow');
// 5) 6 then 3 with all in base: 6 usable, 3 usable after bringing out
s=mk(); rolls.push(6,3); ctx.rollCore_(s);ctx.rollCore_(s); assert(s.rolled); r=ctx.moveCore_(s,'red',0,0); assert(s.rolled&&J(s.pending)==='[3]'); ctx.moveCore_(s,'red',0,0); assert.strictEqual(s.coins.red[0],3);assert.strictEqual(s.turn,'yellow');
// 6) bonus cycle after capture with lock
// 7) old-state migration
s=mk(); s.coins.red=[10,-1,-1,-1]; s.rolled=true; s.dice=4; delete s.pending; ctx.ludoNorm_(s); assert.strictEqual(J(s.pending),'[4]');
// 8) full robot games finish
for(let n=0;n<40;n++){const st=ctx.ludoInit_(['red','green','yellow','blue'],n%2?'QUICK':'CLASSIC');let guard=0;
 while(!st.winner&&guard++<20000){ if(!st.rolled)ctx.rollCore_(st); else {const p=ctx.botChoose_(st,st.turn);assert(p,'bot has a move');ctx.moveCore_(st,st.turn,p.coin,p.die);} }
 assert(st.winner,'game '+n+' finished');}
console.log('ludo stacked-roll rules ok');
