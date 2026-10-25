// Optional front-end regressions: node --test tests/frontend.cjs (no packages).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const elements=new Map();let handler=async()=>{throw Error('offline')};
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',classList:{add(){},remove(){}},addEventListener(){},setAttribute(){},focus(){}});return elements.get(id)};
 const context=vm.createContext({URL,AbortController,Intl,Date,console,fetch:(...args)=>handler(...args),setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},location:{hash:''},window:{addEventListener(){}},document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>element('main')}});
 vm.runInContext(source,context);vm.runInContext('render=()=>{}',context);
 return {elements,run:code=>vm.runInContext(code,context),fetch:fn=>{handler=fn}};
}
const ok=payload=>({ok:true,status:200,json:async()=>payload});
test('initial connection failure can retry without reloading',async()=>{
 const a=setup();await tick();assert.equal(a.elements.get('retry-connection').hidden,false);
 a.fetch(async()=>ok({state:{projects:[],ideas:[],wins:[]},summary:{},token:'new-token'}));
 await a.run('initialize()');assert.equal(a.elements.get('connection-status').hidden,true);assert.equal(a.run('token'),'new-token');assert.equal(a.elements.get('main').inert,false);
});
test('temporary timer disconnect retains session and blocks XP until reconfirmed',async()=>{
 const a=setup();await tick();a.run("focus={id:'session',remaining:0,finished:true};");await a.run('pollTimer()');
 assert.equal(a.run('focus.id'),'session');assert.equal(a.elements.get('finish-step').disabled,true);
 a.fetch(async()=>ok({result:{id:'session',remaining:0,finished:true}}));await a.run('pollTimer()');assert.equal(a.elements.get('finish-step').disabled,false);
});
test('obsolete timer poll cannot overwrite a newer timer action',async()=>{
 const a=setup();await tick();a.run("focus={id:'session',remaining:100,running:true};");let release;
 a.fetch(()=>new Promise(resolve=>release=resolve));const pending=a.run('pollTimer()');
 a.run('focusRevision++;focus.remaining=900;focus.running=false');release(ok({result:{id:'session',remaining:99,running:true}}));await pending;
 assert.equal(a.run('focus.remaining'),900);assert.equal(a.run('focus.running'),false);
});
test('restart token rejection offers reconnect and does not retry mutation',async()=>{
 const a=setup();await tick();let calls=0;a.fetch(async()=>{calls++;return {ok:false,status:403,json:async()=>({error:'Reload'})}});
 await assert.rejects(a.run("api('capture',{name:'An idea'})"));assert.equal(calls,1);assert.equal(a.elements.get('retry-connection').hidden,false);
});
