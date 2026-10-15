import {dataErrorCode} from './dataStatus.js';

export async function readAuditSources({readRealtime,readLegacy,legacyEnabled=false,onStatus=()=>{}}) {
  // One configured source should make one read and produce one diagnostic row.
  if(!legacyEnabled)return readRealtime();
  const sources=[['RTDB audit',readRealtime],['Firestore audit',readLegacy]];
  const outcomes=await Promise.allSettled(sources.map(async([name,read])=>{
    try {
      const records=await read();
      onStatus(name,{state:records.length?'ready':'empty',count:records.length,lastSuccess:new Date().toISOString(),error:null});
      return records;
    }catch(error){onStatus(name,{state:'error',error:dataErrorCode(error)});throw error;}
  }));
  if(outcomes.every(result=>result.status==='rejected'))throw outcomes[0].reason;
  const realtime=outcomes[0].status==='fulfilled'?outcomes[0].value:[];
  const legacy=outcomes[1].status==='fulfilled'?outcomes[1].value:[];
  return [...new Map([...legacy,...realtime].map(record=>[record.id,record])).values()];
}
