const {make}=require('./harness');const assert=require('assert');const {ctx}=make();
const st=()=>({activeColors:['red','green'],teamMode:false,pairs:[],lock:null,coins:{red:[-1,-1,-1,-1],green:[-1,-1,-1,-1]}});
// green pair on global 5 -> red square 5 (red start 0). Red single at 3.
let s=st();s.coins.red[0]=3;s.coins.green=[ (5-13+52)%52,(5-13+52)%52,-1,-1];s.pairs=[['green:0','green:1']];
assert(ctx.movable_(s,'red',2).includes(0),'2 lands on the pair: allowed');
assert(!ctx.movable_(s,'red',3).includes(0),'3 would jump over: blocked');
assert(!ctx.movable_(s,'red',5).includes(0),'5 jump: blocked');
assert(ctx.movable_(s,'red',1).includes(0),'1 stops before: allowed');
// a single (non-pair) opponent does not block
s.pairs=[];assert(ctx.movable_(s,'red',3).includes(0),'single opponent does not block');
// own pair does not block
s=st();s.coins.red=[3,5,5,-1];s.pairs=[['red:1','red:2']];assert(ctx.movable_(s,'red',3).includes(0),'own pair is no block');
console.log('block rules ok');
