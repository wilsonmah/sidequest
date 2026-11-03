'use strict';
// Public pages: pricing toggle on the landing page; log in, sign up and password reset on auth.html.
const $=id=>document.getElementById(id);

document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{
 const yearly=button.dataset.period==='year';
 document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 $('pro-price').innerHTML=yearly?'$72<small> / year</small>':'$9<small> / month</small>';
 $('pro-note').textContent=yearly?'$6 a month, billed yearly.':'Billed monthly. Cancel any time.';
}));

const form=$('auth-form');
if(form){
 const page=location.pathname.replace(/^\//,'')||'login';
 const resetToken=new URLSearchParams(location.hash.slice(1)).get('token');
 const modes={
  login:{title:'Welcome back',intro:'Log in to pick up where you left off.',submit:'Log in',endpoint:'login',links:'<a href="/reset">Forgot password?</a><a href="/signup">Create an account</a>'},
  signup:{title:'Start your first quest',intro:'Free for 3 active projects. No card needed.',submit:'Create free account',endpoint:'signup',links:'<span>Already have an account? <a href="/login">Log in</a></span>'},
  request:{title:'Reset your password',intro:'We’ll email you a link to choose a new password.',submit:'Send reset link',endpoint:'reset-request',links:'<a href="/login">Back to log in</a>'},
  reset:{title:'Choose a new password',intro:'Use at least 10 characters. Other devices will be signed out.',submit:'Save new password',endpoint:'reset',links:'<a href="/login">Back to log in</a>'}
 };
 const mode=page==='reset'?(resetToken?'reset':'request'):(modes[page]?page:'login');
 const m=modes[mode];
 document.title='SideQuest — '+m.title;
 $('auth-title').textContent=m.title;$('auth-intro').textContent=m.intro;$('auth-submit').textContent=m.submit;$('auth-links').innerHTML=m.links;
 $('email-field').hidden=mode==='reset';$('password-field').hidden=mode==='request';$('terms-field').hidden=mode!=='signup';
 if(mode==='signup'||mode==='reset'){$('password').autocomplete='new-password';$('password-label').textContent=mode==='reset'?'New password':'Password (10+ characters)'}
 if(resetToken)history.replaceState(null,'',location.pathname);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const message=$('auth-message'),submit=$('auth-submit');
  message.className='form-message';message.textContent='';
  const data={email:$('email').value,password:$('password').value,terms:$('terms').checked,token:resetToken};
  if(mode!=='reset'&&!$('email').checkValidity()){message.textContent='Please enter a valid email address.';return}
  if(mode!=='request'&&data.password.length<10){message.textContent='Use a password of at least 10 characters.';return}
  if(mode==='signup'&&!data.terms){message.textContent='Please accept the terms and privacy policy.';return}
  submit.disabled=true;
  try{
   const response=await fetch('/api/auth/'+m.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(payload.error||'Something went wrong. Please try again.');
   if(mode==='request'){message.className='form-message ok';message.textContent='If that email has an account, a reset link is on its way. Check your inbox.';return}
   location.href=new URLSearchParams(location.search).get('plan')==='pro'?'/app?upgrade=1':'/app';
  }catch(error){message.textContent=error.message==='Failed to fetch'?'Cannot reach SideQuest. Check your connection and try again.':error.message}
  finally{submit.disabled=false}
 });
 // Keep the Pro intent from the pricing page through sign-up.
 if(location.search.includes('plan=pro'))document.querySelectorAll('#auth-links a[href="/login"]').forEach(a=>a.href='/login?plan=pro');
}
