const {make}=require('./harness');const assert=require('assert');const {ctx}=make();
const mk=()=>({activeColors:['red','green'],teamMode:false,turn:'red',rolled:true,bonus:0,lock:null,winner:null,pairs:[['red:0','red:1']],pending:[],coins:{red:[-1,-1,56,56],green:[-1,-1,56,56]}});
// red pair at square 5 (not star). Star squares on red's track: 0,8,13,21,... so +3 -> 8 is a star.
let s=mk();s.coins.red=[5,5,56,56];s.pending=[6,6,3];
// 6 -> pair moves 3 -> lands on star 8 and splits; then 6,3 can be used by singles. allowed.
assert(ctx.movable_(s,'red',6).length>0,'6 allowed because it reaches a star');
assert.strictEqual(ctx.movable_(s,'red',3).length,0,'3 cannot be used first by a pair');
// pair at 4: 6 -> 7 (not star), second 6 -> 10 (no star): 3 never usable -> nothing allowed
s=mk();s.coins.red=[4,4,56,56];s.pending=[6,6,3];
assert.strictEqual(ctx.movable_(s,'red',6).length,0,'no way to use the 3 -> no roll can be played');
assert(!ctx.legalAny_(s),'nothing legal');
// pair at 2: 6,6 -> 5, 8(star, splits) then 3 usable: allowed
s=mk();s.coins.red=[2,2,56,56];s.pending=[6,6,3];assert(ctx.movable_(s,'red',6).length>0,'6,6 reaches star 8 then 3 ok');
// without an odd roll nothing changes
s=mk();s.coins.red=[4,4,56,56];s.pending=[6,6,4];assert(ctx.movable_(s,'red',6).length>0&&ctx.movable_(s,'red',4).length>0,'even rolls unaffected');
// another single token exists -> old behaviour (odd roll just goes to the single)
s=mk();s.coins.red=[4,4,9,56];s.pending=[6,3];assert(ctx.movable_(s,'red',6).length>=1&&ctx.movable_(s,'red',3).includes(2),'singles unaffected');
// allow map for the screen
s=mk();s.coins.red=[5,5,56,56];s.pending=[6,6,3];ctx.refreshAllow_(s);assert(s.allow&&s.allow[6].length>0&&s.allow[3].length===0,'allow map');
console.log('strict pair rule ok');
