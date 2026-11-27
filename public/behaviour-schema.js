// Data checks are shared by project imports, editing actions and turn playback.
export const behaviourNames = {expand:'Expand',spawn:'Spawn',addToTray:'Add to Graveyard / Inventory',gameOver:'Game Over',levelComplete:'Level Complete',applyEffect:'Apply Effect',moveTo:'Move To',moveAway:'Move Away From',wait:'Wait',lifetime:'Lifetime',blockNode:'Block Node',useEffect:'Use',pickUp:'Pick Up',throwObject:'Throw Object',onHit:'On Hit',distraction:'Distraction',teleport:'Teleport',advanceOnEvent:'Advance Turn On Event'};
export const triggerBehaviours=Object.fromEntries(Object.entries(behaviourNames).filter(([type])=>['applyEffect','moveTo','moveAway','teleport','expand','spawn','addToTray'].includes(type)));
export const effectActions = {switchState:'Switch State',graveyard:'Send to Graveyard',inventory:'Add to Inventory',setMoveTarget:'Set Move Target',flush:'Flush',teleport:'Teleport'};
export const turnEvents = {use:'Use',moved:'Object Moved',inventoryAdded:'Object Added To Inventory',inventoryDropped:'Object Dropped from Inventory'};
export const eligibilityMode = b => b.eligibleMode ?? (b.eligibleAssetIds===null?'any':'selected');
export const maxWaitTurns = 100;
export const maxTargetConditions = 50;
const key = value => typeof value==='string' && value.length>0 && value.length<=100;
const selection = value => value===null || Array.isArray(value)&&value.length<=500&&new Set(value).size===value.length&&value.every(key);
export function validateTargetConditions(conditions,limit=30){
  if(conditions===undefined)return;
  if(!Array.isArray(conditions)||conditions.length>limit)throw Error(`Use up to ${limit} throw target conditions.`);
  for(const c of conditions){
    if(!c||!['objects','tags','state'].includes(c.type))throw Error('Choose a throw target condition type.');
    if(c.type==='objects'&&(!Array.isArray(c.assetIds)||!selection(c.assetIds)))throw Error('Choose object types for the throw target condition.');
    if(c.type==='tags')validateTags(c.tagIds);
    if(c.type==='state'&&(!key(c.stateKey)||typeof c.enabled!=='boolean'))throw Error('Choose a state and enabled status for the throw target condition.');
  }
}
export function validateTargetGroups(groups){
  if(groups===undefined||groups===null)return;
  if(!Array.isArray(groups)||groups.length>30)throw Error('Use up to 30 throw target groups.');
  let count=0;
  for(const group of groups){
    if(!group||!['all','any'].includes(group.mode)||!Array.isArray(group.conditions))throw Error('Choose AND or OR and conditions for each throw target group.');
    validateTargetConditions(group.conditions,maxTargetConditions);count+=group.conditions.length;
  }
  if(count>maxTargetConditions)throw Error(`Use up to ${maxTargetConditions} throw target conditions across all groups.`);
}
export function validateCarriedProgress(item){
  if(item.carriedBy!==undefined&&(!item.carriedBy||!['levelId','instanceId'].every(k=>key(item.carriedBy[k]))))throw Error('Invalid carried object.');
  if(item.lifetimeProgress!==undefined){
    if(!Array.isArray(item.lifetimeProgress)||item.lifetimeProgress.length>15000)throw Error('Invalid lifetime progress.');
    const ids=new Set();
    for(const e of item.lifetimeProgress){
      const id=JSON.stringify([e?.assignedId,e?.behaviourId]);
      if(!e||!key(e.assignedId)||!key(e.behaviourId)||ids.has(id)||!Number.isInteger(e.total)||e.total<1||e.total>maxWaitTurns||!Number.isInteger(e.remaining)||e.remaining<1||e.remaining>e.total)throw Error('Invalid lifetime progress.');
      ids.add(id);
    }
  }
}
export function validateTags(value){if(!Array.isArray(value)||!selection(value))throw Error('Invalid target tags.');}
export function validateReferenceOverrides(value){
  if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>60000||Object.entries(value).some(([id,target])=>!key(id)||!key(target))))throw Error('Invalid copied object references.');
}
export function validateWaitProgress(progress){
  if(progress===undefined)return;
  if(!Array.isArray(progress)||progress.length>15000)throw Error('Invalid wait progress.');
  const ids=new Set();
  for(const entry of progress){
    if(!entry||!key(entry.assignedId)||!key(entry.behaviourId)||!Number.isInteger(entry.remaining)||entry.remaining<0||entry.remaining>=maxWaitTurns)throw Error('Invalid wait progress.');
    const id=JSON.stringify([entry.assignedId,entry.behaviourId]);
    if(ids.has(id))throw Error('Duplicate wait progress.');
    ids.add(id);
  }
}
export function validateDistraction(value){
  if(value===undefined)return;
  const position=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<=31&&p.y>=0&&p.y<=23;
  if(!value||!key(value.sourceId)||!position(value.origin)||!position(value.destination)||!['approach','return'].includes(value.phase)||!Number.isInteger(value.steps)||value.steps<1||value.steps>100||typeof value.returnToStart!=='boolean')throw Error('Invalid distraction progress.');
  for(const key of ['approachWait','returnWait'])if(value[key]!==undefined&&(!Number.isInteger(value[key])||value[key]<0||value[key]>maxWaitTurns))throw Error('Invalid distraction wait progress.');
  if(value.originFacing!==undefined&&![null,0,90,180,270].includes(value.originFacing)||value.originFacingInherited!==undefined&&typeof value.originFacingInherited!=='boolean')throw Error('Invalid distraction facing.');
  if(value.fixedDestination!==undefined&&typeof value.fixedDestination!=='boolean')throw Error('Invalid distraction destination.');
  if(value.behaviourId!==undefined&&!key(value.behaviourId))throw Error('Invalid distraction behaviour.');
}
export function validateMoveTarget(target) {
  if(!target || !['self','position','object','tags'].includes(target.type))throw Error('Invalid move target.');
  if(target.type==='tags')validateTags(target.tagIds);
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
    if(b.definitionId!==undefined&&!key(b.definitionId))throw Error('Invalid reusable behaviour reference.');
    if(b.stateToggle!==undefined&&(typeof b.stateToggle!=='boolean'||b.stateToggle&&(!['applyEffect','useEffect','onHit'].includes(b.type)||b.action!=='switchState')))throw Error('State Toggle is available for Apply Effect, Use or On Hit with Switch State.');
    for(const key of ['eligibleTagIds','usableTagIds','blockTagIds','targetTagIds'])if(b[key]!==undefined)validateTags(b[key]);
    if(b.trigger!==undefined){
      if(b.type!=='useEffect'||!b.trigger||!Object.hasOwn(triggerBehaviours,b.trigger.type)||b.trigger.trigger!==undefined||b.trigger.definitionId!==undefined)throw Error('Choose an active behaviour for Use.');
      validateBehaviours({behaviours:[b.trigger]},true);
    }
    if(b.excludeSelf!==undefined&&typeof b.excludeSelf!=='boolean')throw Error('Invalid Exclude Self option.');
    if(b.flushReach!==undefined&&b.flushReach!==null&&(!Number.isInteger(b.flushReach)||b.flushReach<1||b.flushReach>768))throw Error('Flush reach must be 1–768 continuous cells or Infinite.');
    if(b.flushPreserve!==undefined&&(!Number.isInteger(b.flushPreserve)||b.flushPreserve<0||b.flushPreserve>768))throw Error('Flush must preserve 0–768 starting cells.');
    if((['expand','applyEffect','blockNode','useEffect','pickUp','throwObject'].includes(b.type)||b.type==='distraction'&&(b.distractTarget??'area')==='area')&&!isEffect)throw Error('Area behaviours must be assigned to an effect.');
    if(b.type==='pickUp'&&(!selection(b.usableAssetIds)||!['any','selected','tags'].includes(b.usableMode)||b.usableMode==='tags'&&!Array.isArray(b.usableTagIds)||b.pickupTarget!==undefined&&!['owner','used'].includes(b.pickupTarget)))throw Error('Pick Up needs eligible objects and a pickup direction.');
    if(b.type==='throwObject'&&(!key(b.throwAssetId)||typeof b.requireInventory!=='boolean'))throw Error('Throw Object needs an object and a valid inventory option.');
    if(b.type==='throwObject'&&(b.destroyOnHit!==undefined&&typeof b.destroyOnHit!=='boolean'||b.throwTargetAssetIds!==undefined&&!selection(b.throwTargetAssetIds)))throw Error('Invalid Throw Object hit settings.');
    if(b.type==='throwObject'){validateTargetConditions(b.throwTargetConditions);validateTargetGroups(b.throwTargetGroups);}
    if(b.type==='distraction'&&(!selection(b.hitAssetIds)||!Array.isArray(b.distractAssetIds)||!selection(b.distractAssetIds)||!Number.isInteger(b.steps)||b.steps<1||b.steps>100||typeof b.returnToStart!=='boolean'))throw Error('Choose Distraction trigger objects, attracted objects and 1–100 steps.');
    if(b.type==='distraction'&&b.distractionTrigger!==undefined&&!['impact','stateChange'].includes(b.distractionTrigger))throw Error('Choose a Distraction trigger.');
    if(b.type==='distraction'&&b.distractionTrigger==='stateChange'&&((b.distractTarget??'area')!=='area'||!Array.isArray(b.beamParameterIds)||!selection(b.beamParameterIds)))throw Error('State-change Distraction needs a parameter area and a spotlight beam parameter selection.');
    if(b.type==='distraction')for(const key of ['approachDelay','returnDelay'])if(b[key]!==undefined&&(!Number.isInteger(b[key])||b[key]<0||b[key]>maxWaitTurns))throw Error(`Distraction delays must be 0–${maxWaitTurns} turns.`);
    if(b.type==='distraction'&&(b.distractTarget!==undefined&&!['area','self'].includes(b.distractTarget)||b.destinationMode!==undefined&&!['hitObject','hitPosition','throwerPosition'].includes(b.destinationMode)))throw Error('Choose Distraction recipients and destination.');
    if(b.type==='expand'&&typeof b.allowStacking!=='boolean')throw Error('Invalid expansion stacking option.');
    if(b.type==='expand'&&b.doNotExpandAcrossStairs!==undefined&&typeof b.doNotExpandAcrossStairs!=='boolean')throw Error('Invalid expansion stairs option.');
    if(b.type==='onHit'&&(!selection(b.hitAssetIds)||b.action!=='switchState'))throw Error('On Hit needs thrown objects and a Switch State action.');
    if(b.type==='applyEffect'||b.type==='useEffect'||b.type==='onHit'){
      if(!b.trigger&&!Object.hasOwn(effectActions,b.action))throw Error('Choose an effect action.');
      if(b.type==='applyEffect'&&(!selection(b.eligibleAssetIds)||!['any','selected','linked','tags'].includes(eligibilityMode(b))||eligibilityMode(b)==='tags'&&!Array.isArray(b.eligibleTagIds)))throw Error('Invalid eligible objects.');
      if(b.type==='useEffect'&&(!selection(b.usableAssetIds)||!['used','linked','tags','carried'].includes(b.useTarget)||b.usableMode!==undefined&&!['any','selected','tags'].includes(b.usableMode)||b.usableMode==='tags'&&!Array.isArray(b.usableTagIds)||b.useTarget==='tags'&&!Array.isArray(b.targetTagIds)))throw Error('Choose usable objects and a use target.');
      if(b.type==='useEffect'&&b.useTarget==='carried'&&(b.trigger&&b.trigger.type!=='applyEffect'||!['switchState','graveyard','inventory','setMoveTarget'].includes(b.trigger?.action||b.action)))throw Error('Carried targets support Apply Effect: Switch State, Send to Graveyard, Add to Inventory, or Set Move Target.');
      if(b.action==='switchState'&&(!key(b.stateKey)||typeof b.stateEnabled!=='boolean'))throw Error('Choose a state or enter its key.');
      if(b.action==='setMoveTarget')validateMoveTarget(b.moveTarget);
      if(b.action==='teleport')validateDestination(b.destination);
    }
    if(b.type==='moveTo'){
      if(!Number.isInteger(b.steps)||b.steps<1||b.steps>100||!['current','patrolStart','patrolEnd'].includes(b.target)||!(b.patrolId===null||key(b.patrolId)))throw Error('Invalid Move To settings.');
      if(b.patrolMode!==undefined&&!['loop','pingPong'].includes(b.patrolMode))throw Error('Choose Loop or Ping-pong for the patrol.');
    }
    if(b.type==='spawn'&&(!key(b.spawnAssetId)||!Number.isInteger(b.spawnCount)||b.spawnCount<1||b.spawnCount>100))throw Error('Spawn needs an object type and 1–100 copies.');
    if(b.type==='addToTray'&&!['graveyard','inventory'].includes(b.tray))throw Error('Choose Graveyard or Inventory.');
    if(b.type==='levelComplete'&&!key(b.targetAssetId))throw Error('Choose the object that completes the level.');
    if(b.type==='moveAway'&&(!Number.isInteger(b.steps)||b.steps<1||b.steps>100))throw Error('Move Away From needs 1–100 steps.');
    if(b.type==='wait'&&(!Number.isInteger(b.turns)||b.turns<1||b.turns>maxWaitTurns))throw Error(`Wait needs 1–${maxWaitTurns} turns.`);
    if(b.type==='lifetime'&&(!Number.isInteger(b.turns)||b.turns<1||b.turns>maxWaitTurns))throw Error(`Lifetime needs 1–${maxWaitTurns} turns.`);
    if(b.type==='blockNode'&&(!selection(b.blockAssetIds)||b.blockMode!==undefined&&!['any','selected','tags'].includes(b.blockMode)||b.blockMode==='tags'&&!Array.isArray(b.blockTagIds)||!['movement','movementAndEffects'].includes(b.blockScope)))throw Error('Invalid Block Node settings.');
    if(b.type==='teleport'){
      if(!['self','object','tags'].includes(b.teleportTarget)||b.teleportTarget==='object'&&!key(b.targetInstanceId)||b.teleportTarget==='tags'&&!Array.isArray(b.targetTagIds))throw Error('Choose an object to teleport.');
      validateDestination(b.destination);
    }
    if(b.type==='advanceOnEvent'&&(!Array.isArray(b.events)||!b.events.length||b.events.length>4||new Set(b.events).size!==b.events.length||b.events.some(event=>!Object.hasOwn(turnEvents,event))))throw Error('Select at least one event to advance the turn.');
  }
}
