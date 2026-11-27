const {make}=require('./harness');const assert=require('assert');const {api:A,ctx}=make();
A.login('h@x.com','Masud');
const CFG={START:{red:0,green:13,yellow:26,blue:39},TRACK_LAST:50,FINISH:56,ENTRY:0,SAFE:[0,8,13,21,26,34,39,47]};let games=0,fin=0,kicks=0,enters=0,pairsSeen=0,blockedSeen=0,maxSteps=0;
function check(g){const st=g.state;
  st.activeColors.forEach(c=>{assert.strictEqual(st.coins[c].length,4);st.coins[c].forEach(p=>assert(p===-1||(p>=0&&p<=CFG.FINISH),'bad pos '+p));});
  // pairs must share a track cell and be valid
  (st.pairs||[]).forEach(pr=>{const [a,b]=pr.map(k=>{const [c,i]=k.split(':');return {c,i:+i}});const pa=st.coins[a.c][a.i],pb=st.coins[b.c][b.i];assert(pa>=0&&pa<=CFG.TRACK_LAST&&pb>=0&&pb<=CFG.TRACK_LAST,'pair off track');assert.strictEqual((CFG.START[a.c]+pa)%52,(CFG.START[b.c]+pb)%52,'pair split');assert(CFG.SAFE.indexOf((CFG.START[a.c]+pa)%52)===-1,'pair on star');pairsSeen++;});
  // a token that just entered stands on its start square
  const lm=st.lastMove;if(lm&&lm.from===-1){enters++;assert.strictEqual(lm.to,CFG.ENTRY,'entry square');}
  if(lm&&lm.captured&&lm.captured.length)kicks++;
}
for(const [mode,n,team] of [['CLASSIC',2,0],['CLASSIC',4,0],['CLASSIC',3,0],['TEAM',4,1],['QUICK',2,0],['QUICK',4,0]]){
 for(let k=0;k<4;k++){
  const slots=[];for(let i=1;i<n;i++)slots.push({bot:true});
  const r=A.createRoom('h@x.com',{type:'ludo',mode,playerCount:n,slots});
  let g=A.getGame(r.id,0,0,'h@x.com');games++;let steps=0;
  while(g.status==='ACTIVE'&&steps++<4000){
    const st=g.state,me=g.players.findIndex(p=>!p.bot);
    const mineColor=g.players.find(p=>!p.bot).color;
    let o;
    if(st.turn===mineColor){
      // human acts like a simple player: roll, then pair-skip, then pick a random legal token
      if(st.offer){o=A.ludoPair('h@x.com',r.id,'skip',g.revision);}
      else if(!st.rolled){o=A.ludoRoll('h@x.com',r.id,g.revision);}
      else{const pend=st.pending;let done=false;for(let di=0;di<pend.length&&!done;di++){const mv=ctx.movable_(st,mineColor,pend[di]);if(mv.length){o=A.ludoMove('h@x.com',r.id,mineColor,mv[Math.floor(Math.random()*mv.length)],g.revision,di);done=true;}}assert(done,'rolled but no legal token');}
    } else o=A.ludoBotTurn(r.id,g.revision);
    assert(o&&(o.ok||o.game||o.notBot),JSON.stringify(o).slice(0,150));
    g=o.game||A.getGame(r.id,0,0,'h@x.com');check(g);
  }
  assert.strictEqual(g.status,'FINISHED',mode+' '+n+' did not finish');fin++;maxSteps=Math.max(maxSteps,steps);
 }}
console.log('games',games,'finished',fin,'entries',enters,'kick moves',kicks,'pair checks',pairsSeen,'max steps',maxSteps);
console.log('LUDO SIM PASS');
