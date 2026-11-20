'use strict';
// Static demo (GitHub Pages): answers the app's /api/ calls in the browser and keeps data in
// localStorage, following the same rules as sidequest.py. Loaded before app.js; nothing is sent anywhere.
(()=>{
 const KEY='sidequest-demo-v1',FREE_LIMIT=3,DAY=86400000;
 const MILESTONES=[{at:1,name:'First spark',description:'Finish your first step'},{at:5,name:'Finding a rhythm',description:'Finish 5 steps'},{at:20,name:'Making it happen',description:'Finish 20 steps'},{at:50,name:'Built by you',description:'Finish 50 steps'}];
 const uuid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
 const project=(id,name,category,minutes,context,next,extra={})=>({id,name,category,minutes,context,next,blocker:'',goal:0,income:0,done:false,sample:false,updatedAt:0,...extra});

 function seed(){
  const now=Date.now(),ago=d=>now-d*DAY-3600000;
  return {focus:null,state:{
   projects:[
    project('demo-shop','Launch a tiny template shop','money',30,'Finished the cover design. Pricing at $12 felt right after checking similar shops.','Write the product description for template #2',{goal:500,income:120,updatedAt:ago(0.2)}),
    project('demo-newsletter','Pottery newsletter','personal',15,'Outlined issue #1: glazing mistakes I made this month.','Pick three photos for the first issue',{updatedAt:ago(1)}),
    project('sample-3','Build your freelance launchpad','money',30,'A small place to start. Make this quest yours.','Write a one-paragraph service offer',{sample:true})],
   ideas:[{id:'idea-1',name:'Notion template pack for tutors',at:ago(2)},{id:'idea-2',name:'Weekend bread-baking class',at:ago(5)}],
   wins:[[8,'Sketch the shop layout','Launch a tiny template shop'],[6,'Draft template #1','Launch a tiny template shop'],[4,'Choose a newsletter name','Pottery newsletter'],[3,'Set up the shop page','Launch a tiny template shop'],[1,'Outline issue #1','Pottery newsletter'],[0.3,'Design the cover for template #2','Launch a tiny template shop']].map(([d,action,p])=>({action,project:p,at:ago(d)}))}};
 }
 const load=()=>{try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&saved.state)return saved}catch{}return seed()};
 let db=load();
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}};

 class Rule extends Error{constructor(message,status=400,extra={}){super(message);this.status=status;this.extra=extra}}
 const nowS=()=>Date.now()/1000;
 const activeOwn=s=>s.projects.filter(p=>!p.done&&!p.sample).length;
 function recommend(projects,budget){
  const key=p=>[p.blocker?1:0,p.sample?1:0,-p.updatedAt,p.minutes];
  return projects.filter(p=>!p.done&&p.next.trim()&&p.minutes<=budget).sort((a,b)=>{const x=key(a),y=key(b);for(let i=0;i<4;i++)if(x[i]!==y[i])return x[i]-y[i];return 0})[0]||null;
 }
 function summary(s){
  const now=Date.now(),days=[];
  for(let i=6;i>=0;i--){const d=new Date(now-i*DAY);days.push({date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,count:0})}
  for(const w of s.wins){if(w.at>now||w.at<now-8*DAY)continue;const d=new Date(w.at),k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const day=days.find(x=>x.date===k);if(day)day.count++}
  const total=s.wins.length,recs={};for(const b of [15,30,60]){const p=recommend(s.projects,b);recs[b]=p?p.id:null}
  return {xp:total*25,level:Math.floor(total/4)+1,levelXP:total*25%100,activeCount:s.projects.filter(p=>!p.done).length,
   income:s.projects.reduce((a,p)=>a+p.income,0),recommendations:recs,
   progress:{days,steps:days.reduce((a,d)=>a+d.count,0),activeDays:days.filter(d=>d.count).length,milestones:MILESTONES,next:MILESTONES.find(m=>m.at>total)||null},insights:null};
 }
 function view(f){const remaining=Math.max(0,f.remaining-(f.startedAt!=null?Math.max(0,nowS()-f.startedAt):0));return {id:f.id,projectId:f.projectId,remaining:Math.ceil(remaining),running:f.startedAt!=null&&remaining>0,finished:remaining<=0}}
 const invalidate=id=>{if(db.focus&&db.focus.projectId===id)db.focus=null};
 const account={mode:'hosted',email:'demo@sidequest.app',plan:'free',status:null,periodEnd:null,billing:false,canManage:false,freeLimit:FREE_LIMIT};
 const text=(v,limit,required)=>{if(typeof v!=='string'||v.length>limit||(required&&!v.trim()))throw new Rule(`Please enter valid text of up to ${limit} characters.`);return v};

 function act(action,data){
  const s=structuredClone(db.state),before=activeOwn(s);let result={};const now=Date.now();
  if(action==='save'){
   const old=s.projects.find(p=>p.id===data.id);if(data.id&&!old)throw new Rule('This quest was deleted. Reload your workspace.');
   const p=data.project||{};text(p.name,70,true);text(p.next,140,!old||data.reopen);
   const saved={...p,id:data.id||uuid(),done:!!(old&&old.done&&!data.reopen),sample:false,updatedAt:now};
   s.projects=old?s.projects.map(q=>q.id===data.id?saved:q):[...s.projects,saved];
   if(data.ideaId){if(!s.ideas.some(i=>i.id===data.ideaId))throw new Rule('This idea has already been moved or deleted. Reload your workspace.');s.ideas=s.ideas.filter(i=>i.id!==data.ideaId)}
   if(old)invalidate(old.id);result={id:saved.id,savedOnDevice:true};
  }else if(action==='finish-project'){
   const q=s.projects.find(p=>p.id===data.id&&!p.done);if(!q)throw new Rule('Choose an active project.');
   Object.assign(q,{done:true,sample:false,updatedAt:now});invalidate(q.id);result={savedOnDevice:true};
  }else if(action==='capture'){
   s.ideas.push({id:uuid(),name:text(data.name,70,true).trim(),at:now});
  }else if(action==='delete'){
   if(data.kind==='quest'){s.projects=s.projects.filter(p=>p.id!==data.id);invalidate(data.id)}else s.ideas=s.ideas.filter(i=>i.id!==data.id);
  }else if(action==='import'){
   const w=data.workspace;if(!w||!Array.isArray(w.projects)||!Array.isArray(w.wins))throw new Rule('This is not a Sidequest backup.');
   for(const key of ['projects','ideas']){const ids=new Set(s[key].map(x=>x.id));for(const x of w[key]||[])if(!ids.has(x.id))s[key].push(x)}
   const seen=new Set(s.wins.map(x=>x.action+'|'+x.project+'|'+x.at));for(const x of w.wins)if(!seen.has(x.action+'|'+x.project+'|'+x.at))s.wins.push(x);
  }else if(action==='focus'||action==='pick'){
   let q;
   if(action==='pick'){const pool=s.projects.filter(p=>!p.done&&p.next.trim()&&p.minutes<=data.budget);if(!pool.length)throw new Rule('No quest fits yet. Try more time or add a shorter step.');const open=pool.filter(p=>!p.blocker);q=(open.length?open:pool)[Math.floor(Math.random()*(open.length||pool.length))]}
   else q=s.projects.find(p=>p.id===data.id&&!p.done);
   if(!q)throw new Rule('Choose an active quest.');if(!q.next.trim())throw new Rule('Add a next step before starting this project.');
   if(db.focus&&db.focus.projectId===q.id)result=view(db.focus);
   else{if(db.focus&&data.replaceSessionId!==db.focus.id)throw new Rule('Another step is open. Resume it or confirm switching to a new step.');db.focus={id:uuid(),projectId:q.id,remaining:q.minutes*60,duration:q.minutes*60,startedAt:null};result=view(db.focus)}
  }else if(['start','pause','reset','cancel','complete'].includes(action)){
   const f=db.focus;if(!f||f.id!==data.sessionId)throw new Rule('This focus session has ended. Open the quest again.');
   if(action==='cancel')db.focus=null;
   else if(action==='complete'){
    const q=s.projects.find(p=>p.id===f.projectId&&!p.done);if(!q)throw new Rule('This quest is no longer active.');
    const next=text(data.next??'',140).trim();s.wins.push({action:q.next,project:q.name,at:now});
    Object.assign(q,{context:'Finished: '+q.next,next,done:false,blocker:'',sample:false,updatedAt:now});db.focus=null;result={xpAwarded:25,savedOnDevice:true};
   }else{
    const v=view(f);
    if(action==='reset')Object.assign(f,{remaining:f.duration,startedAt:null});
    else if(action==='start'&&f.startedAt==null&&!v.finished)f.startedAt=nowS();
    else if(action==='pause'){if(f.startedAt!=null)f.remaining=Math.max(0,f.remaining-Math.max(0,nowS()-f.startedAt));f.startedAt=null}
    result=view(f);
   }
  }else if(action==='auth/logout'){result={ok:true}}
  else if(action==='account/delete'){db=seed();save();return {ok:true}}
  else if(action.startsWith('billing/'))throw new Rule('Checkout is turned off in this demo. The live product takes payment through Stripe.');
  else throw new Rule('Unknown operation.');
  const active=activeOwn(s);
  if(active>FREE_LIMIT&&active>before)throw new Rule(`The free plan includes ${FREE_LIMIT} active quests. Finish one first, or upgrade to Pro for unlimited quests.`,402,{upgrade:true});
  db.state=s;save();
  return {state:s,summary:summary(s),focus:db.focus&&view(db.focus),result};
 }

 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const realFetch=window.fetch.bind(window);
 window.fetch=async(input,options={})=>{
  const url=typeof input==='string'?input:input.url;
  if(!url.startsWith('/api/'))return realFetch(input,options);
  const path=url.slice(5);
  try{
   if((options.method||'GET')==='GET'){
    if(path==='workspace')return reply({state:db.state,summary:summary(db.state),focus:db.focus&&view(db.focus),token:'demo',account});
    if(path.startsWith('focus/')){if(!db.focus||db.focus.id!==path.slice(6))throw new Rule('This focus session has ended. Open the quest again.');return reply({result:view(db.focus)})}
    if(path==='health')return reply({app:'sidequest',status:'ready'});
    throw new Rule('Not found.',404);
   }
   return reply(act(path,JSON.parse(options.body||'{}')));
  }catch(error){return reply({error:error.message,...(error.extra||{})},error.status||400)}
 };

 // A few app actions navigate to server routes; give them demo equivalents once app.js has set its handlers.
 window.addEventListener('DOMContentLoaded',()=>{
  const $=id=>document.getElementById(id);
  const download=()=>{const blob=new Blob([JSON.stringify({version:1,...db.state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sidequest-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  const reset=()=>{db=seed();save();location.reload()};
  $('export').onclick=download;
  $('logout').onclick=()=>{location.href='./'};
  $('delete-account').textContent='Reset demo data';$('delete-account').onclick=reset;
  const bar=document.createElement('div');bar.className='demo-bar';
  bar.innerHTML='<span><b>Live demo</b> · Everything you do stays in this browser.</span><span><button type="button" id="demo-reset">Reset demo</button><a href="./">About SideQuest</a></span>';
  document.querySelector('.shell').prepend(bar);$('demo-reset').onclick=reset;
 });
})();
