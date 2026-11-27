const vm=require('vm'),fs=require('fs');
const SRC=require('fs').readFileSync(__dirname+'/../src/engine/core.js','utf8')+'\n'+require('fs').readFileSync(__dirname+'/../src/engine/games.js','utf8');
global.CNT=global.CNT||{sheet:0,cache:0,lock:0,put:0};
class Sheet{constructor(n){this.n=n;this.d=[];this.cols=0}
 getLastRow(){return this.d.length} getLastColumn(){return this.cols} getMaxRows(){return 1000} setFrozenRows(){}
 getRange(r,c,nr,nc){CNT.sheet++;const t=this;nr=nr||1;nc=nc||1;return{
  getValues(){const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++){const v=(t.d[r-1+i]||[])[c-1+j];row.push(v===undefined?'':v)}o.push(row)}return o},
  setValues(v){for(let i=0;i<nr;i++){t.d[r-1+i]=t.d[r-1+i]||[];for(let j=0;j<nc;j++)t.d[r-1+i][c-1+j]=v[i][j]}t.cols=Math.max(t.cols,c-1+nc)},
  setValue(v){t.d[r-1]=t.d[r-1]||[];t.d[r-1][c-1]=v;t.cols=Math.max(t.cols,c)},setNumberFormat(){}}}
 getDataRange(){CNT.sheet++;return{getValues:()=>this.d.map(r=>{const o=[];for(let j=0;j<this.cols;j++)o.push(r[j]===undefined?'':r[j]);return o})}}
 appendRow(a){CNT.sheet++;this.d.push(a.slice());this.cols=Math.max(this.cols,a.length)} deleteRow(i){this.d.splice(i-1,1)}}
function make(){
 const sheets={},mails=[],cache=new Map();
 const ctx={console,JSON,Math,Date,String,Number,Object,Array,RegExp,Error,Map,Set,parseInt,parseFloat,isNaN,
  SpreadsheetApp:{openById:()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=new Sheet(n)})},
  CacheService:{getScriptCache:()=>({get:k=>{CNT.cache++;return cache.has(k)?cache.get(k):null},put:(k,v)=>{CNT.put++;cache.set(k,v)},remove:k=>cache.delete(k),removeAll:ks=>ks.forEach(k=>cache.delete(k)),getAll:ks=>{const o={};ks.forEach(k=>{if(cache.has(k))o[k]=cache.get(k)});return o}})},
  LockService:{getScriptLock:()=>({waitLock(){CNT.lock++},releaseLock(){}})},
  MailApp:{sendEmail:m=>mails.push(m)},ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/X/exec'})},
  Utilities:{getUuid:()=>require('crypto').randomUUID()},HtmlService:{}};
 vm.createContext(ctx);vm.runInContext(SRC+'\n;this.__api={'+
  (SRC.match(/^function ([A-Za-z0-9]+)\(/gm)||[]).map(x=>x.replace(/function |\(/g,'')).map(n=>n+':'+n).join(',')+',CONFIG}',ctx);
 return{api:ctx.__api,sheets,mails,ctx};
}
module.exports={make};
