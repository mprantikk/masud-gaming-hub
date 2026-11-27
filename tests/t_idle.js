const {make}=require('./harness');const assert=require('assert');const {api:A,ctx}=make();
A.login('a@x.com','A');A.login('b@x.com','B');
const r=A.createRoom('a@x.com',{type:'ludo',mode:'CLASSIC',playerCount:2,slots:[{bot:false,email:'b@x.com',name:'B'}]});
A.joinRoom('b@x.com',r.id);try{A.respondInvite&&A.respondInvite('b@x.com',r.id,true)}catch(e){}
let g=A.getGame(r.id,0,0,'a@x.com');console.log('status',g.status,'turn',g.state&&g.state.turn);
if(g.status!=='ACTIVE'){try{A.startRoom('a@x.com',r.id)}catch(e){console.log(e.message)}g=A.getGame(r.id,0,0,'a@x.com');}
let bad=false;try{A.ludoIdle('b@x.com',r.id,g.revision)}catch(e){bad=/creator/.test(e.message)}assert(bad,'only creator');
const t=g.state.turn;let o=A.ludoIdle('a@x.com',r.id,g.revision);assert(o.ok&&o.auto,JSON.stringify(o).slice(0,200));
assert(o.game.state.rollSeq>g.state.rollSeq,'robot rolled');
console.log('IDLE PASS dice',o.game.state.dice,'turn',t,'->',o.game.state.turn);
