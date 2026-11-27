import {exportLevels, readLevelFile, reviewLevelImport, buildLevelImport} from './level-transfer.js';
import {behaviourNames} from './behaviour-schema.js';

export function levelTransferUI({getProject, getLevelId, canImport, showDialog, modal, closeDialog, dispatch, imported, toast, esc}) {
  const $=selector=>document.querySelector(selector);
  const checked=selector=>[...document.querySelectorAll(selector)].filter(input=>input.checked).map(input=>input.value);
  function error(message){const box=$('#level-transfer-error');box.textContent=message;box.hidden=false;box.scrollIntoView({block:'nearest'});}
  const errorBox='<p id="level-transfer-error" role="alert" class="confirm-box" hidden></p>';
  function selectAll(root,selector){
    root.querySelector('[data-select-all]').onclick=()=>{root.querySelectorAll(selector).forEach(input=>input.checked=true);root.dispatchEvent(new Event('change',{bubbles:true}));};
    root.querySelector('[data-select-none]').onclick=()=>{root.querySelectorAll(selector).forEach(input=>input.checked=false);root.dispatchEvent(new Event('change',{bubbles:true}));};
  }
  const selectionButtons='<div class="transfer-selection"><button type="button" data-select-all>Select all</button><button type="button" data-select-none>Select none</button></div>';
  function levelSelection(levels,selected){return levels.map(l=>`<label class="check-row transfer-choice"><input type="checkbox" name="transfer-level" value="${esc(l.id)}" ${selected.includes(l.id)?'checked':''}><span><strong>${esc(l.name||'Unnamed level')}</strong><small>${l.width} × ${l.height} · ${l.instances.length} pieces</small></span></label>`).join('');}
  function download(file){
    const blob=new Blob([JSON.stringify(file,null,2)],{type:'application/json'});
    if(blob.size>2_000_000)throw Error('These levels exceed the 2 MB import limit. Export fewer levels in each file.');
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    const name=file.levels.length===1?file.levels[0].name:'selected-levels';
    a.href=url;a.download=`${name.replace(/[^a-z0-9_-]+/gi,'-').slice(0,65)||'level'}.levels.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportDialog(){
    const project=getProject();
    showDialog(modal('Export levels',`<form id="level-export-form"><p>Choose levels to download. Their required objects, states, parameters, tags and behaviours travel with them. The current Edit design is exported.</p><fieldset class="transfer-list"><legend>Levels</legend>${selectionButtons}${levelSelection(project.levels,[getLevelId()])}</fieldset>${errorBox}<div class="modal-footer"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Download levels</button></div></form>`));
    selectAll($('#level-export-form'),'[name="transfer-level"]');
    $('#level-export-form').onsubmit=e=>{e.preventDefault();try{download(exportLevels(getProject(),checked('[name="transfer-level"]')));closeDialog();toast('Levels exported.');}catch(failure){error(failure.message);}};
  }
  function importDialog(file,selected=file.levels.map(l=>l.id)){
    showDialog(modal('Import levels',`<form id="level-import-selection"><p>Choose levels to add to this project. Next, review definitions and choose what to do with matching level names.</p><fieldset class="transfer-list"><legend>Levels in this file</legend>${selectionButtons}${levelSelection(file.levels,selected)}</fieldset>${errorBox}<div class="modal-footer"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Review import</button></div></form>`));
    selectAll($('#level-import-selection'),'[name="transfer-level"]');
    $('#level-import-selection').onsubmit=e=>{e.preventDefault();try{reviewDialog(file,checked('[name="transfer-level"]'));}catch(failure){error(failure.message);}};
  }
  function describe(group,project){
    const names=new Map([...project.assets,...project.tags,...(project.behaviourLibrary||[]),...project.levels.flatMap(l=>[...l.instances.map(i=>({id:i.id,name:project.assets.find(a=>a.id===i.assetId)?.name||'Piece'})),...l.patrols])].map(item=>[item.id,item.name]));
    const label=key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/Ids?$/,'').replace(/^./,c=>c.toUpperCase());
    function value(v,key){
      if(Array.isArray(v))return v.length?v.map(x=>value(x,key)).join(', '):'None';
      if(v&&typeof v==='object')return Object.entries(v).filter(([k])=>k!=='id').map(([k,x])=>`${label(k)}: ${value(x,k)}`).join('; ');
      if(typeof v==='boolean')return v?'Yes':'No';
      return names.get(v)||behaviourNames[v]||String(v??'Any');
    }
    const properties=item=>Object.entries(item).filter(([key])=>!['id','name','rule','parentId','parameterId','definitionId','behaviours','behaviour'].includes(key)).map(([key,v])=>`<dt>${esc(label(key))}</dt><dd>${esc(value(v,key))}</dd>`).join('');
    return group.items.map(item=>{
      const behaviours=item.behaviours||[item.behaviour].filter(Boolean);
      return `<li><strong>${esc(item.name)}</strong>${item.rule?`<p>${esc(item.rule)}</p>`:''}<dl class="transfer-properties">${properties(item)}</dl>${behaviours.map(b=>`<strong>${esc(behaviourNames[b.type]||b.type)}</strong><dl class="transfer-properties">${properties(b)}</dl>`).join('')}</li>`;
    }).join('');
  }
  function reviewDialog(file,levelIds){
    if(!canImport())return;
    const base=getProject(),snapshot=JSON.stringify(base),review=reviewLevelImport(base,file,levelIds),differences=review.rows.filter(row=>row.status!=='same');
    const definitions=differences.map(row=>`<div class="transfer-definition"><label class="check-row transfer-choice"><input type="checkbox" name="transfer-definition" value="${esc(row.id)}" checked><span><strong>${esc(row.name)}</strong><small>${esc(row.type)} · ${row.status==='missing'?'Missing from this project':'Different from this project (or uses a changed definition)'}${row.type==='Object'?` · ${row.items.length} item(s), including nested states and parameters`:''}</small></span></label><details><summary>Inspect definitions</summary><strong>Incoming</strong><ul>${describe(row,review.source)}</ul>${row.match?`<strong>Current project</strong><ul>${describe(row.match,base)}</ul>`:''}</details></div>`).join('');
    const conflicts=review.conflicts.filter(c=>c.matches.length).map(c=>`<fieldset class="transfer-list"><legend>${esc(c.name||'Unnamed level')} already exists</legend><label class="field"><span>How should this level be imported?</span><select name="transfer-conflict" data-source-id="${esc(c.id)}" required><option value="">Choose copy or replace…</option><option value="copy">Make a copy (keep both levels)</option>${c.matches.map(m=>`<option value="replace:${esc(m.id)}">Replace ${esc(m.name||'Unnamed level')}${c.matches.length>1?` (${base.levels.findIndex(l=>l.id===m.id)+1})`:''}</option>`).join('')}</select></label><small>Replace overwrites that level’s layout and settings. Undo restores it.</small></fieldset>`).join('');
    const orderChoice=review.hasSharedOrder?'<div class="transfer-definition"><label class="check-row transfer-choice"><input id="transfer-order" type="checkbox"><span><strong>Use incoming behaviour resolution order</strong><small>Project-wide setting: this can change the behaviour order on existing levels. Leave unchecked to keep the current order and append new behaviours.</small></span></label></div>':'';
    showDialog(modal('Review level import',`<form id="level-import-review"><p>Importing ${levelIds.length} level(s). Check the definitions to bring in.</p><fieldset class="transfer-list"><legend>Definitions and settings</legend>${differences.length||review.hasSharedOrder?selectionButtons:''}${definitions||'<p>All required definitions match and will be reused.</p>'}${orderChoice}</fieldset><p class="transfer-explanation">Checked definitions are added separately. Unchecked differences use this project’s version. Unchecked missing definitions are omitted, including their pieces and attachments. References to omitted definitions are disabled or cleared.</p>${review.rows.some(r=>r.status==='same')?`<p>${review.rows.filter(r=>r.status==='same').length} matching definition(s) will be reused.</p>`:''}${conflicts}${review.warnings.map(w=>`<p class="confirm-box">${esc(w)}</p>`).join('')}<div id="level-import-summary" class="callout" role="status"></div>${errorBox}<div class="modal-footer"><button type="button" id="level-import-back">Back</button><button type="button" data-close>Cancel</button><button type="submit" class="primary">Import levels</button></div></form>`));
    const form=$('#level-import-review');
    if(differences.length||review.hasSharedOrder)selectAll(form,'[name="transfer-definition"],#transfer-order');
    const options=()=>({levelIds,definitionIds:checked('[name="transfer-definition"]'),importBehaviourOrder:$('#transfer-order')?.checked===true,levelChoices:Object.fromEntries([...form.querySelectorAll('[name="transfer-conflict"]')].filter(input=>input.value).map(input=>[input.dataset.sourceId,input.value==='copy'?{mode:'copy'}:{mode:'replace',targetId:input.value.slice(8)}]))});
    const summarize=()=>{
      const config=options();
      for(const c of review.conflicts)if(c.matches.length&&!config.levelChoices[c.id])config.levelChoices[c.id]={mode:'copy'};
      try{const result=buildLevelImport(base,file,config);$('#level-import-summary').textContent=`${result.levelIds.length} level(s) ready. ${result.action.data.assets.length} library item(s), ${result.action.data.tags.length} tag(s), and ${result.action.data.behaviourLibrary.length} behaviour block(s) will be added.${result.omittedPieces||result.omittedInventory?` Omitted: ${result.omittedPieces} placed piece(s) and ${result.omittedInventory} starting inventory entry/entries.`:''}`;}
      catch(failure){$('#level-import-summary').textContent=failure.message;}
    };
    form.onchange=summarize;summarize();
    $('#level-import-back').onclick=()=>importDialog(file,levelIds);
    form.onsubmit=e=>{
      e.preventDefault();
      if(!canImport())return;
      if(JSON.stringify(getProject())!==snapshot){reviewDialog(file,levelIds);error('The project changed while you reviewed it. Review the updated choices before importing.');return;}
      try{
        const result=buildLevelImport(getProject(),file,options());
        if(new Blob([JSON.stringify(result.action)]).size>1_950_000)throw Error('This import is too large. Go back and select fewer levels.');
        if(dispatch(result.action)===false)return;
        imported(result.levelIds[0]);closeDialog();toast(`${result.levelIds.length} level(s) imported. Undo is available.`);
      }catch(failure){error(failure.message);}
    };
  }
  const fileInput=document.createElement('input');fileInput.id='import-level-file';fileInput.type='file';fileInput.accept='.json,application/json';fileInput.hidden=true;document.body.append(fileInput);
  fileInput.onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file||!canImport())return;
    if(file.size>2_000_000)return toast('Choose a level file smaller than 2 MB.');
    try{const parsed=readLevelFile(JSON.parse(await file.text()));if(canImport())importDialog(parsed);}catch(failure){toast(`Could not import levels: ${failure.message}`);}
  };
  return {exportDialog,importFile:()=>{if(canImport())fileInput.click();}};
}
