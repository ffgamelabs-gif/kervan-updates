// Isolated onboarding review. Does not modify the main game's saves.
const guidedKey=playerAccountKey(runtimeAccountId)+'_guided_step_v7';
const nativeGuideRaw=localStorage.getItem(guidedKey);
let guidedStep=nativeGuideRaw===null&&nativeExistingAccountPresent?8:Number(nativeGuideRaw||0),guidedShipment=null;
if(nativeGuideRaw===null)localStorage.setItem(guidedKey,String(guidedStep));
// Guided practice must not trigger success audio for the underlying story tasks.
const guidedQuestSuccessBase=checkQuestSuccess;
checkQuestSuccess=function(){
 if(guidedStep===8)return guidedQuestSuccessBase();
 questSuccessState=state;
 for(const task of currentQuestSuccessCandidates())if(task.ready)questSuccessSeen.add(task.id);
};
const guidedShade=document.createElementNS('http://www.w3.org/2000/svg','svg');guidedShade.id='guidedShade';guidedShade.innerHTML='<path fill-rule="evenodd"/>';document.body.append(guidedShade);
const guidedFocus=document.createElement('div');guidedFocus.id='guidedFocus';document.body.append(guidedFocus);
const guidedNote=document.createElement('aside');guidedNote.id='guidedNote';guidedNote.setAttribute('aria-live','polite');document.body.append(guidedNote);
guidedNote.setAttribute('data-user-text',''); // Explicit bilingual copy; avoid partial dictionary translations.
let guidedTarget=null,guidedOverview=guidedStep===0,guidedIntroPage=0;
const guidedWelcomePages={
 tr:[
  'Hoş geldin, tüccar! Yeşil Vadi’de ilk ticaretini birlikte yapalım.',
  'Kereste üretimini aç, ilk keresteyi kervanla gönder. Ardından taş üretimini açacağız. Hazırsan başlayalım!'
 ],
 en:[
  'Welcome, merchant! Let us make your first trade in Green Valley together.',
  'Start timber production and send the first timber by caravan. Then we will start stone production. Let us begin!'
 ]
};
const guideCopy=[
 'Hoş geldin, tüccar! Yeşil Vadi’deki ilk yolculuğunda sana eşlik edeceğim. Önce Leafhaven’da kereste üretimini açacağız. İlk kereste üretilince onu Millmeadow’a kervanla gönderecek, teslimattan sonra taş üretimini açacağız. Sonra diğer üretimi açıp vadini kendi başına keşfedebilirsin. Hazırsan başlayalım!',
 'Başlamak için Leafhaven kasabasına dokun.',
 'Kereste üretimini 50 altınla aç. Ürünler kendiliğinden birikir; tek tek üretmen gerekmez.',
 'İlk keresten üretildi! Şimdi kervanla sevkiyat başlat.',
 'Bu ilk keresteyi Millmeadow’a götürelim. İşaretli kasabaya dokun.',
 'Yükün 1 kereste. İlk kervanını gönder.',
 'Kervanın yolda! Kasabaya ulaştığında ilk ticaretin tamamlanacak.',
 'İlk teslimatın tamamlandı, kereste ve taş üretimin çalışıyor! Yeni görevin sağ üstteki bildirimli görev ikonunda seni bekliyor. Millmeadow’daki diğer üretimi de 50 altınla açmayı unutma.'
];
const productionGuideCopy={12:'İlk keresten yerine ulaştı! Şimdi taş üretimini açalım. İşaretli taş kasabasına dokun.',13:'Taş üretimini de 50 altınla aç. Kereste ve taş, gelişiminin temelini oluşturacak.',14:'Kereste üretimin başladı. İlk kerestenin üretilmesini bekleyelim; üretim otomatik ilerler.'};
const guideCopyEn=[
 'Welcome, merchant! I will accompany you on your first journey through Green Valley. First, we will start timber production in Leafhaven. When the first timber is ready, we will send it to Millmeadow by caravan. After delivery, we will start stone production. Then you can start the remaining production and explore the valley on your own. Let us begin!',
 'Tap Leafhaven to begin.',
 'Start timber production for 50 gold. Goods accumulate automatically; you do not need to produce each one manually.',
 'Your first timber is ready! Start a caravan shipment.',
 'Let us take this first timber to Millmeadow. Tap the highlighted town.',
 'Your cargo is 1 timber. Send your first caravan.',
 'Your caravan is on its way to Millmeadow! Your first delivery will be complete when it arrives.',
 'Your first delivery is complete, and timber and stone production are running! Your next quest is waiting at the notification icon in the upper right. Remember to start the remaining production in Millmeadow for 50 gold.'
];
const productionGuideCopyEn={12:'Your first timber has arrived in Millmeadow! Now let us start stone production. Tap the highlighted stone town.',13:'Start stone production for 50 gold. Timber and stone will form the foundation of your growth.',14:'Timber production has started. Let us wait for the first timber; production progresses automatically.'};
function guidedLocalizedCopy(){
 const en=gameLanguage==='en';
 const text=guidedStep===0?guidedWelcomePages[en?'en':'tr'][guidedIntroPage]:(en?productionGuideCopyEn:productionGuideCopy)[guidedStep]||(en?guideCopyEn:guideCopy)[Math.min(guidedStep,7)];
 const town=id=>en?englishMessage(cityById(id).name):cityById(id).name;
 return text.replaceAll('Leafhaven',town('y')).replaceAll('Millmeadow',town('d'));
}
function guidedMapAt(cityId){infoCity=null;buildPath=null;renderAll();const c=cityById(cityId);camera={x:c.x-115,y:c.y-175,w:230,h:230*MAP_ASPECT};applyViewBox()}
function guidedGoToStone(){guidedSetStep(12);guidedMapAt('t')}
function guidedWaitForTimber(){guidedSetStep(14)}
function guidedFinishIntro(){
 if(typeof completeGuidedHandoff==='function')completeGuidedHandoff();
 infoCity=null;buildPath=null;sheetCollapsed=false;compactTargetPicking=false;
 document.getElementById('townOverlay')?.classList.remove('show');
 document.getElementById('mapDispatchDock')?.classList.remove('target-picking');
 guidedSetStep(8);showTab('map');renderAll();
 if(!state.playerProfile?.configured)openPlayerProfile();
}
function guidedSetStep(step){guidedStep=step;guidedOverview=step===0;localStorage.setItem(guidedKey,String(step));save();guidedRender()}
function guidedRect(el){if(!el)return null;const r=el.getBoundingClientRect();if(!r.width||!r.height)return null;return {x:Math.max(2,r.left-7),y:Math.max(2,r.top-7),w:r.width+14,h:r.height+14}}
function guidedRender(){
 const active=guidedStep!==8;document.body.classList.toggle('guided-start',active);guidedShade.style.display=guidedFocus.style.display=guidedNote.style.display=active?'':'none';applyGuideModalAccess();if(!active)return;
 const en=gameLanguage==='en',copy=guidedLocalizedCopy(),noteKey=guidedStep+':'+gameLanguage+':'+guidedIntroPage;if(guidedNote.dataset.step!==noteKey){guidedNote.dataset.step=noteKey;guidedNote.innerHTML='<small>'+(guidedStep===0?(en?'YOUR FIRST JOURNEY':'İLK YOLCULUĞUN')+' · '+(guidedIntroPage+1)+' / 2':guidedStep===7?(en?'COMPLETE':'TAMAMLANDI'):({1:1,2:2,14:3,3:4,4:5,5:6,6:6,12:7,13:8}[guidedStep]||1)+' / 8')+'</small><p>'+copy+'</p>'+(guidedStep===0?'<button id="guidedBegin">'+(en?(guidedIntroPage===0?'Continue':'Let us begin'):(guidedIntroPage===0?'Devam et':'Başlayalım'))+'</button>':guidedStep===7?'<button id="guidedFinish">'+(en?'Explore the valley':'Vadiyi keşfet')+'</button>':'');
 if([6,14].includes(guidedStep))guidedNote.insertAdjacentHTML('beforeend','<div class="guided-wait-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div><small id="guidedWaitValue"></small>');}
 guidedNote.classList.toggle('above-panel',[2,3,5,13,14].includes(guidedStep));
 guidedNote.classList.toggle('welcome-pages',guidedStep===0);
 const beginButton=document.getElementById('guidedBegin');if(beginButton)beginButton.onclick=()=>{
  if(guidedIntroPage===0){guidedIntroPage=1;guidedRender();applyViewBox();return}
  guidedOverview=false;camera={x:35,y:240,w:230,h:230*MAP_ASPECT};
  guidedSetStep(1);applyViewBox();
 };
 const finishButton=document.getElementById('guidedFinish');if(finishButton)finishButton.onclick=guidedFinishIntro;
 const selector=guidedStep===1?'#map .city-hit[data-city="y"]':guidedStep===2?'[data-unlock-prod="y"]':guidedStep===12?'#map .city-hit[data-city="t"]':guidedStep===13?'[data-unlock-prod="t"]':guidedStep===3?'[data-start-dispatch="y"]':guidedStep===4?'#map .city-hit[data-city="d"]':guidedStep===5?'[data-confirm-path]':null;
 guidedTarget=selector?document.querySelector(selector):null;
 if([2,13].includes(guidedStep)&&guidedTarget)guidedTarget.scrollIntoView({block:'nearest'});
 if(guidedStep===3&&guidedTarget)guidedTarget.scrollIntoView({block:'nearest'});
 if(guidedStep===5){const slider=document.getElementById('cargoSlider');if(slider&&Number(slider.value)!==1){slider.value=1;slider.dispatchEvent(new Event('input',{bubbles:true}))}}
 if(guidedStep===4){compactTargetPicking=true;document.getElementById('mapDispatchDock')?.classList.add('target-picking')}
 guidedUpdateWait();guidedPosition();
}
function guidedPosition(){if(guidedStep===8)return;const r=guidedStep===6?guidedJourneyRect():guidedRect(guidedTarget),w=innerWidth,h=innerHeight;guidedShade.setAttribute('viewBox',`0 0 ${w} ${h}`);let d=`M0 0H${w}V${h}H0Z`;if(r){d+=`M${r.x} ${r.y}V${r.y+r.h}H${r.x+r.w}V${r.y}Z`;Object.assign(guidedFocus.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',display:''})}else guidedFocus.style.display='none';if(guidedStep===6)guidedFocus.style.display='none';if([0,3].includes(guidedStep))d='';guidedShade.querySelector('path').setAttribute('d',d)}
// Enforce the current target for both pointer and keyboard interactions.
function guidedAllowed(target){return guidedStep===8||guidedNote.contains(target)||(guidedTarget&&(guidedTarget===target||guidedTarget.contains(target)))}
for(const event of ['pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup','touchstart','touchmove','touchend','click','wheel','keydown'])window.addEventListener(event,e=>{if(guidedStep===8)return;if(['pointermove','mousemove','touchmove','wheel'].includes(event)){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();return}if(['pointerdown','mousedown','touchstart'].includes(event)&&guidedAllowed(e.target))e.stopPropagation();if(!guidedAllowed(e.target)){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();return}if(event==='click'&&guidedTarget&&(guidedTarget===e.target||guidedTarget.contains(e.target))){const oldStep=guidedStep;setTimeout(()=>{if(oldStep===1&&infoCity==='y'){if(state.cities.y.productionUnlocked)guidedWaitForTimber();else guidedSetStep(2)}else if(oldStep===2&&state.cities.y.productionUnlocked)guidedWaitForTimber();else if(oldStep===12&&infoCity==='t'){if(state.cities.t.productionUnlocked)guidedSetStep(7);else guidedSetStep(13)}else if(oldStep===13&&state.cities.t.productionUnlocked)guidedSetStep(7);else if(oldStep===3&&buildPath?.[0]==='y'){guidedSetStep(4);camera={x:120,y:240,w:230,h:230*MAP_ASPECT};applyViewBox()}else if(oldStep===4&&buildPath?.includes('d'))guidedSetStep(5);else if(oldStep===5&&state.vehicles.some(v=>v.state==='traveling'&&v.path?.[0]==='y')){guidedShipment=state.vehicles.find(v=>v.state==='traveling'&&v.path?.[0]==='y').id;guidedSetStep(6)}},0)}},{capture:true,passive:false});
// Block navigation at its entry points as well as at the input layer.
const guidedShowTabBase=showTab;showTab=function(tab){if(guidedStep!==8&&tab!=='map')return;return guidedShowTabBase(tab)};
const guidedProfileBase=openPlayerProfile;openPlayerProfile=function(...args){if(guidedStep!==8)return;return guidedProfileBase(...args)};
const guidedSyncBase=syncMapWorkspace;syncMapWorkspace=function(){guidedSyncBase();if(guidedStep!==8)guidedRender()};
const guidedApplyBase=applyViewBox;applyViewBox=function(){if(guidedOverview){const map=document.getElementById('map');const pixelW=map.clientWidth||innerWidth,pixelH=map.clientHeight||innerHeight,aspect=pixelH/pixelW;
const towns=['y','t','d'].map(cityById),padding=65;
const left=Math.min(...towns.map(c=>c.x))-padding,right=Math.max(...towns.map(c=>c.x))+padding;
const top=Math.min(...towns.map(c=>c.y))-padding,bottom=Math.max(...towns.map(c=>c.y))+padding;
const usablePixels=Math.max(pixelH*.45,pixelH-guidedNote.getBoundingClientRect().height-35),usableAspect=usablePixels/pixelW;
const width=Math.max(right-left,(bottom-top)/usableAspect),usableHeight=width*usableAspect;
camera={x:Math.max(0,(left+right-width)/2),y:Math.max(0,(top+bottom-usableHeight)/2),w:width,h:width*aspect};map.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);map.style.transform='none';updatePreviewDesertCover();return}guidedApplyBase();guidedPosition()};
// This guide owns input locking instead of the hidden legacy startup modals.
const guidedModalAccessBase=applyGuideModalAccess;
applyGuideModalAccess=function(){
 for(const selector of ['nav.tabbar','#previewBottomNav','#previewHUD','#previewMenuButton','#previewMenu','#previewPanelClose']){const el=document.querySelector(selector);if(el)el.inert=guidedStep!==8}
 if(guidedStep===8){guidedModalAccessBase();return}
 for(const id of ['playerProfileOverlay','tutorialOverlay','awayOverlay'])document.getElementById(id)?.classList.remove('show');
 for(const selector of ['main','header.topbar','nav.tabbar','#townOverlay']){const el=document.querySelector(selector);if(el)el.inert=false}
};
applyGuideModalAccess();
// Use actual automatically produced stock; there is no manual production action.
// Native packaging retains the real asset readiness gate.
finishStartupIfReady();
if(guidedStep===0){infoCity=null;buildPath=null;showTab('map')}
if([2,3,14].includes(guidedStep)){infoCity='y';showTab('map')}
if(guidedStep===4||guidedStep===5){infoCity=null;buildCargoMaterial='kereste';buildPath=guidedStep===5?['y','d']:['y'];renderAll()}
if(guidedStep===13){infoCity='t';townPanelTab='overview';showTab('map')}
if(guidedStep===12)guidedMapAt('t');

if(guidedStep===6)guidedShipment=state.vehicles.find(v=>v.path?.[0]==='y'&&v.destCity==='d')?.id;
guidedRender();applyViewBox();
setInterval(()=>{if(guidedStep===14&&Math.floor(productionStockFor('y').kereste||0)>=1)guidedSetStep(3);if(guidedStep===6){const v=state.vehicles.find(v=>v.id===guidedShipment);if(v?.state==='idle'&&v.location==='d')guidedGoToStone()}guidedUpdateWait();guidedPosition()},250);
window.addEventListener('resize',()=>{applyViewBox();guidedPosition()});

function guidedUpdateWait(){
 const track=guidedNote.querySelector('.guided-wait-track');if(!track)return;
 let progress=0;
 if(guidedStep===14)progress=Math.min(1,Math.max(0,productionStockFor('y').kereste||0));
 if(guidedStep===6){const v=state.vehicles.find(v=>v.id===guidedShipment);if(v){const duration=v.doneAt-v.pathStartAt;progress=duration>0?Math.min(1,Math.max(0,((v.eventPausedAt||Date.now())-v.pathStartAt)/duration)):0}}
 const percent=Math.round(progress*100);track.setAttribute('aria-valuenow',percent);track.querySelector('i').style.width=percent+'%';
 const value=document.getElementById('guidedWaitValue');if(value)value.textContent=percent+'%';
}

function guidedJourneyRect(){
 const map=document.getElementById('map'),matrix=map.getScreenCTM(),route=findRoute('y','d');if(!matrix||!route)return null;
 const points=Array.from({length:21},(_,i)=>{const pos=mapRoutePoint(route,i/20,'y'),point=map.createSVGPoint();point.x=pos.x;point.y=pos.y;return point.matrixTransform(matrix)});
 const left=Math.max(3,Math.min(...points.map(p=>p.x))-45),top=Math.max(3,Math.min(...points.map(p=>p.y))-45);
 const right=Math.min(innerWidth-3,Math.max(...points.map(p=>p.x))+45),bottom=Math.min(innerHeight-3,Math.max(...points.map(p=>p.y))+45);
 return {x:left,y:top,w:Math.max(1,right-left),h:Math.max(1,bottom-top)};
}
