import './config.js';
import { api, cloudEnabled } from './supabase.js';
const params=new URLSearchParams(location.search);
let code=params.get('device')||localStorage.getItem('telaviva-device-code');
function createCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(6));return [...bytes].map(value=>chars[value%chars.length]).join('')}
if(!code){code=createCode();localStorage.setItem('telaviva-device-code',code)}
let deviceSecret=localStorage.getItem('telaviva-device-secret');
if(!deviceSecret){const bytes=crypto.getRandomValues(new Uint8Array(24));deviceSecret=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem('telaviva-device-secret',deviceSecret)}
document.querySelector('#device-code').textContent=code;
const pairUrl=`${location.origin}/?pair=${code}`;
document.querySelector('#pair-address').textContent=pairUrl;
const qrSize=Math.min(420,Math.max(180,Math.floor(window.innerWidth*.23)));
new QRCode(document.querySelector('#pair-qr'),{text:pairUrl,width:qrSize,height:qrSize,colorDark:'#111711',colorLight:'#f8faf4',correctLevel:QRCode.CorrectLevel.M});
let playing=false,mediaTimer,currentSignature='';
function showPairing(message){document.querySelector('#pairing').style.display='flex';const waiting=document.querySelector('.waiting');if(message)waiting.innerHTML=`<i></i> ${message}`}
function play(items){
  const signature=items.map(x=>`${x.id}:${x.url}`).join('|');if(playing&&signature===currentSignature)return;clearTimeout(mediaTimer);playing=true;currentSignature=signature;let index=0,failures=0;
  const next=()=>{clearTimeout(mediaTimer);const item=items[index++%items.length],layer=document.querySelector('#media-layer');layer.innerHTML='';
    const success=()=>{failures=0;document.querySelector('#pairing').style.display='none'};
    const failed=()=>{failures++;if(failures>=items.length){playing=false;layer.innerHTML='';showPairing('Conteúdo indisponível');return}mediaTimer=setTimeout(next,500)};
    const el=document.createElement(item.type==='video'?'video':'img');el.className='media-enter';el.src=item.url;
    if(item.type==='video'){el.autoplay=true;el.muted=true;el.playsInline=true;el.oncanplay=success;el.onended=next;el.onerror=failed}else{el.onload=success;el.onerror=failed;mediaTimer=setTimeout(next,10000)}
    layer.appendChild(el);
  };next();
}
let registered=false;
function resetDevice(){
  localStorage.removeItem('telaviva-device-code');
  localStorage.removeItem('telaviva-device-secret');
  location.replace('/tv');
}
async function checkCloud(){
  try{
    if(!registered){await api.rpc('register_screen',{p_device_code:code,p_device_secret:deviceSecret});registered=true}
    const payload=await api.rpc('player_content',{p_device_code:code,p_device_secret:deviceSecret});
    if(payload?.paired&&payload.items?.length)play(payload.items);else if(!playing)showPairing('Aguardando conexão');
    document.querySelector('#offline-note').classList.remove('show');
  }catch(e){
    if(String(e?.message||e).includes('unauthorized_device')){resetDevice();return}
    const note=document.querySelector('#offline-note');
    note.textContent=String(e?.message||e).includes('rate_limited')?'Muitas tentativas · aguarde um minuto':'Sem conexão · tentando novamente';
    note.classList.add('show');
  }
}
if(cloudEnabled){checkCloud();setInterval(checkCloud,5000)}else{showPairing('Configuração indisponível');document.querySelector('#offline-note').classList.add('show')}
