import {clone, validateProject} from './model.js';
import {exportLevels} from './level-transfer.js';

// Use the same dependency traversal as level exports: whole hierarchies,
// reusable definitions and all transitive references, including disabled rules.
export function reviewProjectCleanup(input) {
  const project=validateProject(clone(input));
  const required=exportLevels(project,project.levels.map(level=>level.id));
  const removed={};
  for(const collection of ['assets','tags','behaviourLibrary']){
    const ids=new Set(required[collection].map(item=>item.id));
    removed[collection]=(project[collection]||[]).filter(item=>!ids.has(item.id));
    if(project[collection])project[collection]=project[collection].filter(item=>ids.has(item.id));
  }
  if(project.behaviourOrder){
    const ids=new Set(project.assets.filter(a=>!a.parameterId).flatMap(a=>(a.behaviours||[]).map(b=>b.id)));
    project.behaviourOrder=project.behaviourOrder.filter(id=>ids.has(id));
  }
  return {project:validateProject(project),removed,total:Object.values(removed).reduce((sum,items)=>sum+items.length,0)};
}
