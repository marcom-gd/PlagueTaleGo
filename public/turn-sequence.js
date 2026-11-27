import {clone,validateProject} from './model.js';
import {resolveTurn} from './behaviours.js';
import {behaviourNames} from './behaviour-schema.js';
import {gameOutcome,validateOutcome} from './game-outcomes.js';
import {lifetimeItems,lifetimeKey} from './lifetimes.js';

export const maxTurns=200;
export const createSequence=state=>({format:'plague-tale-go-turns',version:1,cursor:0,frames:[{...clone(state),log:[]}]});
const stateChanged=(before,after)=>['project','inventory','graveyard','outcome','levelId'].some(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));
export const hasRecordedNextTurn=(sequence,state)=>!!sequence&&sequence.cursor<sequence.frames.length-1&&!stateChanged(sequence.frames[sequence.cursor],state);
export function captureSequence(sequence,state){
  const next={...sequence,frames:[...sequence.frames]},previous=next.frames[next.cursor];
  const changed=stateChanged(previous,state);
  if(changed)next.frames.length=next.cursor+1;
  next.frames[next.cursor]={...clone(state),log:previous.log,...(!changed&&previous.visualEffects?{visualEffects:previous.visualEffects}:{})};
  return next;
}
export function nextTurn(sequence,state,makeId,{recordedOnly=false}={}){
  const next=captureSequence(sequence,state);
  if(next.cursor<next.frames.length-1){next.cursor++;return next;}
  if(recordedOnly)throw Error('In User Test Mode, Next turn can only replay recorded turns. Play an action to record a new turn.');
  if(state.outcome)throw Error('Clear Sequence to Restart, or go to the next level.');
  if(next.cursor>=maxTurns)throw Error(`A sequence supports ${maxTurns} turns. Save it, then clear to begin another sequence.`);
  const result=resolveTurn(state.project,state.inventory,state.graveyard,makeId,state.levelId);
  next.frames.push({...result,levelId:state.levelId});next.cursor++;return next;
}
export function previousTurn(sequence,state){
  const next=captureSequence(sequence,state);if(next.cursor>0)next.cursor--;return next;
}
// Keep the state before the triggering user action as the previous turn, so
// Previous also undoes the drag, use, collection or drop that advanced it.
export function eventTurn(sequence,before,after,actionLog=[],actionEffects=after.visualEffects||[]){
  const next=captureSequence(sequence,before);
  if(next.cursor>=maxTurns)throw Error(`A sequence supports ${maxTurns} turns. Save it, then clear to begin another sequence.`);
  next.frames.length=next.cursor+1;
  const outcome=after.outcome||gameOutcome(after.project,after.graveyard,after.levelId);
  const clocks=state=>lifetimeItems(state).flatMap(i=>(i.lifetimeProgress||[]).map(e=>lifetimeKey(i,e)));
  const previousClocks=new Set(clocks(before)),freshClocks=clocks(after).filter(key=>!previousClocks.has(key));
  const result=outcome?{...clone(after),outcome,log:[],visualEffects:[]}:resolveTurn(after.project,after.inventory,after.graveyard,undefined,after.levelId,freshClocks);
  next.frames.push({...result,log:[...actionLog,...result.log],visualEffects:[...actionEffects,...(result.visualEffects||[])],levelId:after.levelId});next.cursor++;return next;
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
function validateVisualEffects(project,effects){
  if(effects===undefined)return; // Older recordings have no animation records.
  if(!Array.isArray(effects)||effects.length>500000)throw Error('Invalid turn visual effects.');
  const idValid=id=>typeof id==='string'&&id.length>0&&id.length<=100;
  for(const effect of effects){
    const level=project.levels.find(l=>l.id===effect?.levelId),i=effect?.instance,from=effect?.from;
    if(!level||!['expand','spawn','tray'].includes(effect.type)||!i||!idValid(i.id)||!from||!Number.isInteger(from.x)||!Number.isInteger(from.y)||from.x<0||from.y<0||from.x>=level.width||from.y>=level.height||(effect.type==='tray'&&!['inventory','graveyard'].includes(effect.tray))||(effect.source!==undefined&&effect.source!=='library'))throw Error('Invalid turn visual effect.');
  }
  // Validate historical appearances, including copies removed later in a turn.
  // Give each snapshot a fresh ID because one object can have several effects.
  const reserved=new Set([...project.assets,...(project.parameters||[]),...project.tags,...(project.behaviourLibrary||[]),...project.levels,
    ...project.assets.flatMap(a=>a.behaviours||[]),...project.levels.flatMap(l=>[...l.patrols,...l.objectLinks,...l.postIts]),...project.cardDraws].map(a=>a.id));
  let prefix='visual-effect-';while([...reserved].some(id=>id.startsWith(prefix)))prefix+='x';
  for(let n=0;n<effects.length;n+=1000){
    const instances=effects.slice(n,n+1000).map((e,k)=>({...e.instance,id:prefix+k}));
    const id=prefix+'level';
    validateProject({...project,levels:[{id,name:'Visual effects',width:32,height:24,tiles:{},nodes:[],blockedLinks:[],objectLinks:[],patrols:[],postIts:[],instances}]});
  }
}
export function validateSequence(input){
  if(!input||input.format!=='plague-tale-go-turns'||input.version!==1||!Array.isArray(input.frames)||!input.frames.length||input.frames.length>maxTurns+1||!Number.isInteger(input.cursor)||input.cursor<0||input.cursor>=input.frames.length)throw Error('This is not a supported turn sequence.');
  const sequence=clone(input);
  for(const frame of sequence.frames){
    if(!frame)throw Error('Invalid turn snapshot.');
    frame.project=validateProject(frame.project);
    validateOutcome(frame.outcome,frame.project);
    if(!frame.project.levels.some(l=>l.id===frame.levelId))throw Error('Invalid turn level.');
    if(frame.outcome&&frame.outcome.levelId!==frame.levelId)throw Error('Turn outcome belongs to another level.');
    validateTray(frame.project,frame.inventory);validateTray(frame.project,frame.graveyard);
    validateVisualEffects(frame.project,frame.visualEffects);
    if(!Array.isArray(frame.log)||frame.log.length>500000||frame.log.some(item=>!item||typeof item.assetName!=='string'||item.assetName.length>80||!Object.hasOwn(behaviourNames,item.type)||!Number.isInteger(item.count)||item.count<0||item.count>100000))throw Error('Invalid turn resolution log.');
    if(frame.log.some(item=>item.message!==undefined&&(typeof item.message!=='string'||item.message.length>500)))throw Error('Invalid turn feedback.');
    const carriers=new Set();
    for(const stack of frame.inventory)for(const item of stack.items)if(item.carriedBy){
      const key=item.id,level=frame.project.levels.find(l=>l.id===item.carriedBy.levelId);
      if(stack.count!==1||stack.items.length!==1||carriers.has(key)||!level?.instances.some(i=>i.id===item.carriedBy.instanceId))throw Error('Invalid inventory carrier.');
      carriers.add(key);
    }
  }
  return sequence;
}
