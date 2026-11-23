(function(){
'use strict';
// iPhone (WebKit) draws a CSS-scaled picture at its layout size and then magnifies it, so a map laid out at map-unit size looks blocky when zoomed.
// Lay the map picture out near its real pixel size (4096 px across) and let the camera scale it down by the same factor.
const mapK=f=>Math.max(1,+(4096/Math.max(f[2],f[3])/(window.devicePixelRatio||1)).toFixed(4));
const A='../assets/',B=window.IdleBuildingArt,$=id=>document.getElementById(id),I=window.GameI18n,t=I.t,N=I.name;I.init();
const regions=window.GAME_REGIONS,E=window.GameEngine,J=window.GameJourney,services=window.createGameServices();services.cancelAway();E.attachJourney(J);let experience=null,existingSave=false;
const valleyCamera=window.createValleyCamera($('scene'));// Top bar (UI revision 2026-11-22): gold and the income rate in one pill; beside it the inn clock, how many hours the game earns while closed (tap: the inn panel).
// The Upgrades button and screen were removed the same day: storehouse and caravan upgrades are in each town panel.
$('goldHud').innerHTML='<span id="goldValue"></span><small id="incomeHud" aria-live="off"></small>';let current='forest',lastRegion='forest',selected=null,noticeTimer;
let motionTracks=[],padBoxes=[],caravanSkin='esek';
let levels={};
const routeDistances=Object.fromEntries(Object.entries(window.REGION_ROAD_LAYOUT).map(([id,l])=>[id,l.routes.map(p=>window.RouteMotion.makeTrack(p).length)]));
const params=new URLSearchParams(location.search),testSlot=params.get('test'),KEY='kervan_idle_full_play_v2'+(testSlot?'_test_'+testSlot.replace(/[^a-zA-Z0-9_-]/g,''):'');
const sessionStartedAt=Date.now(),writer=crypto.randomUUID();
let state=E.fresh(),storageOK=true,paused=false,previous=Date.now(),lastSave=0,offlineMessage='',away=null;
// Goods each town sold, before and after time away, for the welcome-back spotlight.
function soldSnap(){return Object.fromEntries(E.IDS.map(id=>[id,state.lines[id]?.sold||0]));}function soldSince(snap){return Object.fromEntries(E.IDS.map(id=>[id,Math.max(0,(state.lines[id]?.sold||0)-(snap[id]||0))]));}
// Time away is counted in one-hour slices with a pause between them, so a long absence does not freeze the screen for seconds
// (about 5 s for 18 h on a PC, Codex sweep 039). The first hour is counted at once; while more is counted, saving and ticks wait.
let catching=null,afterCatch=[];const SLICE=3600;
function whenCaught(f){if(catching)afterCatch.push(f);else f();}
// A catch-up belongs to one game: if the game is replaced (reset, cloud copy chosen) it stops. Purchases and cloud uploads wait until it ends (readonly, canUpload).
function catchUp(first){const c=catching;if(!c)return;if(c.s!==state){catching=null;afterCatch=[];return;}const n=Math.min(SLICE,c.left);E.advance(state,n,c.done);c.done+=n;c.left-=n;
 if(c.left>1e-6&&c.done<E.offlineLimit(state)){setTimeout(()=>catchUp(false),0);return;}
 catching=null;const gold=state.earned-c.before;
 // At start-up the welcome-back card waits for Continue; if the player already pressed it, the card opens now.
 if(!c.resume){if(c.elapsed>60&&gold>.01)away={seconds:c.elapsed,gold,sold:soldSince(c.snap)};else if(c.elapsed>600)away={seconds:c.elapsed,gold:0,sold:{}};
  if(!first&&away&&$('welcome')?.hidden&&experience?.welcomeBack){const a=away;away=null;experience.welcomeBack(a.seconds,a.gold,a.sold);}}
 if(!first){updateUI();save();}const list=afterCatch;afterCatch=[];list.forEach(f=>f());}
// Time away and sales earned meanwhile, shown on the welcome-back card (offline progress is capped at E.OFFLINE_LIMIT).
try{const raw=localStorage.getItem(KEY);if(raw){existingSave=true;const parsed=JSON.parse(raw);// the first load by a newer version keeps one copy of the old save
 if(parsed.version<E.VERSION&&!localStorage.getItem(KEY+'_backup_v'+parsed.version))localStorage.setItem(KEY+'_backup_v'+parsed.version,raw);state=E.restore(parsed);const elapsed=Math.max(0,(Date.now()-state.lastAt)/1000);catching={s:state,left:elapsed,done:0,elapsed,before:state.earned,snap:soldSnap()};catchUp(true);}}catch(e){storageOK=false;offlineMessage=t('save.readFailed');}
J.init(state,existingSave);
function syncLevels(){for(const id of E.IDS)levels[id]=state.lines[id].buildings.filter(b=>b.open).length;}
function save(){if(!storageOK||paused||catching)return;try{const stored=localStorage.getItem(KEY),owner=stored?JSON.parse(stored):null;if(owner?.sessionStartedAt>sessionStartedAt){paused=true;return;}state.lastAt=previous;localStorage.setItem(KEY,JSON.stringify({...state,sessionStartedAt,writer}));lastSave=Date.now();}catch(e){storageOK=false;toast(t('save.writeFailed'));}}
// Income per second from real sales over the last minute (caravans deliver in bursts, so shorter windows jump around).
// Gold per second over the last minute, plus how many of those seconds actually brought gold (caravans deliver in lumps early on).
let incomeSamples=[],incomeSeconds=[],incomeMark=null,incomeSteady=false;function incomeReset(){incomeSamples=[];incomeSeconds=[];incomeMark=null;incomeSteady=false;}function income(){const now=Date.now();incomeSamples.push([now,state.earned]);while(incomeSamples.length>2&&now-incomeSamples[0][0]>60000)incomeSamples.shift();
 if(!incomeMark)incomeMark=[now,state.earned];else if(now-incomeMark[0]>=1000){incomeSeconds.push(state.earned>incomeMark[1]);if(incomeSeconds.length>60)incomeSeconds.shift();incomeMark=[now,state.earned];}
 const [t0,e0]=incomeSamples[0],span=(now-t0)/1000,rate=span>=8?Math.max(0,(state.earned-e0)/span):0;// Per second once gold arrives in 60% of seconds (about level 7); back to per minute only below 45%, so it doesn't flicker.
 const busy=incomeSeconds.length>=30?incomeSeconds.filter(Boolean).length/incomeSeconds.length:0;incomeSteady=incomeSteady?busy>=.45:busy>=.6;return {rate,steady:incomeSteady};}
const fullSince={};
function updateUI(){syncLevels();if(current!=='world')syncStages();if(experience)experience.gold(state.gold);else $('goldValue').textContent=I.money(state.gold,1);const {rate,steady}=income(),rateText=rate>0.05?(steady?t('income.perSec',{n:I.money(rate,1)}):t('income.perMin',{n:I.money(rate*60,0)})):'';// per minute until gold arrives every second, then per second
 if($('incomeHud').textContent!==rateText)$('incomeHud').textContent=rateText;panels.update();if(current!=='world'){
 for(const n of $('scene').querySelectorAll('[data-town]')){const id=regions[current].towns[+n.dataset.town][0],l=state.lines[id];n.classList.toggle('locked-town',!l.open);}
 // A town whose storage has stayed full for 20 seconds gets the blocked mark on its name tag (after the tutorial; nothing is saved).
 {const now=Date.now();for(const n of $('scene').querySelectorAll('.town[data-town]')){const id=regions[current].towns[+n.dataset.town][0],l=state.lines[id],full=l.open&&!!state.journey?.introDone&&l.stock>=E.stockCap(state,id)-1e-6;if(!full)delete fullSince[id];else if(!fullSince[id])fullSince[id]=now;const on=full&&now-fullSince[id]>=20000;if(n.classList.contains('blocked-town')!==on){const f=n.querySelector('.town-name-frame'),g=n.querySelector('.block-mark');if(on&&f&&g)g.setAttribute('transform','translate('+(+f.getAttribute('x')+ +f.getAttribute('width')-1)+' '+(+f.getAttribute('y')+1)+')');n.classList.toggle('blocked-town',on);}}}
 const queued=E.orders[current].reduce((sum,id)=>sum+state.lines[id].queue,0),marketNode=$('scene').querySelector('[data-market] .town-role');// Write map text only when it changes: phone WebViews repaint the map for every SVG text write, even an identical one (flicker).
 const marketText=E.multiplier(state,current)>1?'×'+E.multiplier(state,current):'';if(marketNode&&marketNode.textContent!==marketText)marketNode.textContent=marketText;
 for(const n of $('nav').querySelectorAll('button[data-row]')){const row=n.dataset.row;n.classList.toggle('active',selected=== (row==='market'?'market':Number(row)));if(row==='market'){let badge=n.querySelector('.queue-badge');if(!badge){badge=document.createElement('b');badge.className='queue-badge';n.append(badge);}badge.textContent=queued>0?I.n(Math.ceil(queued)):'';badge.hidden=queued<=0;}n.hidden=row!=='market'&&!state.lines[regions[current].towns[+row][0]].open;}
}experience?.update();}
// Red counter on the upgrades medallion: warehouse and caravan upgrades affordable right now (x1).
// Hidden: nothing is counted until the game is seen again, then the whole absence is counted in one go. Counting each background
// timer call on its own restarted the offline limit and half pay every time, so the same absence paid different amounts (Codex sweep 039).
function tick(){if(paused||catching||document.hidden||window.kervanHidden)return;const now=Date.now(),dt=Math.max(0,(now-previous)/1000);
 if(dt>SLICE){previous=now;catching={s:state,left:dt,done:0,elapsed:dt,before:state.earned,resume:true};catchUp(false);return;}E.advance(state,dt);state.extras.played+=Math.min(dt,5);previous=now;/* gold keeps counting while hidden; the screen is only redrawn when someone can see it */if(!document.hidden&&!window.kervanHidden)updateUI();if(now-lastSave>4000)save();if(typeof cloudUpload==='function')cloudUpload();}
// Refresh after an action. The map is only rebuilt when the action changes what it shows (map=true), and the open panel is
// redrawn in place without moving the camera: re-focusing on every tap made the map jump ("shake") after each button.
const SIDE_PANELS=['medals','seals','book'];// panels that open anywhere, not tied to a town
function redraw(row=selected,map=true){const scroll=$('sheet').scrollTop,x=window.scrollX,y=window.scrollY;syncLevels();if(map)render(true);if(SIDE_PANELS.includes(row)||row!==null&&current!=='world')showTown(row,false);$('sheet').scrollTop=scroll;updateUI();window.scrollTo(x,y);}// scroll first: updateUI may scroll the tutorial's next button into view
const panels=window.createGamePanels({E,regions,art,$,state:()=>state,current:()=>current,readonly:()=>paused||!!catching,close:closeSheet,tip:text=>toast(text),help:key=>experience?.help(key),firstHelp:key=>experience?.firstHelp(key),milestone:()=>experience?.milestone(),select:row=>{selected=row;},layout:layoutMap,tick,changed:(action,id,rect)=>{experience?.action(action,id,rect);experience?.track(action,id);if(action==='unlockRegion'){current=id;lastRegion=id;selected=null;}if(action==='empire'){current='forest';lastRegion='forest';selected=null;incomeReset();}save();redraw(selected,action==='unlockRegion'||action==='empire');if(action==='unlockRegion')arrive(id);if(action==='rushStart')closeSheet();if(action==='prestige'||action==='empire')cloudUpload(true);}});
syncLevels();
function routeRank(id,row){return routeDistances[id].map((d,i)=>({d,i})).sort((a,b)=>a.d-b.d).findIndex(p=>p.i===row)+1;}
function isOpen(id){return state.regions[id].open;}
function toast(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,4000);}
// Town-panel building picture: art-v3/buildings/<material>-<0..2>.webp (restyle, one per building of the town).
function art(region,row,i,x,y,w,h){
 return '<image href="'+A+'art-v3/buildings/'+regions[region].towns[row][3]+'-'+i+'.webp" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" preserveAspectRatio="xMidYMid meet"/>';
}
// Town growth shows as three dots under each town tag (built / under construction / not yet); the buildings themselves are in the town panel.
const pipState=b=>b.construct>0?'building':b.open?'built':'empty';
function syncStages(){for(const g of $('scene').querySelectorAll('.tag-pips')){const bs=state.lines[g.dataset.pips].buildings;g.querySelectorAll('circle').forEach((c,i)=>{const s=pipState(bs[i]);if(c.dataset.s!==s)c.dataset.s=s;});}
 for(const img of $('scene').querySelectorAll('.pad-building')){const s=pipState(state.lines[img.dataset.pad].buildings[+img.dataset.index]);if(img.dataset.s!==s){const was=img.dataset.s;img.dataset.s=s;if(was==='building'&&s==='built'&&!img.classList.contains('pad-site')&&!img.classList.contains('pad-top'))setTimeout(()=>window.kervanJuice?.building(img.dataset.pad,+img.dataset.index,false),0);}}// a finished construction pops once
 for(const g of $('scene').querySelectorAll('.dress')){const id=g.dataset.dress,i=+g.dataset.index,tier=String(state.extras.dress[id]?.[i]||0);if(g.dataset.t!==tier)g.dataset.t=tier;g.toggleAttribute('data-hide',!state.lines[id].buildings[i].open);}}
// Town pads (town-pads.js): cleared ground over a town's building spots where it needs it, then each producer as its own picture,
// drawn back to front; shown when built, with a construction site picture while going up. A built producer opens its town when tapped.
function townPads(r){let s='';r.towns.forEach((town,row)=>{const d=window.TOWN_PADS?.[town[0]];if(!d)return;
 const img=(p,cls,extra='')=>'<image class="'+cls+'" href="'+A+p.href+'" x="'+p.x+'" y="'+p.y+'" width="'+p.w+'" height="'+p.h+'"'+extra+'/>';if(d.patch)s+=img(d.patch,'pad-ground',' pointer-events="none"');
 d.parts.map((p,i)=>[p,i]).sort((a,b)=>(a[0].y+a[0].h)-(b[0].y+b[0].h)).forEach(([p,i])=>{const at=' data-town="'+row+'" data-pad="'+town[0]+'" data-index="'+i+'" data-s="'+pipState(state.lines[town[0]].buildings[i])+'"',w=p.w*.88;s+=img(p,'pad-building',at)+img({href:'art-v3/pads/site-'+current+'.webp',x:p.x+p.w*.06,y:p.y+p.h*.96-w*.98,w,h:w*.98},'pad-building pad-site',at)+dressFlag(p,town[0],i);});});return s;}
// Workshop dress: a pennant on a pole at the building's corner, coloured by its best milestone ever (it stays through every reset).
function dressFlag(p,id,i){const x=p.x+p.w*.84,y=p.y+p.h*.3,tier=state.extras.dress[id]?.[i]||0;return '<g class="dress" data-dress="'+id+'" data-index="'+i+'" data-t="'+tier+'"'+(state.lines[id].buildings[i].open?'':' data-hide=""')+'><line x1="'+x+'" y1="'+y+'" x2="'+x+'" y2="'+(y-11)+'"/><path d="M'+x+' '+(y-11)+'l6 1.8-6 1.8z"/><path class="flag2" d="M'+x+' '+(y-6.5)+'l4.5 1.4-4.5 1.4z"/></g>';}
// Yardless copies of the buildings that caravan roads cross (pad-tops.py), drawn above caravans that are behind them.
function padTops(r){let s='';r.towns.forEach((town,row)=>{(window.TOWN_PADS?.[town[0]]?.parts||[]).forEach((p,i)=>{if(p.top)s+='<image class="pad-building pad-top" href="'+A+p.top.href+'" x="'+p.top.x+'" y="'+p.top.y+'" width="'+p.top.w+'" height="'+p.top.h+'" data-town="'+row+'" data-pad="'+town[0]+'" data-index="'+i+'" data-s="'+pipState(state.lines[town[0]].buildings[i])+'"/>';});});return s;}
// The towns are painted into the region map (art-v3); on top only a tap area (built buildings show as the tag dots).
function townArt(){return '<circle r="46" fill="transparent" pointer-events="all"/>';}
// keepCamera (panel redrawn in place): releasing the camera re-clamps it to the free-pan bounds, which moved towns near the map's edge.
function closeSheet(keepCamera){if(current!=='world'&&keepCamera!==true)valleyCamera.release();selected=null;$('sheet').hidden=true;$('sheet').style.transform='';layoutMap();}
function layoutMap(){const map=$('scene').querySelector('.region-map');if(!map)return;map.style.top='0px';map.style.height='100%';valleyCamera.mount(map,map.getAttribute('data-region-frame').split(' ').map(Number),window.REGION_ROAD_LAYOUT[current]?.floor||0);for(const town of map.querySelectorAll('.town'))town.classList.toggle('selected-town',selected==='market'?town.hasAttribute('data-market'):selected!==null&&town.dataset.town===String(selected));
 // A pool of light on the ground under the open town (or market), drawn below the buildings. It blooms in once and then stays still.
 const glow=map.querySelector('#townGlow'),L=window.REGION_ROAD_LAYOUT[current],at=!glow||!L||$('sheet').hidden?null:selected==='market'?L.market:L.towns[selected];if(glow){// sized to the town's three buildings (town-pads.js); the market has no pads, so a fixed size
  // A town's own buildings glow along their outlines (class lit on its pad pictures, see theme.css). The market has no pads (it is painted into the map): one soft band of light around it, clear in the middle.
  for(const pic of map.querySelectorAll('image[data-town]')){const lit=!!at&&selected!=='market'&&pic.dataset.town===String(selected);pic.classList.toggle('lit',lit);pic.classList.toggle('chosen',lit&&!!pic.dataset.pad&&Number(pic.dataset.index)===panels.chosen(pic.dataset.pad));}// the chosen building of the panel's strip glows strongly, the rest of the open town softly
  const parts=at&&window.TOWN_PADS?.[regions[current].towns[selected]?.[0]]?.parts,spots=!at||parts?[]:[[at[0],at[1],44,34]],fill='glowBand',key=spots.map(s=>s.map(n=>n.toFixed(1)).join(' ')).join('|');
  if(glow.dataset.at!==key){glow.dataset.at=key;glow.style.display=key?'':'none';glow.classList.remove('on');glow.innerHTML=spots.map(s=>'<ellipse cx="'+s[0]+'" cy="'+s[1]+'" rx="'+s[2]+'" ry="'+s[3]+'" fill="url(#'+fill+')"/>').join('');if(key){void glow.getBoundingClientRect();glow.classList.add('on');}}}}
function showTown(row,focus=true){if(SIDE_PANELS.includes(row))services.track('panel_open',{panel:row});if(SIDE_PANELS.includes(row))panels[row]();else{panels.town(row);if(focus&&current!=='world'){const point=row==='market'?window.REGION_ROAD_LAYOUT[current].market:window.REGION_ROAD_LAYOUT[current].towns[row];valleyCamera.focus(point,$('sheet').offsetTop-12);}}}
// Drag the grip down to dismiss; native touch scrolling remains available in the content.
let sheetDrag=null;
$('sheet').addEventListener('pointerdown',e=>{if(!e.target.closest('.sheet-grip'))return;sheetDrag={y:e.clientY,dy:0};$('sheet').setPointerCapture(e.pointerId);$('sheet').classList.add('dragging');});
$('sheet').addEventListener('pointermove',e=>{if(!sheetDrag)return;sheetDrag.dy=Math.max(0,e.clientY-sheetDrag.y);$('sheet').style.transform='translateY('+sheetDrag.dy+'px)';});
function finishSheetDrag(e){if(!sheetDrag)return;const dismiss=sheetDrag.dy>75;sheetDrag=null;$('sheet').classList.remove('dragging');$('sheet').style.transform='';if(dismiss)closeSheet();if($('sheet').hasPointerCapture(e.pointerId))$('sheet').releasePointerCapture(e.pointerId);}
$('sheet').addEventListener('pointerup',finishSheetDrag);
// Touch: a downward swipe anywhere on the panel closes it once its content is scrolled to the top (taps and upward scrolls are untouched).
let sheetSwipe=null;
$('sheet').addEventListener('touchstart',e=>{if(e.touches.length!==1||e.target.closest('.sheet-grip')){sheetSwipe=null;return;}sheetSwipe={y:e.touches[0].clientY,x:e.touches[0].clientX,dy:0,on:false,top:$('sheet').scrollTop<=0};},{passive:true});
$('sheet').addEventListener('touchmove',e=>{const s=sheetSwipe;if(!s||!s.top)return;const dy=e.touches[0].clientY-s.y,dx=e.touches[0].clientX-s.x;if(!s.on){if(dy>10&&dy>Math.abs(dx)*1.5){s.on=true;$('sheet').classList.add('dragging');}else if(Math.abs(dy)>10||Math.abs(dx)>10){sheetSwipe=null;return;}else return;}e.preventDefault();s.dy=Math.max(0,dy);$('sheet').style.transform='translateY('+s.dy+'px)';},{passive:false});
function finishSheetSwipe(){const s=sheetSwipe;sheetSwipe=null;if(!s||!s.on)return;$('sheet').classList.remove('dragging');$('sheet').style.transform='';if(s.dy>90)closeSheet();}
$('sheet').addEventListener('touchend',finishSheetSwipe);$('sheet').addEventListener('touchcancel',finishSheetSwipe);
$('sheet').addEventListener('pointercancel',e=>{sheetDrag=null;$('sheet').classList.remove('dragging');$('sheet').style.transform='';});
// First visit to a region: open its first town.
function arrive(id){const j=state.journey;if(id==='forest'||!j)return;j.regionSeen=j.regionSeen||{};if(j.regionSeen[id])return;j.regionSeen[id]=1;save();showTown(regions[id].towns.findIndex(t=>t[0]===E.orders[id][0]));}
function enter(id){if(!isOpen(id)){panels.region(id);return;}current=id;lastRegion=id;render();arrive(id);}
function confirmRegion(id){
 if(!isOpen(id)){panels.region(id);return;}
 $('sheet').innerHTML='<div class="region-confirm"><p>'+t('region.confirm',{region:N(regions[id].name)})+'</p><div><button id="cancelRegion">'+t('cancel')+'</button><button id="enterRegion">'+t('yes')+'</button></div></div>';
 $('sheet').hidden=false;$('cancelRegion').onclick=closeSheet;$('enterRegion').onclick=()=>enter(id);
}
const STATUE_AT={forest:[40,-30],snow:[40,-34],desert:[42,-30],swamp:[40,-30],pass:[36,-36],harbor:[36,-30]};// offset from the market in map units, checked on each map with statue-place.py
function render(keepCamera){
 closeSheet(keepCamera===true);$('cameraControls').hidden=current==='world';$('scene').classList.toggle('camera-active',current!=='world');motionTracks=[];$('notice').hidden=true;$('back').hidden=current==='world';$('title').textContent=current==='world'?t('world.title'):N(regions[current].name);$('eyebrow').textContent=current==='world'?t('world.eyebrow'):t('region.eyebrow',{n:regions[current].towns.length});
 if(current==='world')return renderWorld();
 const r=regions[current],layout=window.REGION_ROAD_LAYOUT[current],positions=layout.towns,market=layout.market;
 const frame=layout.bounds;
 $('scene').dataset.region=current;
 const terrain='<image href="'+A+'art-v3/maps/'+current+'.webp" x="'+frame[0]+'" y="'+frame[1]+'" width="'+frame[2]+'" height="'+frame[3]+'" preserveAspectRatio="none"/>';
 // The map picture is its own layer (moved by the camera with a GPU transform), not part of the SVG: see valley-camera.js layers().
 let html='<div class="terrain-wash" aria-hidden="true"><svg viewBox="'+frame.join(' ')+'" preserveAspectRatio="xMidYMid slice">'+terrain+'</svg></div><img class="terrain-layer" alt="" aria-hidden="true" src="'+A+'art-v3/maps/'+current+'.webp" data-frame="'+frame[0]+' '+frame[1]+'" data-k="'+mapK(frame)+'" style="width:'+(frame[2]*mapK(frame)).toFixed(2)+'px;height:'+(frame[3]*mapK(frame)).toFixed(2)+'px"><svg class="region-map" data-region-frame="'+frame.join(' ')+'" viewBox="'+frame.join(' ')+'" preserveAspectRatio="xMidYMid meet" role="group" aria-label="'+t('region.townsAria',{region:N(r.name)})+'"><defs><linearGradient id="tagFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e9c6"/><stop offset="1" stop-color="#dcc48e"/></linearGradient><radialGradient id="glowFill"><stop offset="0" stop-color="#fff6cf" stop-opacity=".95"/><stop offset=".55" stop-color="#ffe489" stop-opacity=".8"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient><radialGradient id="glowBand"><stop offset=".5" stop-color="#ffe489" stop-opacity="0"/><stop offset=".8" stop-color="#fff0b0" stop-opacity="1"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient></defs><g id="townGlow" pointer-events="none" style="display:none"></g>';// the light under the town whose panel is open: placed by layoutMap()
 const mx=market[0],my=market[1],cw=32*(window.CARAVAN_ASPECT?.[current]||.4);
 // Caravans drive over every yard. Those behind a crossed building go under its yardless top picture; names stay above all of them.
 html+=townPads(r)+'<g id="caravansBehind"></g>'+padTops(r)+'<g id="caravansFront">'+layout.routes.map((points,i)=>[0,1,2,3].map(k=>'<g style="display:none" class="preview-caravan" data-caravan="'+i+'" data-k="'+k+'" pointer-events="none"><image href="'+A+'art-v3/caravans/'+current+'.webp" x="'+(-cw/2)+'" y="-16" width="'+cw+'" height="32"/><g class="vet" data-r="0"><line x1="0" y1="0" x2="0" y2="-7"/><path d="M0 -7l5 1.5-5 1.5z"/></g><g class="cfx-dust"><circle r="2.4"/><circle r="2.8"/><circle r="3.2"/></g><g class="cfx-ban"><line x1="0" y1="0" x2="0" y2="-11"/><path d="M0 -11h8l-2 2.5 2 2.5h-8z"/></g></g>').join('')).join('')+'</g>';
 html+='<g class="town" data-market="true" role="button" tabindex="0" aria-label="'+t('market.aria',{market:N(r.market)})+'"><circle cx="'+mx+'" cy="'+my+'" r="50" fill="transparent" pointer-events="all"/><text class="town-name" x="'+mx+'" y="'+(my+26)+'" text-anchor="middle">'+N(r.market)+'</text><text class="town-role" x="'+mx+'" y="'+(my-7)+'" text-anchor="middle"></text></g>';
 // Region statue (1.7.6): bronze to radiant with the region's re-foundings, beside the market. STATUE_AT moves it off a road where needed.
 {const tier=E.statueTier(state,current);if(tier){const at=STATUE_AT[current]||[40,-30],sx=mx+at[0],sy=my+at[1];html+='<g class="region-statue tier'+tier+'" pointer-events="none"><ellipse cx="'+sx+'" cy="'+(sy+10)+'" rx="9" ry="3" fill="#0004"/><image href="'+A+'art-v3/statues/'+current+'-'+tier+'.webp" x="'+(sx-11)+'" y="'+(sy-13)+'" width="22" height="24"/>'+(tier>=5?'<circle class="statue-glow" cx="'+sx+'" cy="'+(sy-3)+'" r="11"/>':'')+'</g>';}}
 positions.forEach(([x,y],row)=>{const town=r.towns[row],tag=window.TOWN_PADS?.[town[0]]?.tag||[0,0];html+='<g class="town" data-town="'+row+'" role="button" tabindex="0" aria-label="'+t('town.aria',{town:N(town[1]),product:N(town[2])})+'"><g transform="translate('+x+' '+y+') scale(.48)">'+townArt(current,row)+'</g><text class="town-name" x="'+(x+tag[0])+'" y="'+(y+24+tag[1])+'" text-anchor="middle">'+N(town[1])+'</text><image class="lock-badge" href="'+A+'nano-art/lock.webp" x="'+(x+tag[0]-5)+'" y="'+(y+27+tag[1])+'" width="10" height="10"/></g>';});
 // Weather and clouds animate in a separate transparent SVG above the map, so their frames repaint only that layer.
 html+='</svg>';if(window.KervanAmbient)html+='<svg class="ambient-layer" aria-hidden="true" preserveAspectRatio="none" viewBox="'+frame.join(' ')+'">'+KervanAmbient.svg(current,frame,A)+'</svg>';
 $('scene').innerHTML=html;
 for(const label of $('scene').querySelectorAll('.town-name')){const box=label.getBBox();if(!isFinite(box.x+box.y+box.width+box.height))continue;const frame=document.createElementNS('http://www.w3.org/2000/svg','rect');frame.setAttribute('class','town-name-frame');// Parchment tag with the town's product (a coin for the market) in a round badge on the left.
  const h=box.height+6,pad=h-2,x0=box.x-5-pad;frame.setAttribute('x',x0);frame.setAttribute('y',box.y-3);frame.setAttribute('width',box.width+10+pad);frame.setAttribute('height',h);frame.setAttribute('rx',h/2);label.before(frame);
  const row=label.closest('.town')?.dataset.town,icon=row!==undefined?A+'art-v3/icons/'+r.towns[+row][3]+'.webp':A+'nano-art/gold.webp',cx=x0+h/2,cy=box.y-3+h/2,ns='http://www.w3.org/2000/svg',badge=document.createElementNS(ns,'circle'),pic=document.createElementNS(ns,'image');
  badge.setAttribute('class','tag-badge');badge.setAttribute('cx',cx);badge.setAttribute('cy',cy);badge.setAttribute('r',h/2+1);pic.setAttribute('href',icon);pic.setAttribute('x',cx-h*.36);pic.setAttribute('y',cy-h*.36);pic.setAttribute('width',h*.72);pic.setAttribute('height',h*.72);label.before(badge,pic);
  // Blocked mark: an orange "!" on the tag's corner, shown by updateUI() while the town's storage has stayed full (class blocked-town).
  if(row!==undefined){const g=document.createElementNS(ns,'g');g.setAttribute('class','block-mark');g.innerHTML='<circle r="4.6"/><text y="2.6" text-anchor="middle">!</text>';label.after(g);}// updateUI() puts it on the tag's top right corner when it shows: the tag is measured again once the font has loaded
  if(row!==undefined){const pips=document.createElementNS(ns,'g'),bs=state.lines[r.towns[+row][0]].buildings;pips.setAttribute('class','tag-pips');pips.dataset.pips=r.towns[+row][0];pips.setAttribute('pointer-events','none');
   bs.forEach((b,i)=>{const c=document.createElementNS(ns,'circle');c.dataset.s=pipState(b);c.setAttribute('cx',box.x+box.width/2+(i-1)*4.6);c.setAttribute('cy',box.y+h+.5);c.setAttribute('r',1.7);pips.append(c);});label.after(pips);}}
 motionTracks=layout.routes.flatMap((points,i)=>{const track=window.RouteMotion.makeTrack(points);return [0,1,2,3].map(k=>({track,node:$('scene').querySelector('[data-caravan="'+i+'"][data-k="'+k+'"]'),row:i,k}));});padBoxes=[...$('scene').querySelectorAll('.pad-top')].map(el=>({el,x:+el.getAttribute('x'),y:+el.getAttribute('y'),w:+el.getAttribute('width'),h:+el.getAttribute('height')}));
 // A painted building opens its town with that building chosen in the strip; the town's name tag opens the town as it was left.
 for(const node of $('scene').querySelectorAll('[data-town]'))activate(node,e=>{const row=Number(node.dataset.town);if(node.dataset.pad&&node.dataset.index!==undefined){e?.stopPropagation?.();panels.pick(node.dataset.pad,Number(node.dataset.index));}showTown(row);});
 activate($('scene').querySelector('[data-market]'),()=>showTown('market'));
 $('nav').innerHTML=r.towns.map((t,i)=>({t,i})).sort((a,b)=>routeRank(current,a.i)-routeRank(current,b.i)).map(({t,i})=>'<button data-row="'+i+'" aria-label="'+panels.caravanName(t[0])+'"><img src="'+A+'art-v3/icons/'+t[3]+'.webp" alt="">'+N(E.defs[t[0]].product)+'</button>').join('')+'<button data-row="market"><img src="'+A+'art-v3/icons/altin.webp" alt="">'+t('nav.market')+'</button>';
 for(const node of $('nav').querySelectorAll('button'))node.onclick=()=>showTown(node.dataset.row==='market'?'market':Number(node.dataset.row));
 layoutMap();
}

// Static markup from index.html (Turkish in the file) re-labelled for the current language.
function relabel(){const q=s=>document.querySelector(s),text=(s,k,v)=>{const n=q(s);if(n)n.textContent=t(k,v);},aria=(s,k)=>{const n=q(s);if(n)n.setAttribute('aria-label',t(k));};
 document.title=t('doc.title');text('.notes small','notes.tag',{version:'1.7.12'});text('.notes h1','game.title');text('.notes p','notes.text');text('.notes a','notes.back');
 aria('.phone','aria.phone');aria('#back','aria.back');text('#back span','back');aria('#goldHud','aria.gold');for(const n of document.querySelectorAll('[data-label]'))n.textContent=t(n.dataset.label);aria('#settings','aria.settings');aria('#scene','aria.scene');aria('#cameraControls','aria.camera');aria('#centerMap','aria.center');aria('#sheet','aria.sheet');aria('#nav','aria.nav');
 text('#options h2','options.title');text('#newGame','options.newGame');text('#closeOptions','options.close');aria('#optionsX','options.close');text('#openCredits','credits.title');text('#creditsDialog h2','credits.title');text('#creditsMusic','credits.music');text('#creditsNote','credits.note');text('#closeCredits','credits.back');text('#resetDialog h2','reset.title');text('#resetDialog p','reset.text');text('#cancelReset','reset.cancel');text('#confirmReset','reset.confirm');}
relabel();
I.onChange(()=>{relabel();if($('options').open)$('saveInfo').textContent=t(paused?'save.otherTab':storageOK?'save.auto':'save.unavailable');redraw();});
function activate(node,fn){node.addEventListener('click',fn);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}});}
// Region catalog: one card per region, unopened regions dark, the rest of the 16 black and closed until they are built. Pictures are tiles of world-map-6.webp [column,row].
const WORLD_SLOTS=16,WORLD_TILES={forest:[0,1],snow:[0,0],desert:[1,0],swamp:[1,1],pass:[0,2],harbor:[1,2]};
function renderWorld(){delete $('scene').dataset.region;
 let s='<div class="catalog" role="group" aria-label="'+t('world.aria')+'">',last=null;
 // The next region to open gets a lighter card and a line saying how it opens (a teaser, not a lock).
 const nextId=E.ORDER.find(r=>!isOpen(r)),prevId=nextId&&E.ORDER[E.ORDER.indexOf(nextId)-1],nextBlock=nextId&&E.regionRequirements(state,nextId).find(q=>!q.ok),nextHint=!nextId?'':!nextBlock?t('world.nextOpen',{n:I.money(E.regionCost(nextId,state))}):nextBlock.key==='req.prevPrestige'?t('world.nextFound',{region:N(regions[prevId].name)}):t(nextBlock.key,{region:N(regions[nextBlock.region||prevId].name),town:nextBlock.town?N(E.defs[nextBlock.town].name):''});
 E.ORDER.forEach((id,i)=>{const r=regions[id],open=isOpen(id),[x,y]=WORLD_TILES[id];if(open)last=id;s+='<div class="region-card'+(open?'':' locked')+(id===nextId?' next':'')+(id===lastRegion?' here':'')+'" role="button" tabindex="0" data-region="'+id+'" aria-label="'+t(open?'world.selectRegion':'world.lockedRegion',{region:N(r.name)})+'"><div class="card-art" style="background-position:'+x*100+'% '+(y+.25)/2.5*100+'%"></div><span class="card-no">'+(i+1)+'</span><span class="card-name">'+N(r.name)+'</span>'+(open?'':'<img class="card-lock" src="'+A+'nano-art/lock.webp" alt="">')+(id===nextId?'<span class="card-next">'+nextHint+'</span>':'')+'<span class="card-goods">'+E.orders[id].map(k=>'<img src="'+A+'art-v3/icons/'+E.defs[k].material+'.webp" alt="">').join('')+'</span></div>';});
 for(let n=E.ORDER.length+1;n<=WORLD_SLOTS;n++)s+='<div class="region-card soon" aria-label="'+t('world.soon')+'"><span class="card-no">'+n+'</span><span class="card-name">'+t('world.soon')+'</span><img class="card-lock" src="'+A+'nano-art/lock.webp" alt=""></div>';
 $('scene').innerHTML=s+'</div>';
 for(const node of $('scene').querySelectorAll('[data-region]'))activate(node,()=>confirmRegion(node.dataset.region));
 $('nav').innerHTML='<span class="world-instruction">'+t('world.instruction')+'</span>';
 const list=$('scene').querySelector('.catalog'),card=list.querySelector('[data-region="'+last+'"]');list.scrollTop=card.offsetTop-(list.clientHeight-card.offsetHeight)/2;
}
$('centerMap').onclick=()=>valleyCamera.reset(window.REGION_ROAD_LAYOUT[current].towns[regions[current].towns.findIndex(t=>t[0]===E.orders[current][0])]);
$('back').onclick=()=>{current='world';render();};
$('settings').onclick=()=>{closeSheet();$('saveInfo').textContent=t(paused?'save.otherTab':storageOK?'save.auto':'save.unavailable');$('options').show();layoutMap();};
$('closeOptions').onclick=()=>{$('options').close();layoutMap();};
// Hidden frame-rate counter for testers: tap the save line in Options 5 times (again to hide). Shows frames per second, frames slower
// than 50 ms in the last 10 s, the slowest of them, and the version. Measures only while shown; remembered on this device.
let fpsTaps=0,fpsTimer=0,fpsOn=false;try{fpsOn=localStorage.getItem('kervan_fps')==='1';}catch{}
function fpsMeter(){let box=$('fpsMeter');if(!fpsOn){box?.remove();return;}if(!box){document.querySelector('.phone').insertAdjacentHTML('beforeend','<div id="fpsMeter" aria-hidden="true"></div>');box=$('fpsMeter');}
 const slow=[];let frames=0,last=performance.now(),since=last;const loop=now=>{if(!fpsOn||!box.isConnected)return;const dt=now-last;last=now;frames++;if(dt>50)slow.push([now,dt]);while(slow.length&&now-slow[0][0]>1e4)slow.shift();
  if(now-since>=1000){box.textContent='FPS '+Math.round(frames*1000/(now-since))+' · '+t('fps.slow')+' '+slow.length+(slow.length?' ('+Math.round(Math.max(...slow.map(s=>s[1])))+' ms)':'')+' · 1.7.12';frames=0;since=now;}requestAnimationFrame(loop);};requestAnimationFrame(loop);}
$('saveInfo').addEventListener('click',()=>{fpsTaps++;clearTimeout(fpsTimer);fpsTimer=setTimeout(()=>fpsTaps=0,1500);if(fpsTaps<5)return;fpsTaps=0;fpsOn=!fpsOn;try{localStorage.setItem('kervan_fps',fpsOn?'1':'0');}catch{}fpsMeter();});
fpsMeter();
// × at the top right of Options, like the panels (iPhones have no back button, and the Close button sits at the bottom).
$('options').insertAdjacentHTML('afterbegin','<button id="optionsX" type="button" aria-label="'+t('options.close')+'">×</button>');$('optionsX').onclick=$('closeOptions').onclick;$('openCredits').onclick=()=>$('creditsDialog').showModal();$('closeCredits').onclick=()=>$('creditsDialog').close();
$('newGame').onclick=()=>$('resetDialog').showModal();$('cancelReset').onclick=()=>$('resetDialog').close();
$('confirmReset').onclick=()=>{state=E.fresh();J.init(state,false);previous=Date.now();storageOK=true;paused=false;current='forest';lastRegion='forest';selected=null;$('resetDialog').close();$('options').close();save();redraw(regions.forest.towns.findIndex(t=>t[0]===E.FIRST));experience.reset();};
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;let owner;try{owner=JSON.parse(e.newValue);}catch{return;}if(owner.writer===writer||!(owner.sessionStartedAt>sessionStartedAt))return;paused=true;toast(t('save.otherTabToast'));updateUI();});
let hiddenAt=0,earnedAtHide=0,soldAtHide={};
// Leaving: is the first route running by itself, and which Valley mission was on screen (measures where new players stop).
function exitInfo(){try{const l=state.lines[E.FIRST],m=J.mission(state,E,'forest');return {automated:l?.buildings[0].worker&&l.caravanWorker&&state.regions.forest.worker?1:0,mission:m?m.type:'none',mission_index:m?m.index:-1,played_min:Math.round((state.extras?.played||0)/60)};}catch{return {};}}
window.addEventListener('pagehide',()=>{tick();save();});document.addEventListener('visibilitychange',()=>{if(document.hidden){tick();hiddenAt=Date.now();services.track('session_exit',{level:J.level(state),region:current==='world'?lastRegion:current,regions:E.ORDER.filter(r=>state.regions[r].open).length,income_log10:Math.round(Math.log10(Math.max(1,E.potential(state)))),...exitInfo()});earnedAtHide=state.earned;soldAtHide=soldSnap();save();notifyAway();cloudUpload(true);return;}services.cancelAway();if(services.native)cloudKeeper.start();
 const seconds=hiddenAt?(Date.now()-hiddenAt)/1000:0;hiddenAt=0;tick();whenCaught(()=>{const gain=state.earned-earnedAtHide;if(seconds>10)incomeReset();if(seconds>120&&gain>.01)experience?.welcomeBack(seconds,gain,soldSince(soldAtHide));else if(seconds>600)experience?.welcomeBack(seconds,0,{});/* nothing earned in ten minutes away: the card says what is missing */save();});});
document.addEventListener('keydown',e=>{if($('resetDialog').open)return;if(e.key==='Escape'&&$('options').open){$('options').close();layoutMap();return;}if(e.key==='Escape'){if(!$('sheet').hidden)closeSheet();else if(current!=='world'){current='world';render();}}});
let resizeTimer=0;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!$('scene').clientWidth||!$('scene').clientHeight)return;const row=selected;render(true);if(SIDE_PANELS.includes(row)||row!==null&&current!=='world')showTown(row,false);},120);});
// Painted direction views per region; map-unit sizes from caravan-export.py.
const CARAVAN_VIEWS={"harbor": {"s": [33.3, 38.0], "se": [31.6, 36.1], "e": [34.1, 34.1], "ne": [31.3, 33.7], "n": [32.1, 37.5]}, "pass": {"s":[7.6,19.7],"se":[24.1,16.7],"e":[30.0,11.6],"ne":[23.9,20.3],"n":[7.6,23.1]}, "forest": {"s": [7.6, 19.7], "se": [24.1, 16.7], "e": [30.0, 11.6], "ne": [23.9, 20.3], "n": [7.6, 23.1]}, "snow": {"e": [30.0, 9.0], "s": [6.8, 17.9], "ne": [25.2, 18.0], "n": [6.8, 20.1], "se": [25.2, 16.1]}, "desert": {"e": [30.0, 10.8], "s": [6.4, 19.1], "ne": [21.4, 20.2], "n": [6.4, 23.9], "se": [21.3, 16.5]}, "swamp": {"s": [8.6, 15.3], "se": [23.4, 13.2], "e": [30.0, 10.2], "ne": [23.4, 18.0], "n": [8.6, 19.5]}};
// Caravan looks per region (art-v3/caravans/<skin>-t<look>-<view>.webp, exported with one shared scale by caravan-export-set.py).
// A region without its own looks keeps its single caravan; a missing look falls back to the highest one painted.
Object.assign(CARAVAN_VIEWS,{"forest-t1": {"s": [9.6, 11.4], "se": [12.9, 12.2], "e": [17.0, 13.5], "ne": [12.9, 16.4], "n": [9.6, 17.1]}, "forest-t2": {"s": [8.6, 20.2], "se": [24.9, 17.4], "e": [30.7, 13.0], "ne": [24.8, 21.8], "n": [8.6, 24.5]}, "forest-t3": {"s": [10.9, 28.6], "se": [32.5, 25.5], "e": [38.0, 16.3], "ne": [32.4, 25.5], "n": [10.9, 28.0]}});
Object.assign(CARAVAN_VIEWS,{"snow-t1": {"s": [4.1, 11.8], "se": [16.4, 9.9], "e": [21.0, 6.6], "ne": [16.3, 13.1], "n": [4.1, 15.0]}, "snow-t2": {"s": [5.8, 14.6], "se": [21.2, 12.5], "e": [25.7, 7.9], "ne": [21.2, 15.4], "n": [5.8, 17.1]}, "snow-t3": {"s": [9.6, 22.7], "se": [30.4, 19.1], "e": [38.0, 16.5], "ne": [30.4, 28.3], "n": [9.5, 31.6]}});
Object.assign(CARAVAN_VIEWS,{"desert-t1": {"s": [5.8, 12.3], "se": [10.2, 12.1], "e": [14.2, 11.6], "ne": [10.2, 15.1], "n": [5.8, 16.4]}, "desert-t2": {"s": [5.8, 19.1], "se": [19.4, 17.3], "e": [27.2, 11.6], "ne": [19.4, 19.7], "n": [5.8, 23.0]}, "desert-t3": {"s": [6.8, 24.8], "se": [27.8, 21.6], "e": [38.0, 11.6], "ne": [27.8, 23.6], "n": [6.8, 28.4]}});
Object.assign(CARAVAN_VIEWS,{"swamp-t1": {"s": [9.0, 10.8], "se": [10.9, 11.7], "e": [13.0, 10.4], "ne": [10.9, 11.5], "n": [9.0, 10.4]}, "swamp-t2": {"s": [7.8, 15.9], "se": [22.5, 13.5], "e": [27.6, 10.2], "ne": [22.5, 17.0], "n": [7.8, 18.1]}, "swamp-t3": {"s": [11.4, 21.5], "se": [30.8, 18.1], "e": [38.0, 12.2], "ne": [30.8, 22.0], "n": [11.4, 23.7]}});
Object.assign(CARAVAN_VIEWS,{"pass-t1": {"s": [7.4, 10.0], "se": [10.7, 10.5], "e": [14.8, 12.1], "ne": [10.7, 15.2], "n": [7.4, 15.9]}, "pass-t2": {"s": [8.2, 15.5], "se": [20.5, 13.6], "e": [25.5, 13.6], "ne": [20.5, 19.9], "n": [8.2, 21.3]}, "pass-t3": {"s": [9.2, 27.7], "se": [30.3, 23.7], "e": [38.0, 14.9], "ne": [30.1, 24.9], "n": [9.1, 28.1]},
 "harbor-t1": {"s": [7.8, 10.9], "se": [15.7, 9.8], "e": [18.9, 6.8], "ne": [15.7, 9.6], "n": [7.8, 10.6]}, "harbor-t2": {"s": [14.7, 25.3], "se": [22.6, 25.3], "e": [27.3, 23.8], "ne": [22.5, 25.1], "n": [14.7, 26.9]}, "harbor-t3": {"s": [15.8, 34.1], "se": [32.2, 31.6], "e": [40.0, 26.3], "ne": [32.2, 31.2], "n": [15.8, 34.9]}});
for(const r of ['forest','snow','desert','swamp','pass','harbor'])for(const t of [4,5,6])CARAVAN_VIEWS[r+'-t'+t]=CARAVAN_VIEWS[r+'-t3'];// levels 30/40/50: caravan 3 recoloured, same shape and size
// Where the level-40 banner's pole stands (fraction of the picture, from its centre) so it sits on the wagon cover in each view.
const CARAVAN_BANNER={e:[-.3,-.4],se:[-.24,-.3],ne:[-.2,-.05],n:[0,.02],s:[0,-.36]};
// Caravan fleet (levels 10/20/30): the game runs one trip per town; the extra caravans are drawn spread evenly round the same
// round trip (out, unloading, back), shifted from the real caravan's timer, so they never drive nose to tail. While the real
// caravan waits in town for goods, the others wait where they are too. Returns where caravan k of n is: phase + road progress (0 town, 1 market).
function fleetSpot(phase,remaining,trip,id,k,n){
 if(!k||n<2){if(phase==='outbound')return {phase,progress:1-remaining/trip};if(phase==='returning')return {phase,progress:remaining/trip};return {phase,progress:phase==='unloading'?1:0};}
 const U=E.defs[id].region==='pass'?0:E.CYCLE,L=2*trip+U;
 let at=phase==='outbound'?trip-remaining:phase==='unloading'?trip+Math.max(0,U-remaining):phase==='returning'?trip+U+(trip-remaining):0;
 // A quarter-gap nudge: with plain k/n spacing, a caravan going out and one coming back sit on the same spot whenever the real one waits in town.
 at=(at+(k+.25)*L/n)%L;
 if(at<trip)return {phase:'outbound',progress:at/trip};
 if(at<trip+U)return {phase:'unloading',progress:1};
 return {phase:'returning',progress:Math.max(0,1-(at-trip-U)/trip)};
}
function lookSkin(sk,look){for(let t=look;t>=1;t--)if(CARAVAN_VIEWS[sk+'-t'+t])return sk+'-t'+t;return sk;}window.kervanLookSkin=lookSkin;
// Caravans: 30 frames a second, and the drawing is only touched when something about a caravan changes (each touch redraws the map layer).
const setIf=(node,key,value,write)=>{if(node['_'+key]!==value){node['_'+key]=value;write(value);}};let lastFrame=0;
// window.kervanFullFps (set only by the ad recorder) draws every frame, so recorded footage has no 30 fps steps.
// About 20 caravan moves a second: each move makes iPhones redraw the whole map SVG, which heats the phone (owner's friend, 2026-11-19).
// On the world screen (no caravans) or while the Android app is in the background, it only checks back 4 times a second.
function animate(now){if(current==='world'||window.kervanHidden){setTimeout(()=>requestAnimationFrame(animate),250);return;}if(!window.kervanFullFps&&now-lastFrame<50){requestAnimationFrame(animate);return;}lastFrame=now;const standing=padBoxes.filter(b=>b.el.dataset.s==='built');for(const item of motionTracks){const id=regions[current].towns[item.row][0],l=state.lines[id],node=item.node,show=l.open&&l.caravan&&item.k<E.fleet(state,id);setIf(node,'display',show?'':'none',v=>node.style.display=v);if(!show)continue;const extra=paused?0:Math.min(.4,Math.max(0,(Date.now()-previous)/1000)),remaining=Math.max(0,l.remaining-extra);const trip=E.travel(state,id),spot=fleetSpot(l.phase,remaining,trip,id,item.k,E.fleet(state,id)),progress=spot.progress,ph=spot.phase;const place=window.RouteMotion.roadPlace(item.track,progress),p=window.RouteMotion.at(item.track,place.distance),back=ph==='returning'?180:0,v=window.RouteMotion.facing(p.angle+back),look=E.caravanLook(state,id),sk=lookSkin(E.skin(state,id,place.distance),look),size=CARAVAN_VIEWS[sk][v.view],shore=window.REGION_ROAD_LAYOUT[current].shore?.[item.row],layer=$(window.RouteMotion.behind(p,standing)?'caravansBehind':'caravansFront');setIf(node,'phase',ph,v=>{const was=node.dataset.direction;node.dataset.direction=v;if(v==='unloading'&&was==='outbound')window.kervanJuice?.caravan(node);});setIf(node,'opacity',(place.opacity*(shore?Math.min(1,Math.abs(place.distance-shore)/5):1)).toFixed(2),v=>node.style.opacity=v);if(node.parentNode!==layer)layer.append(node);setIf(node,'transform','translate('+p.x.toFixed(1)+' '+p.y.toFixed(1)+') scale('+(v.flip?-1:1)+' 1)',t=>node.setAttribute('transform',t));if(node.dataset.view!==sk+v.view){node.dataset.view=sk+v.view;const img=node.querySelector('image');img.setAttribute('href',A+'art-v3/caravans/'+sk+'-'+v.view+'.webp');img.setAttribute('x',-size[0]/2);img.setAttribute('y',-size[1]/2);img.setAttribute('width',size[0]);img.setAttribute('height',size[1]);node.querySelector('.vet').setAttribute('transform','translate('+(size[0]*.18)+' '+(-size[1]/2+3)+')');
  // Look effects (levels 30/40/50): dust at the back wheels, a banner over the back of the load; shine is CSS on the picture.
  node.querySelector('.cfx-dust').setAttribute('transform','translate('+(-size[0]/2+3)+' '+(size[1]/2-2.5)+')');{const b=CARAVAN_BANNER[v.view]||[0,0];node.querySelector('.cfx-ban').setAttribute('transform','translate('+(size[0]*b[0])+' '+(size[1]*b[1])+')');}}
  if(node.dataset.look!==String(look))node.dataset.look=look;{const kind=sk.split('-')[0];if(node.dataset.region!==kind)node.dataset.region=kind;}// dust colour per caravan kind (harbor ships make a wake, its land carts road dust)
  // Veteran trim: a pennant over caravans with many lifetime trips (bronze, silver, gold).
  const rank=String(E.vetRank(state,id)),vet=node.querySelector('.vet');if(vet.dataset.r!==rank)vet.dataset.r=rank;}requestAnimationFrame(animate);}
// Weather turns every few minutes (looks only): swap just the weather group of the open region's map.
function swapWeather(){const g=$('scene').querySelector('.amb-weather');if(!g||current==='world'||!window.KervanAmbient)return;if(g.dataset.weather===KervanAmbient.kind(current))return;const box=document.createElementNS('http://www.w3.org/2000/svg','g');box.innerHTML=KervanAmbient.weather(current,window.REGION_ROAD_LAYOUT[current].bounds);g.replaceWith(box.firstChild);}
// "Show me" from a mission: switch to its region if needed and open the town/market (or the region panel to unlock it).
function focusMission(m){const r=m.home||m.region;if(m.type==='openRegion'){current='world';render();panels.region(m.region);return;}if(!isOpen(r))return;if(current!==r){current=r;lastRegion=r;render();}
 // "Earn N gold": first whatever still keeps a town from working alone, otherwise the upgrade that adds the most income, with one line on why.
 if(m.type==='prestigeTarget'){const rowOf=id=>regions[r].towns.findIndex(t=>t[0]===id),g=E.idleGap(state,r),b=g?null:E.regionBest(state,r);
  if(g){showTown(g.town?rowOf(g.town):'market');toast(experience.gapText(g));return;}
  if(b){showTown(b.action==='market'?'market':rowOf(b.town));toast(t('best.go.'+b.action,{town:N(E.defs[b.town].name)})+(b.affordable?'':' '+t('best.go.save')));return;}}
 const row=m.town&&!['hireMarket','prestige','prestigeTarget'].includes(m.type)?regions[r].towns.findIndex(t=>t[0]===m.town):'market';showTown(row);
 // The welcome-back shortcut names one building: open its row (and only point at it, nothing is bought).
 if(m.index>0&&m.town&&row!=='market'){panels.pick(m.town,m.index);showTown(row,false);}}
// Leaving the app schedules the idle-caravan and daily-reward notes (Android only; cancelled on return).
function notifyAway(){if(!state.journey?.introDone)return;const limit=E.offlineLimit(state),d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');services.scheduleAway({capSeconds:limit,capTitle:t('notif.capTitle'),capText:t('notif.capText',{h:limit/3600}),dailyTitle:t('notif.dailyTitle'),dailyText:t('notif.dailyText'),automated:E.IDS.some(id=>state.lines[id].caravanWorker&&state.lines[id].buildings.some(b=>b.worker)),dailyDone:state.extras.daily.last===today,build:nextBuild(),next:nextTownNote()});}
// The next town that only needs gold: when idle income should cover its price (at least 10 minutes out).
// The rate is measured by running a copy of the save for 10 minutes with the real engine, so a route with no
// caravan driver (no idle income) never gets a "ready" note.
function idleRate(){try{const copy=JSON.parse(JSON.stringify(state)),g0=copy.gold;E.advance(copy,600);return Math.max(0,(copy.gold-g0)/600);}catch{return 0;}}
function nextTownNote(){const rate=idleRate();if(!(rate>0))return null;for(const r of E.ORDER){if(!state.regions[r].open)continue;const id=E.orders[r].find(k=>!state.lines[k].open);if(!id||!E.requirements(state,id).every(q=>q.ok))continue;const cost=E.defs[id].unlock;const need=Math.max(0,cost-state.gold),H=E.halfAfter(state),secs=need<=rate*H?need/rate:H+(need-rate*H)/(rate/2);/* offline income halves after HALF_AFTER */return {seconds:Math.max(600,Math.ceil(secs)),title:t('notif.townTitle'),text:t('notif.townText',{town:N(E.defs[id].name)})};}return null;}
// Soonest building under construction, for the 'ready' note.
function nextBuild(){let best=null;for(const id of E.IDS)state.lines[id].buildings.forEach((b,i)=>{if(b.construct>0&&(!best||b.construct<best.seconds))best={seconds:b.construct,title:N(E.defs[id].name),text:t('construct.ready',{building:N(E.defs[id].buildings[i])})};});return best;}
experience=window.createGameExperience({services,cloudSignIn:()=>cloudSignIn(),toast,$,E,J,state:()=>state,existing:()=>existingSave,readonly:()=>paused||!!catching,selected:()=>selected,showTown,region:()=>current==='world'?lastRegion:current,onMap:()=>current!=='world',focus:focusMission,away:()=>{const a=away;away=null;return a;},travel:()=>{closeSheet();const a=window.REGION_ROAD_LAYOUT.forest.towns[regions.forest.towns.findIndex(t=>t[0]===E.FIRST)],b=window.REGION_ROAD_LAYOUT.forest.market;valleyCamera.reset([(a[0]+b[0])/2,(a[1]+b[1])/2]);},save,changed:()=>{save();redraw(selected,false);}});// mission/daily rewards change numbers, not the map
// Cloud save (Android, Play Games): at start, offer a cloud copy that is further ahead (for example on a new phone);
// afterwards keep the cloud copy fresh: on leaving the app, after a re-founding, and every 5 minutes of play.
// Nothing is uploaded before that start check, so a fresh install never overwrites a cloud save.
const cloudKeeper=services.cloudSync({state:()=>state,version:E.VERSION,minVersion:E.MIN_VERSION,canUpload:()=>!paused&&!catching&&!!state.journey?.introDone,saveLocal:save,describe:()=>t('cloud.description',{level:J.level(state),gold:I.money(state.gold,1)}),signedIn:on=>experience.cloudState(on),offer:(raw,done)=>experience.offerCloud(raw,done),adopt:raw=>adoptSave(raw),backup:(kind,data)=>{try{localStorage.setItem(KEY+'_backup_'+kind,data);}catch{}}});
function cloudUpload(force=false){cloudKeeper.upload(force);}
function adoptSave(raw){try{const s=E.restore(raw);J.init(s,true);E.advance(s,Math.max(0,(Date.now()-s.lastAt)/1000));state=s;previous=Date.now();current='forest';lastRegion='forest';selected=null;save();redraw(null);experience.reset();}catch{toast(t('save.readFailed'));}}
const cloudStart=()=>cloudKeeper.start();
function cloudSignIn(){return services.cloud.signIn().then(r=>{if(r?.signedIn)cloudStart();return !!r?.signedIn;});}
if(services.native)cloudStart();
// Native shell hooks (mobile/android MainActivity): hardware back, language preference for the native splash, startup gate.
function handleBack(){const ad=$('adDialog');if(ad?.open){if(ad.dispatchEvent(new Event('cancel',{cancelable:true})))ad.close();return true;}/* the merchant card's cancel handler pays out as before */for(const id of ['updateDialog','creditsDialog','talkDialog','awayDialog','cloudDialog','dailyDialog','prestigeDialog','empireDialog','resetDialog','goalsDialog'])if($(id)?.open){$(id).close();return true;}if($('options').open){$('options').close();layoutMap();return true;}
 const welcome=$('welcome');if(welcome&&!welcome.hidden)return false;if(document.querySelector('.phone').classList.contains('guided'))return true;
 if(!$('sheet').hidden){closeSheet();return true;}if(current!=='world'){current='world';render();return true;}return false;}
window.kervanHandleBack=handleBack;
const nativeLanguage=lang=>{const locale=window.Capacitor?.Plugins?.KervanLocale;if(locale)locale.setLanguage({language:lang}).catch(()=>{});};nativeLanguage(I.lang);I.onChange(nativeLanguage);
render();showTown(regions.forest.towns.findIndex(t=>t[0]===E.FIRST));updateUI();save();setInterval(tick,250);setInterval(swapWeather,30000);requestAnimationFrame(animate);if(offlineMessage)toast(offlineMessage);
window.kervanStartupReady=true;
})();
