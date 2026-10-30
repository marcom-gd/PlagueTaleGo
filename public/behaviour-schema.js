// Data checks are shared by project imports, editing actions and turn playback.
export const behaviourNames = {expand:'Expand',applyEffect:'Apply Effect',moveTo:'Move To',blockNode:'Block Node',useEffect:'Use and Apply Effect',teleport:'Teleport',advanceOnEvent:'Advance Turn On Event'};
export const effectActions = {switchState:'Switch State',graveyard:'Send to Graveyard',setMoveTarget:'Set Move Target',flush:'Flush',teleport:'Teleport'};
export const turnEvents = {use:'Use',moved:'Object Moved',inventoryAdded:'Object Added To Inventory',inventoryDropped:'Object Dropped from Inventory'};
export const eligibilityMode = b => b.eligibleMode ?? (b.eligibleAssetIds===null?'any':'selected');
const key = value => typeof value==='string' && value.length>0 && value.length<=100;
const selection = value => value===null || Array.isArray(value)&&value.length<=500&&new Set(value).size===value.length&&value.every(key);
export function validateReferenceOverrides(value){
  if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>60000||Object.entries(value).some(([id,target])=>!key(id)||!key(target))))throw Error('Invalid copied object references.');
}
export function validateMoveTarget(target) {
  if(!target || !['self','position','object'].includes(target.type))throw Error('Invalid move target.');
  if(target.type==='object' && !key(target.id))throw Error('Choose a canvas object for the move target.');
  if(target.type==='position' && (!Number.isInteger(target.x)||!Number.isInteger(target.y)||target.x<0||target.y<0||target.x>31||target.y>23))throw Error('Invalid move target position.');
}
export function validateDestination(target){
  if(target?.type==='linked'){if(target.id!==null&&!key(target.id))throw Error('Invalid linked teleport destination.');return;}
  validateMoveTarget(target);if(target.type==='self')throw Error('Choose a teleport destination.');
}
export function validateBehaviours(asset,isEffect) {
  if(asset.behaviours===undefined)return;
  if(!Array.isArray(asset.behaviours)||asset.behaviours.length>30)throw Error('An item supports up to 30 behaviours.');
  const ids=new Set();
  for(const b of asset.behaviours){
    if(!b || !key(b.id)||ids.has(b.id)||!Object.hasOwn(behaviourNames,b.type)||typeof b.enabled!=='boolean')throw Error('Invalid behaviour.');
    ids.add(b.id);
    if(['expand','applyEffect','blockNode','useEffect'].includes(b.type)&&!isEffect)throw Error('Area behaviours must be assigned to an effect.');
    if(b.type==='expand'&&typeof b.allowStacking!=='boolean')throw Error('Invalid expansion stacking option.');
    if(b.type==='applyEffect'||b.type==='useEffect'){
      if(!Object.hasOwn(effectActions,b.action))throw Error('Choose an effect action.');
      if(b.type==='applyEffect'&&(!selection(b.eligibleAssetIds)||!['any','selected','linked'].includes(eligibilityMode(b))))throw Error('Invalid eligible objects.');
      if(b.type==='useEffect'&&(!selection(b.usableAssetIds)||!['used','linked'].includes(b.useTarget)))throw Error('Choose usable objects and a use target.');
      if(b.action==='switchState'&&(!key(b.stateKey)||typeof b.stateEnabled!=='boolean'))throw Error('Choose a state or enter its key.');
      if(b.action==='setMoveTarget')validateMoveTarget(b.moveTarget);
      if(b.action==='teleport')validateDestination(b.destination);
    }
    if(b.type==='moveTo'){
      if(!Number.isInteger(b.steps)||b.steps<1||b.steps>100||!['current','patrolStart','patrolEnd'].includes(b.target)||!(b.patrolId===null||key(b.patrolId)))throw Error('Invalid Move To settings.');
    }
    if(b.type==='blockNode'&&(!selection(b.blockAssetIds)||!['movement','movementAndEffects'].includes(b.blockScope)))throw Error('Invalid Block Node settings.');
    if(b.type==='teleport'){
      if(!['self','object'].includes(b.teleportTarget)||b.teleportTarget==='object'&&!key(b.targetInstanceId))throw Error('Choose an object to teleport.');
      validateDestination(b.destination);
    }
    if(b.type==='advanceOnEvent'&&(!Array.isArray(b.events)||!b.events.length||b.events.length>4||new Set(b.events).size!==b.events.length||b.events.some(event=>!Object.hasOwn(turnEvents,event))))throw Error('Select at least one event to advance the turn.');
  }
}
