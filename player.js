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
let playing=false,mediaTimer,currentSignature='',playbackRun=0,activeLayer=null;
const playbackLayers=[document.querySelector('#media-layer'),document.querySelector('#transition-layer')];
function showPairing(message){document.querySelector('#pairing').style.display='flex';const waiting=document.querySelector('.waiting');if(message)waiting.innerHTML=`<i></i> ${message}`}
function showConnectedEmpty(){playbackRun++;clearTimeout(mediaTimer);playing=false;playbackLayers.forEach(layer=>{layer.innerHTML='';layer.classList.remove('visible','incoming')});activeLayer=null;document.querySelector('#pairing').style.display='flex';document.querySelector('.pair-content h1').innerHTML='Tela conectada,<br><span>aguardando conteúdo.</span>';document.querySelector('.pair-content>div>p:not(.eyebrow)').textContent='Crie uma playlist no painel e use Configurar TV para exibi-la nesta tela.';document.querySelector('.steps').style.display='none';document.querySelector('.qr-card').style.display='none';document.querySelector('.waiting').innerHTML='<i></i> Conectada ao painel'}
function play(items){
  const signature=items.map(x=>`${x.id}:${x.url}:${x.duration}:${x.fit}`).join('|');if(playing&&signature===currentSignature)return;
  clearTimeout(mediaTimer);playing=true;currentSignature=signature;const runId=++playbackRun;let index=0,failures=0;
  items.filter(item=>item.type!=='video').forEach(item=>{const preload=new Image();preload.decoding='async';preload.src=item.url});
  const next=()=>{
    if(runId!==playbackRun)return;clearTimeout(mediaTimer);
    const item=items[index++%items.length],staging=activeLayer===playbackLayers[0]?playbackLayers[1]:playbackLayers[0],previous=activeLayer;
    staging.classList.remove('visible','incoming');staging.innerHTML='';
    const el=document.createElement(item.type==='video'?'video':'img');let ready=false;
    el.src=item.url;el.style.objectFit=['cover','contain','fill'].includes(item.fit)?item.fit:'cover';
    const failed=()=>{if(ready||runId!==playbackRun)return;ready=true;staging.innerHTML='';failures++;if(failures>=items.length){playing=false;showPairing('Conteúdo indisponível');return}mediaTimer=setTimeout(next,500)};
    const reveal=()=>{if(ready||runId!==playbackRun)return;ready=true;failures=0;document.querySelector('#pairing').style.display='none';requestAnimationFrame(()=>requestAnimationFrame(()=>staging.classList.add('incoming')));setTimeout(()=>{if(runId!==playbackRun)return;if(previous){const oldMedia=previous.querySelector('video');if(oldMedia)oldMedia.pause();previous.classList.remove('visible','incoming');previous.innerHTML=''}staging.classList.remove('incoming');staging.classList.add('visible');activeLayer=staging;if(item.type!=='video')mediaTimer=setTimeout(next,Math.min(3600,Math.max(1,Number(item.duration)||10))*1000)},500)};
    if(item.type==='video'){el.autoplay=true;el.muted=true;el.playsInline=true;el.preload='auto';el.oncanplay=reveal;el.onended=()=>{if(runId===playbackRun)next()};el.onerror=failed}else{el.decoding='async';el.onload=reveal;el.onerror=failed}
    staging.appendChild(el);
  };
  next();
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
    if(payload?.paired&&payload.items?.length)play(payload.items);else if(payload?.paired)showConnectedEmpty();else if(!playing)showPairing('Aguardando conexão');
    document.querySelector('#offline-note').classList.remove('show');
  }catch(e){
    if(String(e?.message||e).includes('unauthorized_device')){resetDevice();return}
    const note=document.querySelector('#offline-note');
    note.textContent=String(e?.message||e).includes('rate_limited')?'Muitas tentativas · aguarde um minuto':'Sem conexão · tentando novamente';
    note.classList.add('show');
  }
}
if(cloudEnabled){checkCloud();setInterval(checkCloud,5000)}else{showPairing('Configuração indisponível');document.querySelector('#offline-note').classList.add('show')}
