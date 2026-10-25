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
let state={projects:[],wins:[],ideas:[]},summary=null,view='today',filter='all',token='',ready=false;
function connectionFailure(message){$('connection-status').hidden=false;$('connection-message').textContent=message;$('retry-connection').hidden=false;}
async function api(action,data){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 let response,payload;
 try{response=await fetch('/api/'+action,{signal:controller.signal,method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Sidequest-Token':token},body:data===undefined?undefined:JSON.stringify(data)});payload=await response.json()}
 catch{const message='Cannot reach SideQuest. Run start.cmd, then retry the connection. If you were saving, reconnect to check the result.';connectionFailure(message);throw Error(message)}
 finally{clearTimeout(timeout)}
 if(!response.ok){const error=Error(payload.error||'Could not save. Please try again.');error.status=response.status;if(response.status===403)connectionFailure('The local service restarted. Retry the connection before saving again.');throw error}
 if(payload.token)token=payload.token;
 if(payload.state){state=payload.state;summary=payload.summary;render()}
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
 $('project-grid').innerHTML=projects.map((p,i)=>`<article class="project-card"><div class="card-top"><span class="project-icon ${['peach','lilac','mint'][i%3]}">${p.category==='money'?'↗':'✳'}</span><div class="card-meta"><span class="category-tag">${p.category==='money'?'Income idea':'Just for you'}</span><button class="edit-button" data-edit="${escapeHTML(p.id)}" aria-label="Edit ${escapeHTML(p.name)}" title="Edit quest">⋯</button></div></div><h3>${escapeHTML(p.name)}</h3><p class="project-type">${p.sample?'STARTER IDEA · MAKE IT YOURS':'YOUR SIDEQUEST'}</p><p class="card-context"><span>Last time:</span> ${escapeHTML(p.context||'A fresh start. Your next move is ready.')}</p><div class="next-box"><div class="next-label"><span>${p.done?'QUEST COMPLETE':'YOUR NEXT SMALL ACTION'}</span><span>${p.done?'✓':p.minutes+' min'}</span></div><p>${escapeHTML(p.done?'A little idea. A real achievement.':p.next)}</p></div>${p.blocker&&!p.done?'<p class="blocker">Waiting on: '+escapeHTML(p.blocker)+'</p>':''}<div class="card-foot"><span>${p.category==='money'?money(p.income)+' / '+money(p.goal)+' goal':'A little time, just for you'}</span><button ${p.done?'data-reopen':'data-focus'}="${escapeHTML(p.id)}">${p.done?'Pick it back up':'Let’s do this'} ↗</button></div>${!p.done?`<button class="share-quest-button" data-share="${escapeHTML(p.id)}" aria-label="Share a copy of ${escapeHTML(p.name)}">Pass on this quest ↗</button>`:''}<button class="delete-button" data-delete-quest="${escapeHTML(p.id)}" aria-label="Delete ${escapeHTML(p.name)}">Delete quest</button></article>`).join('')||`<div class="empty"><h3>${view==='completed'?'Your wins will live here.':'Room for your next idea.'}</h3><p>${view==='completed'?'Finish a project to add it to your win pile.':'Create a quest or choose a different filter.'}</p>${view==='active'?'<button class="button primary" id="empty-new">Start a quest ＋</button>':''}</div>`;
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
 $('project-next').required=!p?.done||reopen;
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
$('create-quest').onclick=()=>openProject();$('open-pro').onclick=$('pro-footer').onclick=()=>$('pro-dialog').showModal();
$('project-category').onchange=()=>$('money-fields').hidden=$('project-category').value!=='money';
$('project-form').onsubmit=async e=>{e.preventDefault();const input={name:$('project-name').value.trim(),category:$('project-category').value,minutes:Number($('project-minutes').value),context:$('project-context').value.trim(),next:$('project-next').value.trim(),blocker:$('project-blocker').value.trim(),goal:Number($('project-goal').value),income:Number($('project-income').value)};const submit=e.submitter||$('project-form').querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;try{const r=await saveProject(input,$('project-id').value,reopeningProject,promotingIdea);$('project-dialog').close();if(r.savedOnDevice)toast('Quest saved. Future you says thanks.')}catch(error){$('project-error').textContent=error.message}finally{submit.disabled=false}};
let focus=null,timerInterval=null,polling=false,timerBusy=false,focusDisconnected=false,focusRevision=0;
function updateTimer(){
 const remaining=focus?.remaining||0;
 $('timer').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
 $('finish-step').disabled=timerBusy||focusDisconnected||!focus?.finished;
 $('timer-toggle').disabled=timerBusy||focusDisconnected||!focus||focus.finished;
 $('timer-reset').disabled=timerBusy||focusDisconnected||!focus;
 $('timer-toggle').textContent=focus?.finished?'Focus complete':focus?.running?'Pause':'Start / resume';
 $('focus-status').textContent=focus?.finished?'Focus complete. Finish your step to claim 25 XP.':'Finish the focus timer to unlock 25 XP. Paused time does not count.';
 if(focusDisconnected)$('focus-status').textContent='Connection interrupted. Your timer will be checked again automatically; XP stays locked until confirmed.';
}
async function pollTimer(){
 if(!focus||polling||timerBusy)return;polling=true;const id=focus.id,revision=focusRevision;
 try{const result=await api('focus/'+id);if(focus?.id===id&&revision===focusRevision){focus=result;focusDisconnected=false;updateTimer()}}
 catch(error){if(focus?.id===id&&revision===focusRevision){if(error.status===400){focus=null;clearInterval(timerInterval);toast(error.message)}else focusDisconnected=true;updateTimer()}}finally{polling=false}
}
async function startFocus(id,budget){
 if(timerBusy)return;timerBusy=true;focusRevision++;focusDisconnected=false;
 try{const result=await api(budget?'pick':'focus',budget?{budget}:{id});focus=result;
 const p=state.projects.find(p=>p.id===focus.projectId);
 $('focus-project').textContent=p.name;$('focus-action').textContent=p.next;$('focus-context').textContent=p.context;$('next-after').value='';
 $('focus-dialog').showModal();clearInterval(timerInterval);timerInterval=setInterval(pollTimer,1000);
 return {projectId:p.id,minutes:p.minutes,status:'ready'};
 }finally{timerBusy=false;updateTimer()}
}
async function timerAction(action){if(timerBusy||!focus)return;timerBusy=true;focusRevision++;const id=focus.id;updateTimer();try{const result=await api(action,{sessionId:id});if(focus?.id===id)focus=result}catch(error){if(!error.status)focusDisconnected=true;toast(error.message)}finally{timerBusy=false;updateTimer()}}
$('timer-toggle').onclick=()=>timerAction(focus?.running?'pause':'start');
$('timer-reset').onclick=()=>timerAction('reset');
$('focus-dialog').addEventListener('close',()=>{const id=focus?.id;focus=null;clearInterval(timerInterval);if(id)api('cancel',{sessionId:id}).catch(error=>toast(error.message))});

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close()}));
async function completeStep(next){if(!focus)throw Error('Open a focus session first.');return api('complete',{sessionId:focus.id,next})}
function celebrate(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<32;i++){const bit=document.createElement('i');bit.className='confetti';bit.style.left=Math.random()*100+'vw';bit.style.background=['#ed5834','#bba4ed','#d9b847','#77a489'][i%4];bit.style.animationDelay=Math.random()*.4+'s';document.body.appendChild(bit);setTimeout(()=>bit.remove(),2400)}}
$('finish-step').onclick=async()=>{
 if(!focus||timerBusy)return;timerBusy=true;updateTimer();
 try{const quest={...state.projects.find(p=>p.id===focus.projectId)};const result=await completeStep($('next-after').value);focus=null;$('focus-dialog').close();celebrate();showWin(state.wins[state.wins.length-1],quest,result)}
 catch(error){toast(error.message)}finally{timerBusy=false;updateTimer()}
};

$('project-grid').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='empty-new')openProject();if(b.dataset.deleteQuest)requestDelete('quest',b.dataset.deleteQuest);if(b.dataset.edit)openProject(b.dataset.edit);if(b.dataset.focus)launchFocus(b.dataset.focus);if(b.dataset.reopen)openProject(b.dataset.reopen,true);if(b.dataset.share){const p=state.projects.find(p=>p.id===b.dataset.share);if(p)openQuestShare(p)}};
$('pick-quest').onclick=()=>perform($('pick-quest'),()=>startFocus(null,Number($('time-budget').value)));
$('export').onclick=()=>{location.href='/api/backup'};
$('import-button').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{
 if(file.size>5000000)throw Error('Please choose a backup smaller than 5 MB.');
 await api('import',{workspace:JSON.parse(await file.text())});toast('Backup merged. Existing quests kept.');
 }catch(error){toast(error.message||'Could not restore that file.')}finally{e.target.value=''}};

let todayBudget=60;
function renderToday(){
 const quest=state.projects.find(p=>p.id===summary.recommendations[String(todayBudget)]);
 $('resume-card').innerHTML=quest?`<div class="resume-top"><span class="eyebrow">${todayBudget===15?'YOUR 15-MINUTE PICK':quest.updatedAt?'READY TO PICK BACK UP':'A SMALL PLACE TO START'}</span><span class="duration">${quest.minutes} min</span></div><p class="resume-project">${escapeHTML(quest.name)}${quest.sample?' · starter idea':''}</p><h2>${escapeHTML(quest.next)}</h2><div class="resume-context"><span>Where you left off</span><p>${escapeHTML(quest.context||'A fresh start. Everything you need to begin is in this one step.')}</p></div>${quest.blocker?`<p class="resume-blocker">Waiting on: ${escapeHTML(quest.blocker)}</p>`:''}<button class="button primary resume-start" data-resume="${escapeHTML(quest.id)}">${quest.blocker?'Review this step':'Continue this quest'} <span>↗</span></button><button class="text-button" data-adjust="${escapeHTML(quest.id)}">Adjust the next step</button>`:`<span class="eyebrow">${todayBudget===15?'KEEP IT SMALL':'A FRESH LITTLE START'}</span><h2>${todayBudget===15?'No 15-minute step yet.':'Space for your next little thing.'}</h2><p>${todayBudget===15?'Break one of your projects into a smaller action, or start a short quest.':'Turn a saved idea into a quest, or give a new project its first step.'}</p><button class="button primary" id="today-new">Create a ${todayBudget===15?'15-minute ':'new '}quest ↗</button>${todayBudget===15?'<button class="text-button" id="clear-budget">Show all time options</button>':''}`;
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
 $('win-next').textContent=current&&!current.done?`Next time: ${current.next}`:'A small step finished. A little more room to feel proud.';
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
 if(connecting)return;connecting=true;$('retry-connection').disabled=true;
 try{await api('workspace');ready=true;document.querySelector('main').inert=false;$('connection-status').hidden=true;receiveQuestLink()}
 catch(error){connectionFailure(error.message)}
 finally{connecting=false;$('retry-connection').disabled=false}
}
$('retry-connection').onclick=initialize;
initialize();
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}};
 register({name:'list_quests',title:'List Sidequest projects',description:'Read the local Python workspace’s active and completed quests and XP total.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({projects:state.projects.map(p=>({...p})),xp:summary?.xp||0})});
 register({name:'start_focus_session',title:'Open a focus session',description:'Open an active quest in the focus dialog. Does not start the clock or complete a step.',inputSchema:{type:'object',properties:{projectId:{type:'string'}},required:['projectId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input.projectId!=='string')throw Error('A project ID is required.');return startFocus(input.projectId)}});
}
