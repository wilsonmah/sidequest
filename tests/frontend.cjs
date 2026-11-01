// Optional front-end regressions: node --test tests/frontend.cjs (no packages).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const elements=new Map();let handler=async()=>{throw Error('offline')};
 const element=id=>{if(!elements.has(id)){const listeners={};elements.set(id,{hidden:false,disabled:false,open:false,value:'',textContent:'',classList:{add(){},remove(){}},addEventListener(name,fn){(listeners[name]??=[]).push(fn)},showModal(){this.open=true},close(){if(!this.open)return;this.open=false;for(const fn of listeners.close||[])fn()},setAttribute(){},focus(){}})}return elements.get(id)};
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

const project={id:'quest',name:'A project',next:'Write a paragraph',context:'Notes',done:false,minutes:15};
const workspace=focus=>({state:{projects:[{...project}],ideas:[],wins:[]},summary:{},token:'token',focus});
test('refresh restores a running session and reopening does not reset it',async()=>{
 const a=setup();await tick();let mutations=0;
 a.fetch(async(url,options)=>{if(options.method==='POST')mutations++;return ok(workspace({id:'saved',projectId:'quest',remaining:423,running:true,finished:false}))});
 await a.run('initialize()');
 assert.equal(a.run('focus.id'),'saved');assert.equal(a.elements.get('session-banner').hidden,false);
 assert.match(a.elements.get('session-label').textContent,/07:03/);
 a.elements.get('resume-session').onclick();assert.equal(a.elements.get('focus-dialog').open,true);
 assert.equal(a.elements.get('finish-step').disabled,false);
 a.elements.get('next-after').value='Draft next step';
 a.elements.get('focus-dialog').close();a.elements.get('resume-session').onclick();
 assert.equal(a.elements.get('next-after').value,'Draft next step');
 assert.equal(a.run('focus.remaining'),423);assert.equal(mutations,0);
});
test('idle and paused restored sessions allow completing without waiting',async()=>{
 for(const remaining of [900,500,0]){
  const a=setup();await tick();a.fetch(async()=>ok(workspace({id:'saved',projectId:'quest',remaining,running:false,finished:remaining===0})));
  await a.run('initialize()');assert.equal(a.elements.get('finish-step').disabled,false);
  assert.equal(a.elements.get('timer-toggle').disabled,remaining===0);
 }
});
test('a stale workspace refresh cannot restore a completed session',async()=>{
 const a=setup();await tick();let release;
 a.fetch(()=>new Promise(resolve=>release=resolve));const pending=a.run('initialize()');
 a.run('focusRevision++;focus=null');
 release(ok(workspace({id:'old',projectId:'quest',remaining:300,running:true})));
 await pending;assert.equal(a.run('focus'),null);
});
test('step completion sends once, clears session and leaves project active',async()=>{
 const a=setup();await tick();
 a.fetch(async()=>ok(workspace({id:'saved',projectId:'quest',remaining:900,running:false,finished:false})));
 await a.run('initialize()');a.run('showFocus();celebrate=()=>{};showWin=()=>{}');a.elements.get('next-after').value='';
 let calls=0,release;
 a.fetch((url,options)=>{calls++;assert.equal(url,'/api/complete');assert.deepEqual(JSON.parse(options.body),{sessionId:'saved',next:''});return new Promise(resolve=>release=resolve)});
 const pending=a.elements.get('finish-step').onclick();await a.elements.get('finish-step').onclick();
 const response=workspace(null);response.state.projects[0].next='';response.state.wins=[{action:project.next,project:project.name,at:1}];response.result={xpAwarded:25};release(ok(response));await pending;
 assert.equal(calls,1);assert.equal(a.run('focus'),null);assert.equal(a.run('state.projects[0].done'),false);assert.equal(a.elements.get('session-banner').hidden,true);
});
test('project completion waits for its separate confirmation',async()=>{
 const a=setup();await tick();a.fetch(async()=>ok(workspace(null)));await a.run('initialize()');
 let calls=0;a.fetch(async(url,options)=>{calls++;assert.equal(url,'/api/finish-project');assert.deepEqual(JSON.parse(options.body),{id:'quest'});const response=workspace(null);response.state.projects[0].done=true;return ok(response)});
 a.run("requestFinishProject('quest')");assert.equal(calls,0);assert.equal(a.elements.get('finish-project-dialog').open,true);
 a.elements.get('finish-project-dialog').close();assert.equal(a.run('pendingFinish'),null);
 a.run("requestFinishProject('quest')");await a.elements.get('confirm-finish-project').onclick();
 assert.equal(calls,1);assert.equal(a.run('state.projects[0].done'),true);
});
test('switching sessions asks first and sends the confirmed session ID',async()=>{
 const a=setup();await tick();a.fetch(async()=>ok(workspace({id:'saved',projectId:'quest',remaining:500,running:true})));
 await a.run('initialize()');a.run("state.projects.push({id:'other',name:'Other',next:'Another step'})");let calls=0;
 a.fetch(async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.replaceSessionId,'saved');return ok({result:{id:'new',projectId:'other',remaining:900,running:false}})});
 await a.run("startFocus('other')");assert.equal(calls,0);assert.equal(a.elements.get('switch-dialog').open,true);
 await a.elements.get('confirm-switch').onclick();assert.equal(calls,1);assert.equal(a.run('focus.id'),'new');
});
