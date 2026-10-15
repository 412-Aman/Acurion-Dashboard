export const WORKSPACE_ORDER_KEY='acurion:workspace-map-order:v1';
// Stored values can only reorder known routes, never add an arbitrary destination.
export function orderedDestinations(destinations,saved) {
  if(!Array.isArray(saved))return [...destinations];
  const known=new Map(destinations.map(item=>[item.href,item])),result=[];
  for(const href of saved)if(known.has(href)){result.push(known.get(href));known.delete(href);}
  return [...result,...known.values()];
}
