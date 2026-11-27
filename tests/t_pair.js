const {make}=require('./harness');const assert=require('assert');const {ctx:ctx0,api}=make();const ctx=ctx0;ctx.CONFIG=api.CONFIG;
const realRand=Math.random;const rolls=[];ctx.Math.random=()=>{const v=rolls.shift();return v===undefined?realRand():(v-1)/6+0.01};
const mk=(cols,mode)=>{const s=ctx.ludoInit_(cols||['red','yellow'],mode||'CLASSIC');s.turn='red';return s};
const J=x=>JSON.stringify(x);
// pair of own tokens on cell 3 (not safe)
let s=mk(); s.coins.red=[3,3,-1,-1];
let c=ctx.pairCandidates_(s,'red'); assert.strictEqual(c.length,1,'one candidate');
s.pairs=c; rolls.push(4); ctx.rollCore_(s); assert(s.rolled);
let r=ctx.moveCore_(s,'red',0,0); assert.strictEqual(J(Array.from(s.coins.red)),'[5,5,-1,-1]','pair moved half of 4'); assert(r.paired&&!r.pairSplit); assert.strictEqual(s.pairs.length,1);
// pair lands on safe cell 8 -> splits
s.turn='red'; s.pending=[6]; s.rolled=true; r=ctx.moveCore_(s,'red',1,0); assert.strictEqual(J(Array.from(s.coins.red)),'[8,8,-1,-1]'); assert(r.pairSplit&&s.pairs.length===0,'splits on safe');
// pair cannot be captured
s=mk(); s.coins.yellow=[-1,-1,-1,-1]; s.coins.red=[-1,-1,-1,-1];
const gcell=5; const yp=((gcell-ctx.CONFIG.START.yellow)%52+52)%52; s.coins.yellow=[yp,yp,-1,-1]; s.pairs=[['yellow:0','yellow:1']]; s.coins.red[0]=2; s.pending=[3]; s.rolled=true;
r=ctx.moveCore_(s,'red',0,0); assert.strictEqual(r.captured.length,0,'paired tokens are safe'); assert.strictEqual(s.coins.yellow[0],yp);
// a pair kicks a pair (both tokens go home)
s=mk(); s.coins.yellow=[yp,yp,-1,-1]; s.pairs=[['yellow:0','yellow:1'],['red:0','red:1']]; s.coins.red=[2,2,-1,-1]; s.pending=[6]; s.rolled=true;
r=ctx.moveCore_(s,'red',0,0); assert.strictEqual(r.captured.length,2,'pair kicks pair'); assert.strictEqual(J(Array.from(s.coins.yellow)),'[-1,-1,-1,-1]'); assert.strictEqual(J(Array.from(s.coins.red.slice(0,2))),'[5,5]');
// unpaired two tokens are captured both
s=mk(); s.coins.yellow=[yp,yp,-1,-1]; s.coins.red[0]=2; s.pending=[3]; s.rolled=true; r=ctx.moveCore_(s,'red',0,0); assert.strictEqual(r.captured.length,2);
// pair cannot move if partner would overshoot
s=mk(); s.coins.red=[49,49,-1,-1]; s.pairs=[['red:0','red:1']]; assert(ctx.movable_(s,'red',2).filter(i=>i<2).length===2); assert.strictEqual(ctx.movable_(s,'red',3).filter(i=>i<2).length,0,'odd roll cannot move a pair'); s.coins.red=[50,50,-1,-1]; s.pairs=[['red:0','red:1']]; assert.strictEqual(ctx.movable_(s,'red',6).filter(i=>i<2).length,2);
// team mode: red + yellow tokens on same global cell
s=mk(['red','green','yellow','blue'],'TEAM'); s.coins.red[0]=30; // global 30
s.coins.yellow[0]=4; // global 26+4=30
c=ctx.pairCandidates_(s,'red'); assert.strictEqual(c.length,1,'team pair candidate'); assert.strictEqual(J(c[0]),'["red:0","yellow:0"]');
assert.strictEqual(ctx.pairCandidates_(s,'green').length,0);
s.pairs=c; s.pending=[6]; s.rolled=true; r=ctx.moveCore_(s,'red',0,0); assert(s.coins.red[0]===33&&s.coins.yellow[0]===7,'ally token moves too'); assert(r.paired);
// ally can also move it on their own turn
s.turn='yellow'; s.pending=[4]; s.rolled=true; assert(ctx.movable_(s,'yellow',4).indexOf(0)!==-1); ctx.moveCore_(s,'yellow',0,0); assert(s.coins.red[0]===35&&s.coins.yellow[0]===9);
// non-team: another colour's token never pairs
s=mk(); s.coins.red[0]=30; s.coins.yellow[0]=4; assert.strictEqual(ctx.pairCandidates_(s,'red').length,0);
// API: declare and split
api.login('h@x.com','H');const room=api.createRoom('h@x.com',{type:'ludo',mode:'CLASSIC',playerCount:2,slots:[{bot:true}]});
let g=api.getGame(room.id);
assert.throws(()=>api.ludoPair('h@x.com',room.id,'pair',g.revision),/same square|not your turn/);
// kicker has no other token to play the bonus: no kick
s=mk(); s.coins.red=[3,56,56,56]; s.coins.yellow=[((5-ctx.CONFIG.START.yellow)%52+52)%52,-1,-1,-1]; s.pending=[2]; s.rolled=true;
r=ctx.moveCore_(s,'red',0,0); assert.strictEqual(r.captured.length,0,'no scope, no kick'); assert(r.noKick); assert.strictEqual(s.coins.yellow[0],((5-ctx.CONFIG.START.yellow)%52+52)%52,'victim stays'); assert.strictEqual(s.bonus,0);
// with another token in the yard (scope) the kick happens
s=mk(); s.coins.red=[3,-1,56,56]; s.coins.yellow=[((5-ctx.CONFIG.START.yellow)%52+52)%52,-1,-1,-1]; s.pending=[2]; s.rolled=true;
r=ctx.moveCore_(s,'red',0,0); assert.strictEqual(r.captured.length,1); assert.strictEqual(s.bonus,0); assert(s.lock&&s.lock.coin===0,'kicker stays put on the bonus roll');
// pair mate of the kicker cannot move on the bonus roll either
s=mk(); s.coins.red=[10,10,20,-1]; s.pairs=[['red:0','red:1']]; s.lock={color:'red',coin:0}; assert.strictEqual(ctx.movable_(s,'red',2).indexOf(1),-1); assert(ctx.movable_(s,'red',2).indexOf(2)!==-1);
console.log('pair rules ok');
// robot games still finish with pairs present
for(let n=0;n<30;n++){const st=ctx.ludoInit_(n%2?['red','green','yellow','blue']:['red','yellow'],n%3?'TEAM':'CLASSIC');if(!st.teamMode&&st.activeColors.length===4){}let guard=0;
 while(!st.winner&&guard++<30000){ if(!st.rolled){ // humans declare pairs when possible
     const cs=ctx.pairCandidates_(st,st.turn); cs.forEach(x=>st.pairs.push(x)); ctx.rollCore_(st);} else {const p=ctx.botChoose_(st,st.turn);assert(p);ctx.moveCore_(st,st.turn,p.coin,p.die);} }
 assert(st.winner,'finished '+n);}
console.log('pair robot games ok');
// --- no offer is created for the opponent's turn; no pairing on stars
{
 const {make:mk2}=require('./harness');const {api:A,ctx:X}=mk2();['h@x.com','a@x.com'].forEach(e=>A.login(e,e[0]));
 const room=A.createRoom('h@x.com',{type:'ludo',mode:'CLASSIC',playerCount:2,slots:[{email:'a@x.com'}]});A.joinRoom('a@x.com',room.id);
 let g=X.must_(room.id);const hc=g.players[0].color,ac=g.players[1].color;
 g.state.turn=hc;g.state.rolled=true;g.state.pending=[2];g.state.dice=2;g.state.coins[hc]=[3,5,-1,-1];X.saveGame_(g);
 A.ludoMove('h@x.com',room.id,hc,0,A.getGame(room.id).revision,0);
 g=X.must_(room.id);assert(!g.state.offer,'no blocking offer');assert.strictEqual(g.state.turn,ac);
 assert(A.ludoRoll('a@x.com',room.id,g.revision).ok,'opponent rolls at once');
 // on my own turn the pair can be declared
 g=X.must_(room.id);g.state.turn=hc;g.state.rolled=false;g.state.pending=[];X.saveGame_(g);
 const rr=A.ludoPair('h@x.com',room.id,'pair',X.must_(room.id).revision);assert(rr.ok);assert.strictEqual(X.must_(room.id).state.pairs.length,1);
 // star square: no candidate
 const s=ctx.ludoInit_(['red','yellow'],'CLASSIC');s.coins.red=[8,8,-1,-1];assert.strictEqual(ctx.pairCandidates_(s,'red').length,0,'no pair on a star');
 s.coins.red=[9,9,-1,-1];assert.strictEqual(ctx.pairCandidates_(s,'red').length,1);
 const s2=ctx.ludoInit_(['red','green','yellow','blue'],'TEAM');s2.coins.red[0]=50;s2.coins.yellow[0]=((50-26)%52+52)%52;assert.strictEqual(ctx.pairCandidates_(s2,'red').length,0,'no team pair on the home-entry square');
 s2.coins.red[1]=50;assert.strictEqual(ctx.pairCandidates_(s2,'red').length,1);
 console.log('offer flow ok');
}
