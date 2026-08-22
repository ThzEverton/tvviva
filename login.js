import { signIn,signUp,getValidSession,requestPasswordReset } from './auth.js';
const extra=document.createElement('link');extra.rel='stylesheet';extra.href='/auth-extra.css';document.head.appendChild(extra);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const next=new URLSearchParams(location.search).get('next')||'/';
if(await getValidSession())location.replace(next);
$$('[data-tab]').forEach(button=>button.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===button));$('#login-form').hidden=button.dataset.tab!=='login';$('#signup-form').hidden=button.dataset.tab!=='signup';$('#auth-message').textContent=''});
async function submit(form,action){const button=form.querySelector('.submit'),message=$('#auth-message');button.disabled=true;message.textContent='';try{await action();if(action.name==='createAccount'){message.style.color='#427447';message.textContent='Conta criada. Verifique seu e-mail para confirmar o acesso.'}else location.replace(next)}catch(e){message.style.color='#b6423e';message.textContent=e.message}finally{button.disabled=false}}
$('#login-form').onsubmit=e=>{e.preventDefault();submit(e.currentTarget,()=>signIn($('#login-email').value,$('#login-password').value))};
async function createAccount(){const result=await signUp($('#signup-email').value,$('#signup-password').value,$('#signup-company').value);if(result.access_token)location.replace(next)}
$('#signup-form').onsubmit=e=>{e.preventDefault();submit(e.currentTarget,createAccount)};
$('#forgot-password').onclick=async()=>{const email=$('#login-email').value,message=$('#auth-message');if(!email){message.textContent='Informe seu e-mail primeiro.';return}try{await requestPasswordReset(email);message.style.color='#427447';message.textContent='Enviamos o link de recuperação para seu e-mail.'}catch(e){message.style.color='#b6423e';message.textContent=e.message}};
