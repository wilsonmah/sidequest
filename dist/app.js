'use strict';
// Browser-only presentation of share links. All workspace rules live in Python.
const SidequestProgress = (() => {
  function recipe(value) {
    const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
    if (!value || value.v !== 1 || !text(value.title, 70) || !text(value.action, 140) ||
      ![15, 30, 60].includes(value.minutes) || !['money', 'personal'].includes(value.category)) {
      throw Error('This quest link is incomplete or unsupported. Your workspace is unchanged.');
    }
    // Only these four quest fields are allowed to leave the workspace.
    return { v: 1, title: value.title.trim(), action: value.action.trim(), minutes: value.minutes, category: value.category };
  }
  function encodeRecipe(value, base) {
    const url = new URL(base);
    url.search = '';
    url.hash = 'quest=' + encodeURIComponent(JSON.stringify(recipe(value)));
    return url.href;
  }
  function decodeRecipe(hash) {
    if (!hash.startsWith('#quest=')) return null;
    if (hash.length > 4096) throw Error('This quest link is too long. Your workspace is unchanged.');
    try { return recipe(JSON.parse(decodeURIComponent(hash.slice(7)))); }
    catch { throw Error('This quest link is incomplete or unsupported. Your workspace is unchanged.'); }
  }
  function winMessage(win, includeDetails, total, base) {
    const url = new URL(base); url.hash = ''; url.search = '';
    const detail = includeDetails ? `I finished “${win.action}” on “${win.project}”.` : 'I moved a side project forward, one small step at a time.';
    return `${detail}\n${total} little ${total === 1 ? 'win' : 'wins'} and counting. +25 XP for showing up.\nWhat could you move forward in 15 minutes?\nMade with Sidequest · ${url.href}`;
  }
  return { recipe, encodeRecipe, decodeRecipe, winMessage };
})();


'use strict';
const $=id=>document.getElementById(id);
let state={projects:[],wins:[],ideas:[]},summary=null,view='today',filter='all',token='',ready=false,account={mode:'local'};
const hosted=()=>account.mode==='hosted';
function connectionFailure(message){$('connection-status').hidden=false;$('connection-message').textContent=message;$('retry-connection').hidden=false;}
async function api(action,data){
 const revision=data===undefined?focusRevision:++focusRevision;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 let response,payload;
 try{response=await fetch('/api/'+action,{signal:controller.signal,method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Sidequest-Token':token},body:data===undefined?undefined:JSON.stringify(data)});payload=await response.json()}
 catch{const message=hosted()?'Cannot reach SideQuest. Check your connection, then retry. If you were saving, reconnect to check the result.':'Cannot reach SideQuest. Run start.cmd, then retry the connection. If you were saving, reconnect to check the result.';connectionFailure(message);throw Error(message)}
 finally{clearTimeout(timeout)}
 if(!response.ok){const error=Error(payload.error||'Could not save. Please try again.');error.status=response.status;
  if(response.status===401&&payload.login){location.href='/login';throw error}
  if(response.status===402&&payload.upgrade)openPro(payload.error);
  if(response.status===403)connectionFailure(hosted()?'Your session changed. Retry the connection before saving again.':'The local service restarted. Retry the connection before saving again.');throw error}
 if(action==='workspace'&&revision!==focusRevision)return payload;
 if(payload.token)token=payload.token;
 if(payload.account){account=payload.account;renderAccount()}
 if(payload.state){state=payload.state;summary=payload.summary;if(Object.hasOwn(payload,'focus'))syncFocus(payload.focus);render()}
 return payload.result??payload;
}
async function perform(button,operation){if(button.disabled)return;button.disabled=true;try{return await operation()}catch(error){toast(error.message)}finally{button.disabled=false}}
function launchFocus(id){startFocus(id).catch(error=>toast(error.message))}

const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
function render(){
 if(!summary)return;
 renderToday();
 renderMomentum();
 renderInsights();
 document.querySelectorAll('[data-view]').forEach(b=>{const selected=b.dataset.view===(view==='completed'?'active':view);b.setAttribute('aria-pressed',String(selected));b.classList.toggle('active',selected)});
 document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
 const active=state.projects.filter(p=>!p.done),xp=summary.xp;
 $('active-stat').textContent=active.length;$('nav-count').textContent=active.length;
 $('xp-stat').innerHTML=xp+' <small>'+ (xp?'One step further':'Just getting started')+'</small>';
 $('wins-stat').textContent=state.wins.length;$('income-stat').textContent=money(summary.income);
 const titles={today:['Today','Pick up where you left off','A little context. One next step. You’re ready.'],active:['Quests','Room for your next idea','Your projects, ready whenever you are.'],completed:['The win pile','Look how far you’ve come','Finished projects, ready for their next chapter.'],progress:['Progress','Small steps. Real progress','A record of the work you made time for.']};
 const title=titles[view];$('crumb').textContent=title[0];$('page-title').innerHTML=title[1]+'<span>.</span>';$('page-description').textContent=title[2];
 const board=view==='active'||view==='completed';
 $('today-panel').hidden=view!=='today';$('ideas-panel').hidden=!['today','active'].includes(view);
 $('board-panel').hidden=!board;$('picker-panel').hidden=!board||view==='completed';
 ['stats-panel','momentum-panel','wins-panel'].forEach(id=>$(id).hidden=view!=='progress');
 $('active-tab').setAttribute('aria-pressed',String(view==='active'));$('completed-tab').setAttribute('aria-pressed',String(view==='completed'));
 $('board-title').innerHTML=(view==='active'?'On your radar':'Completed projects')+' <span id="board-count"></span>';
 const projects=state.projects.filter(p=>(view==='completed'?p.done:!p.done)&&(filter==='all'||p.category===filter));$('board-count').textContent=projects.length;
 $('project-grid').innerHTML=projects.map((p,i)=>`<article class="project-card"><div class="card-top"><span class="project-icon ${['peach','lilac','mint'][i%3]}">${p.category==='money'?'↗':'✳'}</span><div class="card-meta"><span class="category-tag">${p.category==='money'?'Income idea':'Just for you'}</span><button class="edit-button" data-edit="${escapeHTML(p.id)}" aria-label="Edit ${escapeHTML(p.name)}" title="Edit quest">⋯</button></div></div><h3>${escapeHTML(p.name)}</h3><p class="project-type">${p.sample?'STARTER IDEA · MAKE IT YOURS':'YOUR SIDEQUEST'}</p><p class="card-context"><span>Last time:</span> ${escapeHTML(p.context||'A fresh start. Your next move is ready.')}</p><div class="next-box"><div class="next-label"><span>${p.done?'QUEST COMPLETE':'YOUR NEXT SMALL ACTION'}</span><span>${p.done?'✓':p.minutes+' min'}</span></div><p>${escapeHTML(p.done?'A little idea. A real achievement.':p.next||'Ready for your next step — add it when you know.')}</p></div>${p.blocker&&!p.done?'<p class="blocker">Waiting on: '+escapeHTML(p.blocker)+'</p>':''}<div class="card-foot"><span>${p.category==='money'?money(p.income)+' / '+money(p.goal)+' goal':'A little time, just for you'}</span><button ${p.done?'data-reopen':'data-focus'}="${escapeHTML(p.id)}">${p.done?'Pick it back up':p.next?'Let’s do this':'Add next step'} ↗</button></div>${!p.done?`<button class="text-button" data-finish-project="${escapeHTML(p.id)}">Finish project</button>`:''}${!p.done&&p.next?`<button class="share-quest-button" data-share="${escapeHTML(p.id)}" aria-label="Share a copy of ${escapeHTML(p.name)}">Pass on this quest ↗</button>`:''}<button class="delete-button" data-delete-quest="${escapeHTML(p.id)}" aria-label="Delete ${escapeHTML(p.name)}">Delete quest</button></article>`).join('')||`<div class="empty"><h3>${view==='completed'?'Your wins will live here.':'Room for your next idea.'}</h3><p>${view==='completed'?'Finish a project to add it to your win pile.':'Create a quest or choose a different filter.'}</p>${view==='active'?'<button class="button primary" id="empty-new">Start a quest ＋</button>':''}</div>`;
 $('recent-wins').innerHTML=state.wins.length?state.wins.slice(-3).reverse().map(w=>`<div class="win-item"><span>✓</span><div><p>${escapeHTML(w.action)}</p><small>${escapeHTML(w.project)} · ${new Date(w.at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div><b>＋25 XP</b></div>`).join(''):'<div class="no-wins"><span>✧</span><div><strong>Your first win is one small step away.</strong><p>Finish a quest step and give yourself a little credit.</p></div></div>';
 const level=summary.level;$('level-title').textContent='Level '+level+' · '+(level===1?'The starter':level<4?'The maker':level<8?'The builder':'The finisher');$('level-progress').value=summary.levelXP;$('level-xp').textContent=(summary.levelXP)+' / 100 XP';
}
let toastTimeout;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),4500)}

let reopeningProject=false,promotingIdea=null;
function openProject(id,reopen=false){
 promotingIdea=null;
 $('project-error').textContent='';
 reopeningProject=reopen;
 const p=state.projects.find(p=>p.id===id);$('project-form').reset();$('project-id').value=p?.id||'';$('form-title').textContent=p?'A little context for future you.':'Start a sidequest.';
 $('project-name').value=p?.name||'';$('project-category').value=p?.category||'money';$('project-minutes').value=p?.minutes||15;$('project-context').value=p?.context||'';$('project-next').value=p?.next||'';$('project-blocker').value=p?.blocker||'';$('project-goal').value=p?.goal||0;$('project-income').value=p?.income||0;
 $('project-next').required=!p||reopen;
 $('money-fields').hidden=$('project-category').value!=='money';$('project-dialog').showModal();$('project-name').focus();
}
async function saveProject(input,id,reopen=false,ideaId=null){return api('save',{project:input,id:id||null,reopen,ideaId})}
function setView(next){if(!['today','active','completed','progress'].includes(next))return;view=next;render();$('page-title').focus();}
let pendingDelete=null;
function requestDelete(kind,id){
 const item=(kind==='quest'?state.projects:state.ideas).find(item=>item.id===id);if(!item)return;
 pendingDelete={kind,id};$('delete-title').textContent='Delete this '+kind+'?';$('delete-description').textContent='“'+item.name+'” will be removed from your local workspace. '+(kind==='quest'?'Its recorded income will be removed, but earned wins and XP will stay. ':'')+'This cannot be undone.';$('delete-error').textContent='';$('delete-dialog').showModal();$('cancel-delete').focus();
}
async function deleteItem(kind,id){await api('delete',{kind,id});if(kind==='quest'&&focus?.projectId===id){focus=null;$('focus-dialog').close()}}
$('confirm-delete').onclick=()=>perform($('confirm-delete'),async()=>{if(!pendingDelete)return;try{const {kind,id}=pendingDelete;await deleteItem(kind,id);pendingDelete=null;$('delete-dialog').close();$('page-title').focus();toast(kind==='quest'?'Quest deleted. Earned wins and XP kept.':'Idea deleted.')}catch(error){$('delete-error').textContent=error.message}});

$('delete-dialog').addEventListener('close',()=>{pendingDelete=null});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(n=>n.classList.toggle('selected',n===b));render()}));
$('new-project').onclick=$('capture-idea').onclick=()=>{ $('capture-form').reset();$('capture-error').textContent='';$('capture-dialog').showModal();$('idea-name').focus()};
$('create-quest').onclick=()=>openProject();$('open-pro').onclick=$('pro-footer').onclick=()=>openPro();
$('project-category').onchange=()=>$('money-fields').hidden=$('project-category').value!=='money';
$('project-form').onsubmit=async e=>{e.preventDefault();const input={name:$('project-name').value.trim(),category:$('project-category').value,minutes:Number($('project-minutes').value),context:$('project-context').value.trim(),next:$('project-next').value.trim(),blocker:$('project-blocker').value.trim(),goal:Number($('project-goal').value),income:Number($('project-income').value)};const submit=e.submitter||$('project-form').querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;try{const r=await saveProject(input,$('project-id').value,reopeningProject,promotingIdea);$('project-dialog').close();if(r.savedOnDevice)toast('Quest saved. Future you says thanks.')}catch(error){$('project-error').textContent=error.message}finally{submit.disabled=false}};
let focus=null,timerInterval=null,polling=false,timerBusy=false,focusDisconnected=false,focusRevision=0;
let displayedSession=null,pendingSwitch=null,pendingFinish=null;
function syncFocus(session){
 const changed=focus?.id!==session?.id;
 focus=session;focusDisconnected=false;
 if(changed){focusRevision++;displayedSession=null;if($('focus-dialog').open)$('focus-dialog').close()}
 clearInterval(timerInterval);timerInterval=focus?setInterval(pollTimer,1000):null;
 updateTimer();
}
function updateTimer(){
 const remaining=focus?.remaining||0;
 $('timer').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
 // The ring fills as the timer runs; the quest's length is the full circle.
 const total=(state.projects.find(p=>p.id===focus?.projectId)?.minutes||15)*60,ring=$('focus-timer');
 if(ring.style)ring.style.setProperty('--p',focus?String(Math.min(1,Math.max(0,1-remaining/total))):'0');
 $('finish-step').disabled=timerBusy||focusDisconnected||!focus;
 $('timer-toggle').disabled=timerBusy||focusDisconnected||!focus||focus.finished;
 $('timer-reset').disabled=timerBusy||focusDisconnected||!focus;
 $('timer-toggle').textContent=focus?.finished?'Focus complete':focus?.running?'Pause':'Start / resume';
 $('focus-status').textContent=focus?.finished?'Timer finished. Mark the step complete when your work is done.':'The timer is optional. Finish your step whenever the work is done, even before time is up.';
 if(focusDisconnected)$('focus-status').textContent='Connection interrupted. Your session is saved; reconnect before making changes.';
 $('session-banner').hidden=!focus;
 const project=state.projects.find(p=>p.id===focus?.projectId);
 $('session-label').textContent=focus?`${project?.name||'Your step'} · ${focusDisconnected?'Reconnecting':focus.finished?'Timer finished':focus.running?'Timer running':'Timer ready / paused'} · ${$('timer').textContent}`:'';
 $('resume-session').disabled=timerBusy||focusDisconnected;
}
async function pollTimer(){
 if(!focus||polling||timerBusy)return;polling=true;const id=focus.id,revision=focusRevision;
 try{const result=await api('focus/'+id);if(focus?.id===id&&revision===focusRevision){focus=result;focusDisconnected=false;updateTimer()}}
 catch(error){if(focus?.id===id&&revision===focusRevision){if(error.status===400){syncFocus(null);toast(error.message);await initialize()}else focusDisconnected=true;updateTimer()}}finally{polling=false}
}
function showFocus(){
 if(!focus)return;
 const p=state.projects.find(p=>p.id===focus.projectId);if(!p)return;
 $('focus-project').textContent=p.name;$('focus-action').textContent=p.next;$('focus-context').textContent=p.context;
 if(displayedSession!==focus.id){$('next-after').value='';displayedSession=focus.id}
 if(!$('focus-dialog').open)$('focus-dialog').showModal();updateTimer();
}
$('resume-session').onclick=showFocus;
async function startFocus(id,budget,replaceSessionId){
 if(timerBusy)return;
 const project=state.projects.find(p=>p.id===id);
 if(project&&!project.next.trim()){openProject(id);return}
 if(focus&&focus.projectId!==id&&!replaceSessionId){pendingSwitch={id,budget,sessionId:focus.id};$('switch-dialog').showModal();return}
 timerBusy=true;focusRevision++;focusDisconnected=false;
 try{const result=await api(budget?'pick':'focus',budget?{budget,replaceSessionId}:{id,replaceSessionId});focus=result;
 const p=state.projects.find(p=>p.id===focus.projectId);
 showFocus();clearInterval(timerInterval);timerInterval=setInterval(pollTimer,1000);
 return {projectId:p.id,minutes:p.minutes,status:'ready'};
 }finally{timerBusy=false;updateTimer()}
}
$('confirm-switch').onclick=()=>perform($('confirm-switch'),async()=>{if(!pendingSwitch)return;const {id,budget,sessionId}=pendingSwitch;$('switch-dialog').close();await startFocus(id,budget,sessionId)});
$('switch-dialog').addEventListener('close',()=>{pendingSwitch=null});
async function timerAction(action){if(timerBusy||!focus)return;timerBusy=true;focusRevision++;const id=focus.id;updateTimer();try{const result=await api(action,{sessionId:id});if(focus?.id===id)focus=result}catch(error){if(!error.status)focusDisconnected=true;toast(error.message)}finally{timerBusy=false;updateTimer()}}
$('timer-toggle').onclick=()=>timerAction(focus?.running?'pause':'start');
$('timer-reset').onclick=()=>timerAction('reset');
// Closing or refreshing never cancels a session; the server owns its clock.

function requestFinishProject(id){
 const project=state.projects.find(p=>p.id===id&&!p.done);if(!project)return;
 pendingFinish=id;$('finish-project-description').textContent=`Move “${project.name}” to completed projects? This ends its current session without recording another step or awarding XP. You can reopen the project later.`;
 $('finish-project-error').textContent='';$('finish-project-dialog').showModal();$('keep-project').focus();
}
$('finish-project-dialog').addEventListener('close',()=>{pendingFinish=null});
$('confirm-finish-project').onclick=()=>perform($('confirm-finish-project'),async()=>{
 if(!pendingFinish||timerBusy)return;timerBusy=true;focusRevision++;updateTimer();
 try{await api('finish-project',{id:pendingFinish});$('finish-project-dialog').close();$('win-dialog').close();toast('Project completed. Your wins and XP are kept.')}
 catch(error){$('finish-project-error').textContent=error.message}
 finally{timerBusy=false;updateTimer()}
});
$('finish-project-from-win').onclick=()=>{if(receipt?.quest)requestFinishProject(receipt.quest.id)};

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close()}));
async function completeStep(next){if(!focus)throw Error('Open a focus session first.');return api('complete',{sessionId:focus.id,next})}
function celebrate(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<32;i++){const bit=document.createElement('i');bit.className='confetti';bit.style.left=Math.random()*100+'vw';bit.style.background=['#ed5834','#bba4ed','#d9b847','#77a489'][i%4];bit.style.animationDelay=Math.random()*.4+'s';document.body.appendChild(bit);setTimeout(()=>bit.remove(),2400)}}
$('finish-step').onclick=async()=>{
 if(!focus||timerBusy||focusDisconnected)return;timerBusy=true;focusRevision++;updateTimer();
 try{const quest={...state.projects.find(p=>p.id===focus.projectId)};const result=await completeStep($('next-after').value);focus=null;$('focus-dialog').close();celebrate();showWin(state.wins[state.wins.length-1],quest,result)}
 catch(error){if(!error.status)focusDisconnected=true;toast(error.message)}finally{timerBusy=false;updateTimer()}
};

$('project-grid').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='empty-new')openProject();if(b.dataset.finishProject)requestFinishProject(b.dataset.finishProject);if(b.dataset.deleteQuest)requestDelete('quest',b.dataset.deleteQuest);if(b.dataset.edit)openProject(b.dataset.edit);if(b.dataset.focus)launchFocus(b.dataset.focus);if(b.dataset.reopen)openProject(b.dataset.reopen,true);if(b.dataset.share){const p=state.projects.find(p=>p.id===b.dataset.share);if(p)openQuestShare(p)}};
$('pick-quest').onclick=()=>perform($('pick-quest'),()=>startFocus(null,Number($('time-budget').value)));
$('export').onclick=()=>{location.href='/api/backup'};
$('import-button').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{
 if(file.size>5000000)throw Error('Please choose a backup smaller than 5 MB.');
 await api('import',{workspace:JSON.parse(await file.text())});toast('Backup merged. Existing quests kept.');
 }catch(error){toast(error.message||'Could not restore that file.')}finally{e.target.value=''}};

let todayBudget=60;
function renderToday(){
 const quest=state.projects.find(p=>p.id===summary.recommendations[String(todayBudget)])||state.projects.find(p=>!p.done&&!p.next.trim());
 $('resume-card').innerHTML=quest?`<div class="resume-top"><span class="eyebrow">${todayBudget===15?'YOUR 15-MINUTE PICK':quest.updatedAt?'READY TO PICK BACK UP':'A SMALL PLACE TO START'}</span><span class="duration">${quest.minutes} min</span></div><p class="resume-project">${escapeHTML(quest.name)}${quest.sample?' · starter idea':''}</p><h2>${escapeHTML(quest.next||'Choose your next small step')}</h2><div class="resume-context"><span>Where you left off</span><p>${escapeHTML(quest.context||'A fresh start. Everything you need to begin is in this one step.')}</p></div>${quest.blocker?`<p class="resume-blocker">Waiting on: ${escapeHTML(quest.blocker)}</p>`:''}<button class="button primary resume-start" data-resume="${escapeHTML(quest.id)}">${!quest.next?'Add next step':quest.blocker?'Review this step':'Continue this quest'} <span>↗</span></button><button class="text-button" data-adjust="${escapeHTML(quest.id)}">Adjust the next step</button>`:`<span class="eyebrow">${todayBudget===15?'KEEP IT SMALL':'A FRESH LITTLE START'}</span><h2>${todayBudget===15?'No 15-minute step yet.':'Space for your next little thing.'}</h2><p>${todayBudget===15?'Break one of your projects into a smaller action, or start a short quest.':'Turn a saved idea into a quest, or give a new project its first step.'}</p><button class="button primary" id="today-new">Create a ${todayBudget===15?'15-minute ':'new '}quest ↗</button>${todayBudget===15?'<button class="text-button" id="clear-budget">Show all time options</button>':''}`;
 $('fifteen-minutes').setAttribute('aria-pressed',String(todayBudget===15));
 const ideas=[...state.ideas].sort((a,b)=>b.at-a.at);
 $('idea-count').textContent=ideas.length?String(ideas.length):'';
 const visible=view==='today'?ideas.slice(0,3):ideas;
 $('idea-list').innerHTML=visible.length?visible.map(i=>`<div class="saved-idea"><span>${escapeHTML(i.name)}</span><button data-plan="${escapeHTML(i.id)}">Give it a next step ↗</button><button class="delete-button" data-delete-idea="${escapeHTML(i.id)}" aria-label="Delete ${escapeHTML(i.name)}">Delete idea</button></div>`).join('')+(ideas.length>visible.length?'<button class="text-button" id="all-ideas">See all '+ideas.length+' ideas ↗</button>':''):'<p class="ideas-empty">A thought is enough. Capture it now; figure out the next step later.</p>';
}
async function captureIdea(name){await api('capture',{name});return true}
$('capture-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter||$('capture-form').querySelector('[type=submit]');await perform(button,async()=>{try{await captureIdea($('idea-name').value);$('capture-dialog').close();toast('Idea saved. No plan needed yet.')}catch(error){$('capture-error').textContent=error.message}})};

$('fifteen-minutes').onclick=()=>{todayBudget=todayBudget===15?60:15;renderToday();$('today-status').textContent=todayBudget===15?'Showing a step that fits 15 minutes.':'Showing your next available step.'};
$('resume-card').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.resume)launchFocus(b.dataset.resume);if(b.dataset.adjust)openProject(b.dataset.adjust);if(b.id==='today-new')openProject();if(b.id==='clear-budget'){todayBudget=60;renderToday()}};
$('idea-list').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.deleteIdea){requestDelete('idea',b.dataset.deleteIdea);return}if(b.id==='all-ideas'){setView('active');return}const idea=state.ideas.find(i=>i.id===b.dataset.plan);if(idea){openProject();promotingIdea=idea.id;$('project-name').value=idea.name;$('form-title').textContent='Give your idea a small start.';$('project-next').focus()}};
function renderMomentum(){
 if(!summary)return;const progress=summary.progress;
 $('momentum-copy').textContent=progress.steps?`${progress.steps} ${progress.steps===1?'step':'steps'} finished in the last 7 days. Your next little win is waiting.`:'Finish one small step to leave your first mark.';
 $('rhythm-total').textContent=progress.activeDays>=3?`${progress.activeDays} active days · rhythm found`:`${progress.activeDays} / 3 days`;
 $('week-trail').innerHTML=progress.days.map((day,i)=>{
  const date=new Date(day.date+'T12:00:00');const label=date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  return `<li class="${day.count?'has-win ':''}${i===6?'is-today':''}" aria-label="${escapeHTML(label)}: ${day.count} finished ${day.count===1?'step':'steps'}${i===6?', today':''}"><span>${escapeHTML(date.toLocaleDateString(undefined,{weekday:'short'}))}</span><b aria-hidden="true">${day.count?'✓':'·'}</b><small>${i===6?'Today':date.getDate()}</small></li>`;
 }).join('');
 $('milestones').innerHTML=summary.progress.milestones.map(m=>`<span class="milestone ${state.wins.length>=m.at?'earned':''}" title="${escapeHTML(m.description)}">${state.wins.length>=m.at?'✓':'○'} ${escapeHTML(m.name)} <small>${m.at} ${m.at===1?'win':'wins'}</small></span>`).join('');
 $('next-milestone').textContent=progress.next?`${progress.next.at-state.wins.length} more ${progress.next.at-state.wins.length===1?'step':'steps'} to “${progress.next.name}”. Every milestone you earn stays yours.`:'All four milestones earned. Your next chapter is yours to choose.';
 $('share-latest').hidden=!state.wins.length;
}
let receipt=null;
function showWin(win,quest=null,result=null){
 receipt={win,quest}; $('receipt-sharing').open=false;
 $('win-action').textContent=win.action;
 const milestone=summary.progress.milestones.find(m=>m.at===state.wins.length);
 $('win-milestone').hidden=!milestone;
 $('win-milestone').textContent=milestone?`Milestone earned: ${milestone.name}`:'';
 const current=quest&&state.projects.find(p=>p.id===quest.id);
 $('win-next').textContent=current&&!current.done?(current.next?`Next time: ${current.next}`:'Your project is still active. Add the next step whenever you are ready.'):'A small step finished. A little more room to feel proud.';
 $('finish-project-from-win').hidden=!current||current.done;
 $('share-details').checked=false;
 $('win-share-status').textContent=''; $('win-save-status').textContent=result&&!result.savedOnDevice?'This win is only in memory. Download a backup before leaving.':'';
 updateWinMessage();$('win-dialog').showModal();
}
function updateWinMessage(){
 if(receipt)$('win-message').value=SidequestProgress.winMessage(receipt.win,$('share-details').checked,state.wins.length,location.href);
}
async function copyPreview(field,status){
 try{await navigator.clipboard.writeText(field.value);status.textContent='Copied. Share it wherever you like.';}
 catch{field.focus();field.select();status.textContent='Copy is unavailable here. The text is selected; use your browser’s Copy command.';}
}
$('share-latest').onclick=()=>{const win=state.wins.reduce((latest,w)=>!latest||w.at>latest.at?w:latest,null);if(win)showWin(win)};
$('share-details').onchange=updateWinMessage;
$('copy-win').onclick=()=>copyPreview($('win-message'),$('win-share-status'));
$('pass-quest').onclick=()=>{if(!receipt)return;const {win,quest}=receipt;$('win-dialog').close();openQuestShare({name:win.project,next:win.action,minutes:quest?.minutes||15,category:quest?.category||'personal'})};
function openQuestShare(quest){
 $('share-name').value=quest.name;$('share-action').value=quest.next;
 $('share-minutes').value=String(quest.minutes);$('share-category').value=quest.category;
 $('quest-share-status').textContent='';updateQuestLink();$('share-dialog').showModal();
}
function updateQuestLink(){
 try{$('quest-link').value=SidequestProgress.encodeRecipe({v:1,title:$('share-name').value,action:$('share-action').value,minutes:Number($('share-minutes').value),category:$('share-category').value},location.href);return true;}
 catch{$('quest-link').value='';return false;}
}
$('share-form').oninput=()=>{updateQuestLink();$('quest-share-status').textContent=''};
$('share-form').onsubmit=e=>{e.preventDefault();if(updateQuestLink())copyPreview($('quest-link'),$('quest-share-status'));else $('quest-share-status').textContent='Add a quest name and a small action before sharing.'};
function receiveQuestLink(){
 if(!location.hash.startsWith('#quest='))return;
 if(document.querySelector('dialog[open]'))return;
 try{
  const shared=SidequestProgress.decodeRecipe(location.hash);
  openProject();$('form-title').textContent='Make this quest yours.';
  $('project-name').value=shared.title;$('project-next').value=shared.action;
  $('project-minutes').value=String(shared.minutes);$('project-category').value=shared.category;
  $('money-fields').hidden=shared.category!=='money';
 }catch(error){toast(error.message)}
 // Remove the payload from the current address; nothing is saved until Save quest.
 history.replaceState(null,'',location.pathname+location.search);
}
window.addEventListener('hashchange',receiveQuestLink);
window.addEventListener('focus',()=>initialize());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',receiveQuestLink));
let connecting=false;
async function initialize(){
 if(connecting||timerBusy)return;connecting=true;$('retry-connection').disabled=true;
 try{await api('workspace');ready=true;document.querySelector('main').inert=false;$('connection-status').hidden=true;receiveQuestLink();checkoutReturn()}
 catch(error){connectionFailure(error.message)}
 finally{connecting=false;$('retry-connection').disabled=false}
}
$('retry-connection').onclick=initialize;

// Account, plan and billing. In the local edition every feature is included and these stay hidden.
function renderAccount(){
 const on=hosted(),pro=account.plan==='pro';
 $('profile-avatar').textContent=on?account.email[0].toUpperCase():'Y';
 $('profile-name').textContent=on?account.email:'Your workspace';
 $('profile-plan').textContent=on?(pro?'Pro plan':`Free plan · ${account.freeLimit} active quests`):'Saved on this computer';
 $('pro-card-copy').textContent=on&&pro?'You’re on Pro. Manage billing':'Unlimited quests and reports';
 $('mode-label').textContent=on?'Saved to your account':'Local Python app';
 $('account-links').hidden=!on;
 $('save-note').textContent=on?'Your quests are saved to your account. Download a backup any time.':'Your quests are saved on this computer. Download a backup to keep a copy.';
}
function openPro(reason){
 const on=hosted(),pro=account.plan==='pro';
 $('pro-reason').hidden=!reason;$('pro-reason').textContent=reason||'';
 $('pro-actions').hidden=!on||pro||!account.billing;
 $('manage-billing').hidden=!on||!account.canManage;
 $('pro-status').textContent=!on?'Pro is part of the hosted edition. This local edition already includes every feature.':pro?(account.status==='past_due'?'Your last payment didn’t go through. Update your card in Manage billing to keep Pro.':'You’re on Pro. Thank you for supporting SideQuest.'):account.billing?'Secure checkout by Stripe. Cancel any time; your projects always stay.':'Upgrades open soon.';
 if(!$('pro-dialog').open)$('pro-dialog').showModal();
}
function billingRedirect(button,path,data){return perform(button,async()=>{const result=await api(path,data);location.href=result.url})}
$('upgrade-month').onclick=()=>billingRedirect($('upgrade-month'),'billing/checkout',{interval:'month'});
$('upgrade-year').onclick=()=>billingRedirect($('upgrade-year'),'billing/checkout',{interval:'year'});
$('manage-billing').onclick=()=>billingRedirect($('manage-billing'),'billing/portal',{});
$('logout').onclick=()=>perform($('logout'),async()=>{await api('auth/logout',{});location.href='/'});
$('delete-account').onclick=()=>{$('account-password').value='';$('account-error').textContent='';$('account-dialog').showModal()};
$('account-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter||$('account-form').querySelector('[type=submit]');
 await perform(button,async()=>{try{await api('account/delete',{password:$('account-password').value});location.href='/'}catch(error){$('account-error').textContent=error.message}})};
function checkoutReturn(){
 const params=new URLSearchParams(location.search||'');
 if(!params.has('upgraded')&&!params.has('upgrade'))return;
 if(typeof history!=='undefined')history.replaceState(null,'',location.pathname);
 if(params.has('upgrade')){if(account.plan!=='pro')openPro();return}
 // Stripe's webhook can land a moment after the redirect; check again shortly.
 if(account.plan==='pro')toast('Welcome to Pro. Every quest you want, no cap.');
 else{toast('Payment received. Pro will switch on in a moment.');setTimeout(()=>api('workspace').then(()=>account.plan==='pro'&&toast('Pro is on. Thank you!')).catch(()=>{}),4000)}
}
function renderInsights(){
 $('insights-panel').hidden=view!=='progress';
 const data=summary.insights;
 if(!data){$('insights-body').innerHTML='<div class="insights-locked"><p>See twelve weeks of finished steps and which side hustles are earning.</p><button class="button dark" id="insights-upgrade">Unlock with Pro ↗</button></div>';return}
 const max=Math.max(1,...data.weeks.map(w=>w.count));
 $('insights-body').innerHTML=`<ol class="week-bars" aria-label="Steps finished per week, last 12 weeks">${data.weeks.map(w=>{const d=new Date(w.start+'T12:00:00');return `<li aria-label="Week of ${escapeHTML(d.toLocaleDateString(undefined,{month:'short',day:'numeric'}))}: ${w.count} ${w.count===1?'step':'steps'}"><b data-count="${w.count}"></b><small>${escapeHTML(d.toLocaleDateString(undefined,{month:'numeric',day:'numeric'}))}</small></li>`}).join('')}</ol>`+
  (data.income.length?`<div class="income-report"><span class="eyebrow">TOP EARNING PROJECTS</span>${data.income.map(p=>`<div class="income-row"><span>${escapeHTML(p.name)}</span><strong>${money(p.income)}</strong><small>${p.goal?Math.round(p.income/p.goal*100)+'% of '+money(p.goal)+' goal':'No goal set'}</small></div>`).join('')}</div>`:'<p class="insights-empty">Log earnings on an income quest to see it here.</p>');
 // Heights are set through the CSSOM so the strict Content-Security-Policy needs no inline styles.
 document.querySelectorAll('.week-bars b').forEach(bar=>bar.style.setProperty('--h',Math.max(4,Number(bar.dataset.count)/max*100)+'%'));
}
$('insights-body').onclick=e=>{if(e.target.closest('#insights-upgrade'))openPro()};
initialize();
// Theme: follows the system until the person picks one; the choice is remembered in this browser.
const root=document.documentElement;
const systemDark=()=>typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches;
function setTheme(theme){if(!root)return;root.dataset.theme=theme;try{localStorage.setItem('sidequest-theme',theme)}catch{}}
function toggleTheme(){setTheme((root?.dataset.theme||(systemDark()?'dark':'light'))==='dark'?'light':'dark')}
try{const saved=localStorage.getItem('sidequest-theme');if(root&&(saved==='dark'||saved==='light'))root.dataset.theme=saved}catch{}
$('theme-toggle').onclick=toggleTheme;

// Command menu (Ctrl/⌘K) and single-key shortcuts, so everything is reachable from the keyboard.
const isMac=typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||'');
document.querySelectorAll('.mod-key').forEach(k=>k.textContent=isMac?'⌘ K':'Ctrl K');
function commandList(){
 const go=(view,label,key,icon)=>({group:'Navigate',label,key,icon,run:()=>setView(view)});
 const items=[go('today','Go to Today','1','◷'),go('active','Go to Quests','2','▦'),go('progress','Go to Progress','3','✦'),
  {group:'Create',label:'Capture an idea',key:'C',icon:'✳',run:()=>$('capture-idea').click()},
  {group:'Create',label:'New quest',key:'N',icon:'＋',run:()=>openProject()},
  {group:'Focus',label:'Find a 15-minute step',icon:'⏱',run:()=>{setView('today');if(todayBudget!==15)$('fifteen-minutes').click()}}];
 if(focus)items.push({group:'Focus',label:'Return to current step',icon:'↺',run:()=>$('resume-session').click()});
 state.projects.filter(p=>!p.done&&p.next.trim()).forEach(p=>items.push({group:'Focus',label:'Focus: '+p.name,detail:p.next,icon:'→',run:()=>launchFocus(p.id)}));
 items.push({group:'Workspace',label:'Toggle dark mode',key:'D',icon:'◐',run:toggleTheme},
  {group:'Workspace',label:'Download backup',icon:'↓',run:()=>$('export').click()},
  {group:'Workspace',label:hosted()&&account.plan==='pro'?'Manage your plan':'Explore Pro',icon:'✦',run:()=>openPro()});
 return items;
}
let commandMatches=[],commandIndex=0;
function renderCommands(){
 const query=$('command-input').value.trim().toLowerCase();
 commandMatches=commandList().filter(c=>!query||(c.label+' '+(c.detail||'')).toLowerCase().includes(query));
 commandIndex=Math.min(commandIndex,Math.max(0,commandMatches.length-1));
 let group='';
 $('command-list').innerHTML=commandMatches.length?commandMatches.map((c,i)=>{
  const head=c.group!==group?`<li class="command-group" role="presentation">${escapeHTML(c.group)}</li>`:'';group=c.group;
  return head+`<li role="presentation"><button class="command-item" role="option" id="command-${i}" data-index="${i}" aria-selected="${i===commandIndex}" tabindex="-1"><span aria-hidden="true">${c.icon}</span><span>${escapeHTML(c.label)}</span>${c.key?`<kbd>${c.key}</kbd>`:''}</button></li>`;
 }).join(''):'<li class="command-empty" role="presentation">No matching commands.</li>';
 $('command-input').setAttribute('aria-activedescendant',commandMatches.length?'command-'+commandIndex:'');
 document.getElementById('command-'+commandIndex)?.scrollIntoView?.({block:'nearest'});
}
function openCommand(){
 if(!ready||$('command-dialog').open)return;
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 $('command-input').value='';commandIndex=0;renderCommands();$('command-dialog').showModal();$('command-input').focus();
}
function runCommand(index){const command=commandMatches[index];if(!command)return;$('command-dialog').close();command.run()}
$('open-command').onclick=openCommand;
$('command-input').oninput=()=>{commandIndex=0;renderCommands()};
$('command-input').onkeydown=e=>{
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=commandMatches.length;if(n){commandIndex=(commandIndex+(e.key==='ArrowDown'?1:n-1))%n;renderCommands()}}
 if(e.key==='Enter'){e.preventDefault();runCommand(commandIndex)}
};
$('command-list').onclick=e=>{const b=e.target.closest('[data-index]');if(b)runCommand(Number(b.dataset.index))};
window.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('command-dialog').open?$('command-dialog').close():openCommand();return}
 if(!ready||e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;
 if(e.target.closest?.('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]'))return;
 const keys={'1':()=>setView('today'),'2':()=>setView('active'),'3':()=>setView('progress'),c:()=>$('capture-idea').click(),n:()=>openProject(),d:toggleTheme,'/':openCommand};
 const action=keys[e.key.toLowerCase()];
 if(action){e.preventDefault();action()}
});

if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}};
 register({name:'list_quests',title:'List Sidequest projects',description:'Read the local Python workspace’s active and completed quests and XP total.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({projects:state.projects.map(p=>({...p})),xp:summary?.xp||0})});
 register({name:'start_focus_session',title:'Open a focus session',description:'Open an active quest in the focus dialog. Does not start the clock or complete a step.',inputSchema:{type:'object',properties:{projectId:{type:'string'}},required:['projectId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input.projectId!=='string')throw Error('A project ID is required.');return startFocus(input.projectId)}});
}
