import {appearance} from './model.js';
import {carriedItems} from './carried-items.js';
import {countdown} from './lifetimes.js';

export function carriedBadges(project,level,inventory,art,esc){
  let html='';
  for(const owner of level.instances){
    for(const [n,held] of carriedItems(inventory,level.id,owner.id).entries()){
      const asset=project.assets.find(a=>a.id===held.assetId),clock=countdown(held);
      const name=appearance(project,asset,held).name,label=`Carrying ${name}${clock?` · ${clock.remaining} of ${clock.total} turns remaining`:''} · click to drop`;
      html+=`<button class="carried-object-badge ${clock?'timed':''} ${clock?.remaining===1?'last-turn':''}" data-drop-carried="${esc(held.id)}" style="--x:${owner.x};--y:${owner.y};margin-left:${n*32}px" title="${esc(label)}" aria-label="${esc(label)}">${art(asset,held)}${clock?`<span class="lifetime-count">${clock.remaining}</span><span class="lifetime-bar" style="--remaining:${clock.remaining/clock.total}"></span>`:''}</button>`;
    }
    const clock=countdown(owner);
    if(clock)html+=`<span class="object-countdown ${clock.remaining===1?'last-turn':''}" style="--x:${owner.x};--y:${owner.y}" role="status" aria-label="${esc(appearance(project,project.assets.find(a=>a.id===owner.assetId),owner).name)}: ${clock.remaining} turns remaining">${clock.remaining}</span>`;
  }
  return html;
}
