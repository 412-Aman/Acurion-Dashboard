const data = item => item.data || item;
export function filterGraphEdges(edges,{type='all',minimumAmount=null,start=null,end=null,currency=''}={}) {
  return edges.map(data).filter(edge=>{
    if(type==='flagged'&&!edge.flagged)return false;
    if(type!=='all'&&type!=='flagged'&&edge.type!==type)return false;
    if(currency&&edge.currency!==currency)return false;
    if(minimumAmount!=null&&(edge.amount==null||edge.amount<minimumAmount))return false;
    const timestamp=Date.parse(edge.timestamp);
    if(start&&(!Number.isFinite(timestamp)||timestamp<Date.parse(start)))return false;
    if(end&&(!Number.isFinite(timestamp)||timestamp>Date.parse(end)))return false;
    return true;
  });
}
export function boundedNeighborhood(nodes,edges,account,hops=1,maxNodes=100) {
  const all=nodes.map(data),nodeIds=new Set(all.map(n=>n.id)),links=edges.map(data),selected=new Set();
  if(!nodeIds.has(account))return {nodes:[],edges:[],truncated:false};
  selected.add(account);let frontier=[account],truncated=false;
  for(let step=0;step<Math.min(3,Math.max(1,hops));step++){
    const next=[];
    for(const id of frontier)for(const edge of links){
      const neighbor=edge.source===id?edge.target:edge.target===id?edge.source:null;
      if(!neighbor||selected.has(neighbor)||!nodeIds.has(neighbor))continue;
      if(selected.size>=maxNodes){truncated=true;continue;}
      selected.add(neighbor);next.push(neighbor);
    }
    frontier=next;
  }
  return {nodes:all.filter(n=>selected.has(n.id)),edges:links.filter(e=>selected.has(e.source)&&selected.has(e.target)),truncated};
}
export function findTransactionPath(edges,source,target,maxHops=6) {
  if(!source||!target||source===target)return null;
  const links=edges.map(data).filter(e=>['transaction','suspicious'].includes(e.type)&&Number.isFinite(Date.parse(e.timestamp)));
  const queue=[{node:source,path:[],time:-Infinity,visited:new Set([source])}];
  let examined=0;
  while(queue.length&&examined<5000){
    const state=queue.shift();examined++;
    if(state.path.length>=Math.min(6,maxHops))continue;
    for(const edge of links){
      const time=Date.parse(edge.timestamp);
      if(edge.source!==state.node||time<state.time||state.visited.has(edge.target))continue;
      const path=[...state.path,edge];
      if(edge.target===target)return {nodes:[source,...path.map(e=>e.target)],edges:path,examined};
      queue.push({node:edge.target,path,time,visited:new Set([...state.visited,edge.target])});
    }
  }
  return null;
}
