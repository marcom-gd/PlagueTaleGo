import {clone,validateProject} from './model.js';
import {resolveTurn} from './behaviours.js';

export const maxTurns=200;
export const createSequence=state=>({format:'plague-tale-go-turns',version:1,cursor:0,frames:[{...clone(state),log:[]}]});
export function captureSequence(sequence,state){
  const next={...sequence,frames:[...sequence.frames]},previous=next.frames[next.cursor];
  const changed=['project','inventory','graveyard'].some(key=>JSON.stringify(state[key])!==JSON.stringify(previous[key]));
  if(changed)next.frames.length=next.cursor+1;
  next.frames[next.cursor]={...clone(state),log:previous.log};
  return next;
}
export function nextTurn(sequence,state,makeId){
  const next=captureSequence(sequence,state);
  if(next.cursor<next.frames.length-1){next.cursor++;return next;}
  if(next.cursor>=maxTurns)throw Error(`A sequence supports ${maxTurns} turns. Save it, then clear to begin another sequence.`);
  const result=resolveTurn(state.project,state.inventory,state.graveyard,makeId);
  next.frames.push({...result,levelId:state.levelId});next.cursor++;return next;
}
export function previousTurn(sequence,state){
  const next=captureSequence(sequence,state);if(next.cursor>0)next.cursor--;return next;
}
function validateTray(project,tray){
  if(!Array.isArray(tray)||tray.length>30000)throw Error('Invalid turn inventory.');
  const ids=new Set(),items=[];
  for(const stack of tray){
    if(!stack||typeof stack.id!=='string'||!stack.id||stack.id.length>100||ids.has(stack.id)||!Number.isInteger(stack.count)||stack.count<0||stack.count>30000||!Array.isArray(stack.items)||!stack.items.length||stack.items.length>30000||(stack.count>0&&stack.items.length!==stack.count)||stack.items.some(i=>!i||i.assetId!==stack.assetId))throw Error('Invalid turn inventory stack.');
    ids.add(stack.id);items.push(...stack.items);
  }
  if(items.length>30000)throw Error('Too many stored turn objects.');
  const itemIds=new Set();
  for(const i of items){if(itemIds.has(i.id))throw Error('Duplicate stored turn object.');itemIds.add(i.id);}
  // Reuse placement validation without requiring stored objects to fit the
  // currently viewed level (the inventory travels between levels).
  for(let n=0;n<items.length;n+=1000){
    validateProject({...project,levels:[{id:'turn-tray-validation',name:'Inventory',width:32,height:24,tiles:{},nodes:[],blockedLinks:[],objectLinks:[],patrols:[],postIts:[],instances:items.slice(n,n+1000)}]});
  }
}
export function validateSequence(input){
  if(!input||input.format!=='plague-tale-go-turns'||input.version!==1||!Array.isArray(input.frames)||!input.frames.length||input.frames.length>maxTurns+1||!Number.isInteger(input.cursor)||input.cursor<0||input.cursor>=input.frames.length)throw Error('This is not a supported turn sequence.');
  const sequence=clone(input);
  for(const frame of sequence.frames){
    if(!frame)throw Error('Invalid turn snapshot.');
    frame.project=validateProject(frame.project);
    if(!frame.project.levels.some(l=>l.id===frame.levelId))throw Error('Invalid turn level.');
    validateTray(frame.project,frame.inventory);validateTray(frame.project,frame.graveyard);
    if(!Array.isArray(frame.log)||frame.log.length>500000||frame.log.some(item=>!item||typeof item.assetName!=='string'||item.assetName.length>80||!['expand','applyEffect','moveTo'].includes(item.type)||!Number.isInteger(item.count)||item.count<0||item.count>1000))throw Error('Invalid turn resolution log.');
  }
  return sequence;
}
