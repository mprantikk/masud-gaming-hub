const {make}=require('./harness');const assert=require('assert');const {ctx}=make();
const st={activeColors:['red','green','yellow','blue'],coins:{red:[56,56,56,56],green:[3,-1,-1,-1],yellow:[56,56,56,56],blue:[5,-1,-1,-1]},turn:'blue',bonus:0,pending:[],pairs:[]};
ctx.endCycle_(st);assert.strictEqual(st.turn,'green','skip finished red');
st.turn='green';ctx.endCycle_(st);assert.strictEqual(st.turn,'blue','skip finished yellow');
st.turn='red';st.bonus=2;ctx.endCycle_(st);assert.strictEqual(st.turn,'green');assert.strictEqual(st.bonus,0);
st.turn='blue';st.bonus=1;ctx.endCycle_(st);assert.strictEqual(st.turn,'blue','active player keeps bonus');
console.log('DONE-SKIP PASS');
