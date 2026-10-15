// Browser cooldowns reduce duplicate mail requests; Firebase still enforces its limits.
export const VERIFICATION_RESEND_MS = 60_000;
export const VERIFICATION_THROTTLE_MS = 5 * 60_000;
const validStates = new Set(['sending','sent','rate-limited','failed']);
export function createVerificationDelivery({send,storage,now=Date.now,namespace='default'}) {
  const memory=new Map(),inFlight=new Map();
  const key=uid=>`acurion:verification:${namespace}:${uid}`;
  function state(uid) {
    if(!uid)return null;
    const cached=memory.get(uid)||null;
    try {
      const saved=JSON.parse(storage?.getItem(key(uid))||'null');
      if(saved && validStates.has(saved.status) && Number.isFinite(saved.retryAt)
        && (!cached || saved.updatedAt>cached.updatedAt))return saved;
    }catch{}
    return cached;
  }
  function write(uid,value) {
    const saved={...value,updatedAt:now()};memory.set(uid,saved);
    try{storage?.setItem(key(uid),JSON.stringify(saved));}catch{}
  }
  function remaining(uid) {return Math.max(0,Math.ceil(((state(uid)?.retryAt||0)-now())/1000));}
  function request(user) {
    if(!user?.uid)return Promise.reject(Object.assign(new Error('Sign in first.'),{code:'auth/session-required'}));
    if(user.emailVerified)return Promise.resolve({status:'verified',retryAt:0});
    if(inFlight.has(user.uid))return inFlight.get(user.uid);
    const saved=state(user.uid);
    if(remaining(user.uid)>0) {
      return Promise.reject(Object.assign(new Error('Wait before requesting another email.'),{
        code:saved.status==='rate-limited'?'auth/too-many-requests':'auth/verification-cooldown',
      }));
    }
    // Reserve before calling the sender so immediate repeated calls cannot duplicate it.
    write(user.uid,{status:'sending',retryAt:now()+VERIFICATION_RESEND_MS});
    const pending=Promise.resolve().then(()=>send(user)).then(()=>{
      const result={status:'sent',retryAt:now()+VERIFICATION_RESEND_MS};write(user.uid,result);return result;
    }).catch(error=>{
      const throttled=error.code==='auth/too-many-requests';
      write(user.uid,{status:throttled?'rate-limited':'failed',retryAt:now()+(throttled?VERIFICATION_THROTTLE_MS:10_000)});
      throw error;
    }).finally(()=>inFlight.delete(user.uid));
    inFlight.set(user.uid,pending);return pending;
  }
  return {request,state,remaining};
}
