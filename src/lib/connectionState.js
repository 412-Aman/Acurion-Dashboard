// Connection refers to source reads, not whether an analyst write is permitted.
export function connectionState(records,{demo=false,online=true,transport}={}){
  if(demo)return {state:'demo',label:'Demo',detail:'Fictional demo records. Firebase is not being queried.'};
  if(!online)return {state:'disconnected',label:'Disconnected',detail:'Your browser is offline. Reconnect and check the data sources.'};
  if(transport===false)return {state:'disconnected',label:'Disconnected',detail:'The Firebase Realtime Database connection is unavailable. Reconnect, then check the sources in System status.'};
  if(transport===null)return {state:'checking',label:'Checking…',detail:'Waiting for the Firebase Realtime Database connection.'};
  const reads=records.filter(r=>!r.resource.includes('write'));
  if(reads.some(r=>r.state==='error'))return {state:'disconnected',label:'Connection needs attention',detail:'At least one source could not be read. Open System status for the exact error.'};
  if(reads.some(r=>r.state==='loading'))return {state:'checking',label:'Checking…',detail:'Checking access to the configured data sources.'};
  if(reads.length&&reads.every(r=>['ready','empty'].includes(r.state)))return {state:'connected',label:'Data connected',detail:'Configured source reads succeeded. Counts reflect the loaded sample, not a continuous server health check.'};
  return {state:'checking',label:'Check connection',detail:'No source read has been confirmed on this page. Open System status to check.'};
}
