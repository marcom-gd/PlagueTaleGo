import {assetIsActive,descendants,pruneLifetimeProgress,appearance} from './model.js';

export const lifetimeKey=(item,entry)=>JSON.stringify([item.id,entry.assignedId,entry.behaviourId,entry.total]);
export const lifetimeItems=state=>[...state.project.levels.flatMap(l=>l.instances),...state.inventory.filter(s=>s.count!==0).flatMap(s=>s.items)];
export const countdown=item=>item.lifetimeProgress?.reduce((best,entry)=>!best||entry.remaining<best.remaining?entry:best,null);
function initialize(project,item){
  pruneLifetimeProgress(project,item);
  const fresh=[];
  for(const assigned of [project.assets.find(a=>a.id===item.assetId),...descendants(project,item.assetId)]){
    if(!assigned||!assetIsActive(project,assigned.id,item))continue;
    for(const b of assigned.behaviours||[])if(b.type==='lifetime'&&b.enabled){
      let progress=item.lifetimeProgress?.find(e=>e.assignedId===assigned.id&&e.behaviourId===b.id);
      if(!progress){
        progress={assignedId:assigned.id,behaviourId:b.id,total:b.turns,remaining:b.turns};
        (item.lifetimeProgress??=[]).push(progress);fresh.push(lifetimeKey(item,progress));
      }
    }
  }
  return fresh;
}
export function syncLifetimes(project,inventory=[]){
  return lifetimeItems({project,inventory}).flatMap(item=>initialize(project,item));
}
export function advanceLifetimes(project,inventory,freshKeys=[]){
  const fresh=new Set(freshKeys),expired=new Set(),log=[];
  for(const item of lifetimeItems({project,inventory})){
    for(const progress of item.lifetimeProgress||[]){
      if(fresh.has(lifetimeKey(item,progress)))continue;
      progress.remaining--;
      const name=appearance(project,project.assets.find(a=>a.id===item.assetId),item).name;
      log.push({instanceId:item.id,assetName:project.assets.find(a=>a.id===item.assetId).name,type:'lifetime',count:1,message:progress.remaining?`${name}: ${progress.remaining} turn${progress.remaining===1?'':'s'} remaining.`:`${name} expired and disappeared.`});
      if(progress.remaining===0)expired.add(item.id);
    }
  }
  for(const level of project.levels){
    level.instances=level.instances.filter(i=>!expired.has(i.id));
    const ids=new Set(level.instances.map(i=>i.id));
    level.objectLinks=level.objectLinks.map(link=>({...link,instanceIds:link.instanceIds.filter(id=>ids.has(id))})).filter(link=>link.instanceIds.length>=2);
  }
  for(let n=inventory.length-1;n>=0;n--){
    const stack=inventory[n];if(stack.count===0)continue;
    stack.items=stack.items.filter(i=>!expired.has(i.id));stack.count=stack.items.length;
    if(!stack.count)inventory.splice(n,1);
  }
  return log;
}
