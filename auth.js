import './config.js';

const config=window.TELAVIVA_CONFIG||{};
const url=(config.supabaseUrl||'').replace(/\/$/,'');
const key=config.supabasePublishableKey||'';
const SESSION_KEY='telaviva-auth-v1';

export function getStoredSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function storeSession(data){const session=data?.access_token?{...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)}:null;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);return session}
export function consumeAuthHash(){if(!location.hash.includes('access_token='))return null;const hash=new URLSearchParams(location.hash.slice(1)),data={access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in')||3600),token_type:hash.get('token_type')||'bearer',type:hash.get('type')};const session=storeSession(data);history.replaceState({},'',location.pathname+location.search);return session}
async function authRequest(path,body,token){const response=await fetch(`${url}/auth/v1/${path}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token||key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.msg||data.message||data.error_description||'Não foi possível autenticar');return data}
export async function signIn(email,password){return storeSession(await authRequest('token?grant_type=password',{email:email.trim().toLowerCase(),password}))}
export async function signUp(email,password,companyName){const data=await authRequest('signup',{email:email.trim().toLowerCase(),password,data:{company_name:companyName.trim()}});if(data.access_token)storeSession(data);return data}
export async function refreshSession(){const session=getStoredSession();if(!session?.refresh_token)return null;try{return storeSession(await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token}))}catch{storeSession(null);return null}}
export async function getValidSession(){let session=consumeAuthHash()||getStoredSession();if(!session)return null;if((session.expires_at||0)<Math.floor(Date.now()/1000)+90)session=await refreshSession();if(session&&!session.user){const response=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${session.access_token}`}});if(!response.ok){storeSession(null);return null}session=storeSession({...session,user:await response.json(),expires_in:Math.max(90,(session.expires_at||0)-Math.floor(Date.now()/1000))})}return session}
export async function requestPasswordReset(email){const redirect=`${location.origin}/reset-password`;return authRequest(`recover?redirect_to=${encodeURIComponent(redirect)}`,{email:email.trim().toLowerCase()})}
export async function updatePassword(password){const session=getStoredSession();if(!session)throw new Error('Link expirado. Solicite uma nova recuperação.');const response=await fetch(`${url}/auth/v1/user`,{method:'PUT',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({password})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.msg||data.message||'Não foi possível atualizar a senha');return data}
export async function requireSession(){const session=await getValidSession();if(!session){location.replace(`/login?next=${encodeURIComponent(location.pathname+location.search)}`);return null}return session}
export async function signOut(){const session=getStoredSession();try{if(session)await authRequest('logout',null,session.access_token)}catch{}finally{storeSession(null);location.replace('/login')}}
