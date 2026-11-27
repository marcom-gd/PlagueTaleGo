// Projector visibility is a device preference. Controls stay outside the
// optional panels so hiding every panel never hides the way to restore them.
export function projectorControls({canvas,trigger,onApply}){
  const panels={graveyard:'Graveyard',inventory:'Player Inventory',tools:'Tools (Post-its, arrows, etc.)',parameters:'Parameters / Patrols / Resolution Order'};
  const userTest=document.body.classList.contains('user-test-session');
  const preferenceKey=userTest?'user-test-projector-panels':'workshop-projector-panels';
  const preferences=Object.fromEntries(Object.keys(panels).map(key=>[key,userTest&&['inventory','parameters'].includes(key)]));
  try{
    const saved=JSON.parse(localStorage.getItem(preferenceKey)||'{}');
    for(const key of Object.keys(panels))if(typeof saved?.[key]==='boolean')preferences[key]=saved[key];
  }catch{}
  const controls=document.createElement('nav');controls.className='projector-controls';controls.setAttribute('aria-label','Projector view controls');
  controls.innerHTML=`<button type="button" data-exit-projector>Exit projector</button><details><summary>Show / hide</summary><div class="projector-panel-options" role="group" aria-label="Visible panels"><strong>Visible panels</strong>${Object.entries(panels).map(([key,label])=>`<label><input type="checkbox" data-projector-panel="${key}" aria-label="${label}"> ${label}</label>`).join('')}<small>Inventory and Graveyard appear during Playtest.</small></div></details>`;
  canvas.append(controls);
  const isActive=()=>document.body.classList.contains('projector-mode');
  const apply=()=>{
    const active=isActive();controls.hidden=!active;trigger.setAttribute('aria-pressed',String(active));
    controls.querySelector('[data-exit-projector]').hidden=document.body.classList.contains('user-test-session');
    for(const key of Object.keys(panels)){
      document.body.classList.toggle(`projector-hide-${key}`,active&&!preferences[key]);
      controls.querySelector(`[data-projector-panel="${key}"]`).checked=preferences[key];
    }
    onApply(active,preferences);
  };
  const setVisible=(key,visible)=>{
    if(!Object.hasOwn(panels,key))return;
    preferences[key]=visible;
    try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{}
    apply();
  };
  const toggle=()=>{if(document.body.classList.contains('user-test-session'))return;document.body.classList.toggle('projector-mode');apply();window.dispatchEvent(new Event('resize'));};
  trigger.addEventListener('click',toggle);
  controls.querySelector('[data-exit-projector]').addEventListener('click',toggle);
  controls.addEventListener('change',event=>{const key=event.target.dataset.projectorPanel;if(key)setVisible(key,event.target.checked);});
  apply();
  return {isActive,toolsVisible:()=>preferences.tools,setToolsVisible:visible=>setVisible('tools',visible)};
}
