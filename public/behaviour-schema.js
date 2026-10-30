// Data checks are shared by project imports, editing actions and turn playback.
export const behaviourNames = {expand:'Expand',applyEffect:'Apply Effect',moveTo:'Move To'};
export const effectActions = {switchState:'Switch State',graveyard:'Send to Graveyard',setMoveTarget:'Set Move Target',flush:'Flush'};
const key = value => typeof value==='string' && value.length>0 && value.length<=100;
export function validateReferenceOverrides(value){
  if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>60000||Object.entries(value).some(([id,target])=>!key(id)||!key(target))))throw Error('Invalid copied object references.');
}
export function validateMoveTarget(target) {
  if(!target || !['self','position','object'].includes(target.type))throw Error('Invalid move target.');
  if(target.type==='object' && !key(target.id))throw Error('Choose a canvas object for the move target.');
  if(target.type==='position' && (!Number.isInteger(target.x)||!Number.isInteger(target.y)||target.x<0||target.y<0||target.x>31||target.y>23))throw Error('Invalid move target position.');
}
export function validateBehaviours(asset,isEffect) {
  if(asset.behaviours===undefined)return;
  if(!Array.isArray(asset.behaviours)||asset.behaviours.length>30)throw Error('An item supports up to 30 behaviours.');
  const ids=new Set();
  for(const b of asset.behaviours){
    if(!b || !key(b.id)||ids.has(b.id)||!Object.hasOwn(behaviourNames,b.type)||typeof b.enabled!=='boolean')throw Error('Invalid behaviour.');
    ids.add(b.id);
    if(b.type!=='moveTo'&&!isEffect)throw Error('Expand and Apply Effect must be assigned to an effect.');
    if(b.type==='expand'&&typeof b.allowStacking!=='boolean')throw Error('Invalid expansion stacking option.');
    if(b.type==='applyEffect'){
      if(!Object.hasOwn(effectActions,b.action))throw Error('Choose an effect action.');
      if(b.eligibleAssetIds!==null&&(!Array.isArray(b.eligibleAssetIds)||b.eligibleAssetIds.length>500||new Set(b.eligibleAssetIds).size!==b.eligibleAssetIds.length||b.eligibleAssetIds.some(id=>!key(id))))throw Error('Invalid eligible objects.');
      if(b.action==='switchState'&&(!key(b.stateKey)||typeof b.stateEnabled!=='boolean'))throw Error('Choose a state or enter its key.');
      if(b.action==='setMoveTarget')validateMoveTarget(b.moveTarget);
    }
    if(b.type==='moveTo'){
      if(!Number.isInteger(b.steps)||b.steps<1||b.steps>100||!['current','patrolStart','patrolEnd'].includes(b.target)||!(b.patrolId===null||key(b.patrolId)))throw Error('Invalid Move To settings.');
    }
  }
}
