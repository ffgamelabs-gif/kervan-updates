(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GameJourney=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Sales-derived level: fixed early thresholds, then each level needs LEVEL_GROWTH times more gold from sales.
const thresholds=[0,9,100,500,1500,5000,15000,40000,100000],LEVEL_GROWTH=2.5,PRESTIGE_LEVEL=7;
function threshold(n){return n<thresholds.length?thresholds[n]:thresholds.at(-1)*Math.pow(LEVEL_GROWTH,n-thresholds.length+1);}
// Small tolerance: sale gold is a float, so the first sale's 9 gold can land as 8.999… and lock hiring (build 67 fix).
function level(s){let n=1;while(s.earned+1e-6>=threshold(n)&&n<1000)n++;return n;}
function next(s){return threshold(level(s));}
const REGIONS=['forest','snow','desert','swamp','pass','harbor'];
function init(s,existing){if(!s.journey)s.journey={introDone:!!existing,sound:true,seenLevel:level(s),chainV:CHAIN_V,secondTown:existing?undefined:0};const j=s.journey;j.sound=j.sound!==false;j.introDone=j.introDone===true;j.seenLevel=Math.max(1,Math.min(level(s),Number(j.seenLevel)||1));
 const m=j.mission&&typeof j.mission==='object'?j.mission:{};j.mission=Object.fromEntries(REGIONS.map(r=>[r,Math.max(0,Math.floor(Number(m[r])||0))]));j.missionShown=Array.isArray(j.missionShown)?j.missionShown.filter(x=>typeof x==='string').slice(-40):[];
 delete j.claimed;delete j.readyShown;return j;}
function step(s,first){if(!s.journey||s.journey.introDone)return 'done';const l=s.lines[first],b=l.buildings[0],r=s.regions.forest;if(!b.open)return 'build';if(!b.cycles)return b.remaining>0?'productionWait':'produce';if(!l.caravan)return 'caravan';if(!l.manualDispatches)return 'dispatch';if(!r.sold)return l.queue>0?'sell':'travelWait';if(r.remaining>0)return 'saleWait';if(b.level<2)return 'production';return 'done';}
function lockLevel(action,i=0){return ['worker','caravanWorker','marketWorker'].includes(action)?2:action==='warehouse'||action==='build'&&i===1?3:action==='build'&&i===2?4:action==='prestige'?PRESTIGE_LEVEL:1;}
function allowed(s,action,id,i,first){if(!s.journey)return true;const stage=step(s,first);if(stage!=='done')return action===stage&&id===(stage==='sell'?'forest':first)&&i===0;return level(s)>=lockLevel(action,i);}
// Missions: one chain per region that follows its unlock path and restarts after each prestige.
// Chain version 2 (build 67) added "hire a caravan driver" as step 2. Older saves past step 1 move up one, so they
// keep the mission they had; a save still on step 1 (market) without a driver gets the driver step first.
// Chain version 3 (also build 67) gives every later town its own worker and driver: a town's worker right after it
// opens, its driver once its caravan is levelled. Older saves are moved to the same mission in the new chain.
// Chain version 4 (first patch for build 68) keeps the step-by-step lesson for the first town only. Every later town is two
// missions: "open it" (the level-ups it needs are parts of that mission) and "get it trading by itself" (workshop, worker,
// caravan, driver as one checklist). The last town's sales mission is a short proof on the first pass of the Valley.
// Older saves are moved to the same mission, or to the set-up mission of the town they were working on.
const CHAIN_V=4;
function migrate(s,E){const j=s.journey;if(!j||j.chainV>=CHAIN_V)return;
 if(!(j.chainV>=2))for(const r of REGIONS){const i=j.mission?.[r]||0;if(i>1||i===1&&s.lines[E.orders[r][0]]?.caravanWorker)j.mission[r]=i+1;}
 for(const v of [3,4]){if(j.chainV>=v)continue;for(const r of REGIONS){const i=j.mission[r]||0,old=build(s,E,r,v-1),now=build(s,E,r,v);if(i>=old.length){j.mission[r]=now.length;continue;}const m=old[i];let k=now.findIndex(x=>x.type===m.type&&x.town===m.town&&x.region===m.region);if(k<0&&v===4&&m.town)k=now.findIndex(x=>x.type==='townRuns'&&x.town===m.town);if(k>=0)j.mission[r]=k;}}
 j.chainV=CHAIN_V;}
function build(s,E,r,v){const o=E.orders[r],last=o.at(-1),nextRegion=REGIONS[REGIONS.indexOf(r)+1],p=s.regions[r].prestige||0,list=[{type:'hireWorker',town:o[0]},{type:'hireDriver',town:o[0]},{type:'hireMarket',region:r}];
 if(v>=4){list.push({type:'buildingLevel',town:o[0],n:3},{type:'caravanLevel',town:o[0],n:2});for(let k=1;k<o.length;k++)list.push({type:'openTown',town:o[k],prev:o[k-1],prep:k>=2},{type:'townRuns',town:o[k]});}
 else{for(let k=1;k<o.length;k++){list.push({type:'buildingLevel',town:o[k-1],n:3},{type:'caravanLevel',town:o[k-1],n:2});if(v>=3&&k>=2)list.push({type:'hireDriver',town:o[k-1]});list.push({type:'openTown',town:o[k]});if(v>=3)list.push({type:'hireWorker',town:o[k]});}
  if(v<3)list.push({type:'hireWorker',town:last});else if(o.length>1)list.push({type:'hireDriver',town:last});}
 // The next region needs this one re-founded once, so "open it" only joins the chain from the second pass.
 list.push({type:'sell',town:last,n:v>=4&&r==='forest'&&!p?12:100*(p+1),pay:100*(p+1)});if(nextRegion&&p>=1)list.push({type:'openRegion',region:nextRegion});list.push({type:'prestigeTarget',region:r});
 return list.map(m=>({...m,region:m.type==='openRegion'?m.region:r}));}
// The step to do now inside a mission that has parts: the pointer, the "why" line and Show me all follow it.
function stepOf(s,E,m){const l=m.town&&s.lines[m.town];
 if(m.type==='townRuns')return {...m,type:l.buildings[0].worker?'hireDriver':'hireWorker'};
 if(m.type==='openTown'&&m.prev){const q=s.lines[m.prev];if(!q.buildings[0].open||q.buildings[0].level<3)return {...m,type:'buildingLevel',town:m.prev,n:3};if(!q.caravan||q.caravanLevel<2)return {...m,type:'caravanLevel',town:m.prev,n:2};}
 return m;}
// The parts of such a mission, for the checklist in the quest window.
function parts(s,E,m){const l=m.town&&s.lines[m.town];
 if(m.type==='townRuns'){const b=l.buildings[0];return [{type:'partBuild',town:m.town,ok:b.open},{type:'hireWorker',town:m.town,ok:b.worker},{type:'partCaravan',town:m.town,ok:l.caravan},{type:'hireDriver',town:m.town,ok:l.caravanWorker}].map(x=>({...x,ok:!!x.ok,home:m.home,region:m.region}));}
 if(m.type==='openTown'&&m.prev&&!l.open){const q=s.lines[m.prev];return [{type:'buildingLevel',town:m.prev,n:3,ok:q.buildings[0].open&&q.buildings[0].level>=3},{type:'caravanLevel',town:m.prev,n:2,ok:q.caravan&&q.caravanLevel>=2}].map(x=>({...x,ok:!!x.ok,home:m.home,region:m.region}));}
 return [];}
function chain(s,E,r){migrate(s,E);const p=s.regions[r].prestige||0;return build(s,E,r,CHAIN_V).map((m,i)=>({...m,home:r,id:r+':'+p+':'+i}));}
function measure(s,E,m){const l=m.town&&s.lines[m.town],d=m.town&&E.defs[m.town];
 switch(m.type){
  case 'hireWorker':return {value:l.buildings[0].worker?1:0,target:1,reward:E.cost(s,m.town,'worker',0)};
  case 'hireDriver':return {value:l.caravanWorker?1:0,target:1,reward:E.cost(s,m.town,'caravanWorker')};
  case 'hireMarket':return {value:s.regions[m.home].worker?1:0,target:1,reward:E.cost(s,m.home,'marketWorker')};
  case 'buildingLevel':return {value:l.buildings[0].open?l.buildings[0].level:0,target:m.n,reward:Math.ceil(E.cost(s,m.town,'production',0)/2)};
  case 'caravanLevel':return {value:l.caravan?l.caravanLevel:0,target:m.n,reward:Math.ceil(E.cost(s,m.town,'transport')/2)};
  // From the third town on, opening a town also pays what the two level-up missions before it used to pay.
  case 'openTown':return {value:l.open?1:0,target:1,reward:Math.ceil(d.unlock/4)+(m.prep?Math.ceil(E.cost(s,m.prev,'production',0)/2)+Math.ceil(E.cost(s,m.prev,'transport')/2):0)};
  // Workshop, worker, caravan, driver: pays what "hire a worker" and "hire a driver" paid as two missions.
  case 'townRuns':{const b=l.buildings[0];return {value:(b.open?1:0)+(b.worker?1:0)+(l.caravan?1:0)+(l.caravanWorker?1:0),target:4,reward:E.cost(s,m.town,'worker',0)+E.cost(s,m.town,'caravanWorker')};}
  case 'sell':return {value:Math.floor(l.sold),target:m.n,reward:Math.ceil((m.pay||m.n)*E.price(s,m.town)*E.multiplier(s,m.home)/2)};
  case 'openRegion':return {value:s.regions[m.region].open?1:0,target:1,reward:Math.ceil(E.regionCost(m.region)/10)};
  case 'prestigeTarget':return {value:Math.floor(s.regions[m.home].earnedSince),target:E.prestigeTarget(s,m.home),reward:Math.ceil(E.prestigeTarget(s,m.home)/20)};}}
// Current mission of a region (null once its chain is done: the region then shows its prestige call to action).
function mission(s,E,r){if(!s.regions[r].open)return null;const list=chain(s,E,r),m=list[s.journey.mission[r]];if(!m)return null;const q=measure(s,E,m);return {...m,...q,ready:q.value+1e-7>=q.target,index:s.journey.mission[r],count:list.length};}
function upcoming(s,E,r,n=2){const list=chain(s,E,r),i=s.journey.mission[r];return list.slice(i+1,i+1+n);}
// Every quest in a row that is already done, in chain order: one tap claims them all.
function readyMissions(s,E,r){if(!canClaimMission(s,E,r))return [];const list=chain(s,E,r),out=[];for(let i=s.journey.mission[r];i<list.length;i++){const q=measure(s,E,list[i]);if(q.value+1e-7<q.target)break;out.push({...list[i],...q,ready:true,index:i,count:list.length});}return out;}
function canClaimMission(s,E,r){if(!s.journey?.introDone||!s.regions[r]?.open)return false;const m=mission(s,E,r);return !!m&&m.ready;}
function claimMission(s,E,r){if(!canClaimMission(s,E,r))return false;const m=mission(s,E,r);s.gold+=m.reward;s.journey.mission[r]++;return true;}
// Prestige restarts the region's chain (the engine bumps prestige; app calls this right after).
function resetMissions(s,r){s.journey.mission[r]=0;}
// Road goal: the one big step on the whole journey, at the furthest open region. Opening the next region once the
// frontier is re-founded, otherwise re-founding the frontier. Carries progress, unmet requirements and what it opens.
function roadGoal(s,E){const open=E.ORDER.filter(r=>s.regions[r].open),r=open.at(-1),next=E.ORDER[E.ORDER.indexOf(r)+1],m=s.regions[r],x=s.extras||{};
 if(next&&(m.prestige||0)>=1){const cost=E.regionCost(next,s);return {type:'openRegion',region:next,from:r,value:Math.min(s.gold,cost),target:cost,ready:E.regionRequirements(s,next).every(q=>q.ok)&&s.gold+1e-7>=cost,blocks:E.regionRequirements(s,next).filter(q=>!q.ok),gains:[{key:'road.gainRegion',region:next}]};}
 const target=E.prestigeTarget(s,r),blocks=E.prestigeRequirements(s,r).filter(q=>!q.ok&&q.key!=='req.regionEarned');if(level(s)<PRESTIGE_LEVEL)blocks.unshift({ok:false,key:'road.needLevel',n:PRESTIGE_LEVEL});
 const gains=[{key:'road.gainMult',n:E.multiplier(s,r)+1}];if(next&&!(m.prestige>0))gains.push({key:'road.gainRoad',region:next});if(r==='swamp'&&!E.empireReady(s))gains.push({key:'road.gainSeals'});if(r!=='forest'&&!x.tokenPaid?.[r])gains.push({key:'road.gainTokens',n:E.TOKEN_GRANT});
 return {type:'prestige',region:r,value:Math.min(m.earnedSince,target),target,ready:!blocks.length&&m.earnedSince+1e-7>=target,blocks,gains:gains.slice(0,3)};}
// Second town (first milestone after the tutorial): a one-time gift, flag and gold set together.
// Older saves decide once: anyone who already has it open, or has re-founded before, is no first-timer (no gift).
function secondTownGift(s,E){const j=s.journey,id=E.orders.forest[1];if(!j?.introDone||j.secondTown===1)return 0;
 if(j.secondTown!==0){j.secondTown=s.lines[id]?.open||(s.regions.forest.prestige||0)>0||(s.extras?.empire?.resets||0)>0?1:0;if(j.secondTown===1)return 0;}
 if(!s.lines[id]?.open)return 0;const gift=E.secondTownGift(s);j.secondTown=1;s.gold+=gift;return gift;}
// First route automated (worker, driver, market trader in the first town) and the second town open: guidance can end.
function routeDone(s,E){const l=s.lines[E.FIRST];return !!(l.buildings[0].worker&&l.caravanWorker&&s.regions.forest.worker&&s.lines[E.orders.forest[1]].open);}
return {init,secondTownGift,routeDone,stepOf,parts,CHAIN_V,level,next,threshold,step,allowed,lockLevel,mission,upcoming,readyMissions,canClaimMission,claimMission,resetMissions,roadGoal,PRESTIGE_LEVEL,REGIONS};
});
