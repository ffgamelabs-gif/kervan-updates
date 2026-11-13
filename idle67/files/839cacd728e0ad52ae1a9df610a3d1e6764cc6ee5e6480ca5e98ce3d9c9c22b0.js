(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.GameEngine=factory(root.GAME_REGIONS,root.REGION_ROAD_LAYOUT,root.RouteMotion);})(typeof globalThis!=='undefined'?globalThis:this,function(regions,layouts,motion){
'use strict';
const VERSION=3,MIN_VERSION=2,LEGACY_REGIONS=['forest','snow','desert','swamp'],TOKEN_GRANT=3,CYCLE=4,MAX_LEVEL=200,MAX_CARAVAN_LEVEL=100,OFFLINE_LIMIT=14400,ORDER=['forest','snow','desert','swamp','pass','harbor'],defs={},orders={};
// Prestige ("re-found a region"): earnings needed since the last prestige grow by PRESTIGE_GROWTH each time.
const REGION_SCALE=[1,8,60,500,4000,32000],PRESTIGE_BASE={forest:60000,snow:3e6,desert:2e8,swamp:1.5e10,pass:1e12,harbor:8e13},PRESTIGE_GROWTH=8,BIG=1e300;
// Build 42 extras. Inn: offline time 4 h, +2 h per level; each level needs the next region re-founded once; sales past 4 h offline pay 50%.
const INN_GATE=['snow','desert','swamp'],INN_COST=[2e6,2e8,2e10],HALF_AFTER=14400,BOOST_TIME=120,BOOST_COOL=600,DAILY_SECONDS=[120,180,240,300,420,600,900];
// Restyle (REGION-DESIGN.md): one-way travel seconds by distance rank, and each region's load twist
// (Desert: great caravans carry x2; Marsh: buffalo sledges carry x0.5 on very short trips; Harbor: ships carry x4; Eagle Pass: no waiting at the market).
const TRAVEL={forest:[8,12,18,25],snow:[12,18,26,36],desert:[20,35,50],swamp:[6,10,15],pass:[15,28,42,58],harbor:[10,14,40,55]},LAND_SKIN={harbor:'forest'},LOAD={forest:1,snow:1,desert:2,swamp:.5,pass:1,harbor:1};
const names={inci:['Dalgıç kulübesi','İstiridye ayıklama yeri','İnci tüccarı'],mercan:['Mercancı kulübesi','Mercan kurutma avlusu','Mercan atölyesi'],sunger:['Süngerci kulübesi','Sünger kurutma yeri','Sünger deposu'],zeytin:['Zeytinlik','Zeytin presi','Yağ deposu'],yun:['Çoban ağılı','Yün yıkama evi','Yün atölyesi'],demir:['Demir ocağı','Demir eritme evi','Demirci'],ot:['Ot bahçesi','Kurutma evi','Aktar evi'],peynir:['Sağım ahırı','Mandıra','Peynir mahzeni'],kehribar:['Kehribar toplama evi','Kehribar cilahanesi','Kehribar atölyesi'],gumus:['Gümüş madeni','Gümüş eritme evi','Gümüş dökümhanesi'],balina:['Balina iskelesi','Yağ kazanı','Yağ deposu'],kereste:['Oduncu kulübesi','Testerehane','Kereste atölyesi'],tas:['Küçük taş ocağı','Taş kesimhanesi','Büyük taş ocağı'],meyve:['Meyve bahçesi','Hasat bahçesi','Büyük meyvelik'],bugday:['Harman yeri','Tahıl ambarı','Büyük tahıl deposu'],kurk:['Avcı kulübesi','Kürk kurutma evi','Kürk atölyesi'],baharat:['Baharat bahçesi','Kurutma avlusu','Baharat deposu'],tuz:['Tuz havuzları','Tuz kurutma evi','Tuz deposu'],bakir:['Bakır ocağı','Bakır eritme evi','Bakır dökümhanesi'],suluk:['Sülük havuzları','Ayıklama kulübesi','Şifa deposu'],zehir:['Ot toplama evi','Ot kurutma atölyesi','Damıtma evi'],zift:['Zift toplama evi','Zift kazanı','Zift deposu']};
for(const [region,r]of Object.entries(regions)){
 const sorted=r.towns.map((t,i)=>({t,row:i,distance:motion.makeTrack(layouts[region].routes[i]).length})).sort((a,b)=>a.distance-b.distance);orders[region]=sorted.map(x=>x.t[0]);const scale=REGION_SCALE[ORDER.indexOf(region)];
 sorted.forEach((x,rank)=>{defs[x.t[0]]={id:x.t[0],name:x.t[1],product:x.t[2],material:x.t[3],region,row:x.row,rank:rank+1,distance:x.distance,travel:TRAVEL[region][rank],price:(sorted.length===4?[3,6,11,18]:[3,8,16])[rank]*scale,scale,unlock:rank===0?0:[0,120,450,1400][rank]*scale,buildings:names[x.t[3]]};});
}
const IDS=Object.keys(defs),FIRST=orders.forest[0];let journey=null;function attachJourney(j){journey=j;}
const people={male:['Kemal','Murat','Hasan','Ali','Osman','Selim','Boran','Nadir','Yusuf','Emre','Arda','Kerem'],female:['Elif','Zeynep','Suna','Leyla','Derya','Aslı','Aylin','Selin','Ece','İpek','Bahar','Defne']};
function person(saved,gender){const pool=people[gender];return pool.includes(saved)?saved:pool[Math.floor(Math.random()*pool.length)];}
const num=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f,clamp=(n,a,b)=>Math.max(a,Math.min(b,num(n,a))),level=n=>Math.floor(clamp(n,1,MAX_LEVEL));
// Achievements: nine tiers per goal (parchment, green, burgundy shield, each bronze → silver → gold); value(s) is the current progress.
// The first three thresholds are the old bronze/silver/gold, so claims in older saves keep their meaning. Regions reach to 16 for the regions still to come.
const ACH_TIERS=9,ACHIEVEMENTS=[['earn','gold',[1e4,1e6,1e8,1e10,1e12,1e14,1e16,1e18,1e20],s=>s.earned],['sell','trade',[1e3,5e4,1e6,2e7,5e8,1e10,2e11,5e12,1e14],s=>IDS.reduce((n,id)=>n+s.lines[id].sold,0)],['towns','village',[5,10,14,16,18,19,20,21,22],s=>IDS.filter(id=>s.lines[id].open).length],['caravan','caravans',[10,25,50,60,70,80,90,95,100],s=>Math.max(0,...IDS.map(id=>s.lines[id].caravan?s.lines[id].caravanLevel:0))],['building','construction',[25,75,150,160,170,180,190,195,200],s=>Math.max(0,...IDS.flatMap(id=>s.lines[id].buildings.map(b=>b.open?b.level:0)))],['prestige','prestige',[1,5,15,25,40,60,80,100,150],s=>Math.max(s.extras.refounds||0,ORDER.reduce((n,r)=>n+(s.regions[r].prestige||0),0))],['regions','map',[2,3,4,5,6,8,10,13,16],s=>ORDER.filter(r=>s.regions[r].open).length],['daily','sun',[3,7,30,60,100,150,200,300,365],s=>s.extras.dailies],['boost','speed',[5,25,100,250,500,1000,2000,3500,5000],s=>s.extras.boosts],['merchant','camel',[5,25,100,250,500,1000,2000,3500,5000],s=>s.extras.merchants]].map(([id,icon,tiers,value])=>({id,icon,tiers,value}));
// Rewarded ads (build 45): adBoost = seconds of x2 sales left (20 min per ad, banked up to 1 h); chestAt = when the free chest is ready.
const AD_BOOST=1200,AD_BOOST_CAP=3600,CHEST_EVERY=4*3600e3;
// New buildings take time to build (seconds; small, middle, large building). The tutorial town and re-founded regions build at once.
const BUILD_TIME={forest:[60,180,600],snow:[300,900,1800],desert:[900,1800,3600],swamp:[1800,3600,7200],pass:[1800,3600,7200],harbor:[1800,3600,7200]},FREE_FINISH=60,AD_SKIP=1800;
// A region's buildings are timed until it has been re-founded once, ever. Rebuilds after that are instant, also after an empire reset.
function buildTime(s,id,i){const r=defs[id].region;return id===FIRST||s.extras.founded[r]||s.regions[r].prestige>0?0:BUILD_TIME[r][i];}
function finishBuilding(s,id,b){b.construct=0;b.open=true;if(veteran(s,defs[id].region))b.worker=true;}
// Ad reward for a building under construction: 30 min less (finishes it when less is left).
function adConstruct(s,id,i){const b=s.lines[id]?.buildings[i];if(!b||!(b.construct>0))return false;s.extras.ads=(s.extras.ads||0)+1;b.construct=Math.max(0,b.construct-AD_SKIP);if(b.construct<=0)finishBuilding(s,id,b);return true;}
// Empire reset: Trade Seals come from the gold earned this run (square root: longer runs pay more, with diminishing returns).
// The tree: three branches of levelled upgrades, plus one pick-one choice per branch that opens after PICK_NEED levels there.
const SEAL_DIVISOR=3e9,PICK_NEED=3,PICK_COST=5,REPICK_COST=2,SEAL_TREE={speed:{branch:'roads',max:10,cost:2,grow:1.35,step:.05},load:{branch:'roads',max:40,cost:2,grow:1.25,step:.15},open:{branch:'roads',max:9,cost:3,grow:1.5,step:.1},output:{branch:'shops',max:60,cost:2,grow:1.22,step:.2},start:{branch:'shops',max:6,cost:4,grow:2.5,step:1},thrift:{branch:'shops',max:10,cost:3,grow:1.4,step:.03},price:{branch:'markets',max:100,cost:2,grow:1.2,step:.25},pace:{branch:'markets',max:40,cost:2,grow:1.25,step:.15},away:{branch:'markets',max:6,cost:5,grow:1.8,step:1}},SEAL_PICKS={roads:['swift','heavy'],shops:['keen','frugal'],markets:['merchant','patient']};
const START_GOLD=[60,1e3,1e5,1e7,1e9,1e11,1e13];
function freshEmpire(){return {seals:0,resets:0,base:0,up:{},pick:{},stampsUsed:0};}
// Trade Book: pick one of two sales jobs, earn stamps that survive every reset. Stamp ranks open Market Rush and small lasting rewards.
const BOOK_LEVEL=3,BOOK_RANKS=[3,8,15,25,40],BOOK_JOBS=[[1,300,90],[2,900,240]],RUSH_STEPS=3,RUSH_TIME=180,RUSH_COOL=1800,RUSH_FAIL_COOL=600,RUSH_SECONDS=30;
function freshBook(){return {stamps:0,jobs:0,job:null,offers:[]};}
function freshRush(){return {cool:0,best:0,plays:0,wins:0,lost:false,run:null};}
// Challenge re-foundings: an optional rule for a region's next run. Reaching the next re-founding with it on pays stamps, once per rule per region. It can be dropped any time.
const CHALLENGE_STAMPS=2,CHALLENGES={light:{load:.5,speed:2},crowded:{pace:.2,pay:1.25}},RULES=Object.keys(CHALLENGES);
function freshChallenge(){return {on:{},done:{},won:null};}
const ruleOf=(s,r)=>CHALLENGES[s.extras.challenge.on[r]]||{};
function challengeOpen(s){return bookRank(s)>=1;}
function challengeFree(s,r){return RULES.filter(k=>!s.extras.challenge.done[r+':'+k]);}
function bookRank(s){return BOOK_RANKS.filter(n=>s.extras.book.stamps>=n).length;}
function bookSale(s){const r=bookRank(s);return r>=5?.1:r>=4?.05:0;}
function bookOpen(s){return !!s.journey?.introDone&&!!journey&&(s.extras.book.jobs>0||s.extras.book.job||journey.level(s)>=BOOK_LEVEL)&&IDS.some(id=>s.lines[id].open&&s.lines[id].caravan);}
const jobTowns=s=>IDS.filter(id=>s.lines[id].open&&s.lines[id].caravan&&s.regions[defs[id].region].open);
// Units a town can really sell per second: limited by its buildings, its caravan and its share of the market.
function townLimits(s,id){const l=s.lines[id],r=defs[id].region,towns=Math.max(1,orders[r].filter(k=>s.lines[k].open).length);let production=0;l.buildings.forEach((b,i)=>{if(b.open)production+=batch(s,id,i)/CYCLE;});return {production,caravan:l.caravan?capacity(s,id)/(2*travel(s,id)+CYCLE):0,market:rate(s,r)/towns};}
function townRate(s,id){return Math.max(.2,Math.min(...Object.values(townLimits(s,id))));}
function townHold(s,id){const o=townLimits(s,id);return Object.keys(o).reduce((a,b)=>o[b]<o[a]?b:a);}
function shuffled(a){const o=[...a];for(let i=o.length-1;i>0;i--){const k=Math.floor(Math.random()*(i+1));[o[i],o[k]]=[o[k],o[i]];}return o;}
function bookOffers(s){const towns=shuffled(jobTowns(s));if(!towns.length)return [];const gold=bookRank(s)>=2?1.5:1,list=bookRank(s)>=3?[BOOK_JOBS[0],BOOK_JOBS[1],BOOK_JOBS[1]]:BOOK_JOBS;return list.map(([stamps,seconds,pay],i)=>{const town=towns[i%towns.length];return {town,stamps,target:nice(Math.max(20,townRate(s,town)*seconds)),gold:nice(Math.max(50,potential(s)*pay*gold))};});}
// Untaken offers are re-priced, target and gold together, each time the Book is opened (they used to keep the amounts from when they
// were made, so an offer left for hours paid far behind the player's income). Towns stay the same; a taken job never changes.
function refreshBook(s){const b=bookState(s);if(b.job)return b;const gold=bookRank(s)>=2?1.5:1;for(const o of b.offers){const [,seconds,pay]=BOOK_JOBS[o.stamps-1];o.target=nice(Math.max(20,townRate(s,o.town)*seconds));o.gold=nice(Math.max(50,potential(s)*pay*gold));}return b;}
// Keeps the offers usable: refreshes them when empty or when a reset has closed a town.
function bookState(s){const b=s.extras.book;if(!b.job&&(!b.offers.length||b.offers.some(o=>!s.lines[o.town].open||!s.lines[o.town].caravan)))b.offers=bookOffers(s);return b;}
// Market Rush: three quick sales targets in one region, for a coin prize and a best time. Losing costs nothing but the wait.
function rushRegion(s){return [...ORDER].reverse().find(r=>s.regions[r].open&&s.regions[r].worker&&rushTowns(s,r).length>=2)||null;}
function rushTowns(s,r){return orders[r].filter(id=>{const l=s.lines[id];return l.open&&l.caravanWorker&&l.buildings.some(b=>b.open&&b.worker);});}
// Targets are set when the choice appears, so the number on the button is the number to beat.
function rushDeal(s,u){u.options=shuffled(rushTowns(s,u.region)).slice(0,2);u.goals=Object.fromEntries(u.options.map(id=>[id,rushTarget(s,id)]));}
function rushTarget(s,id){const l=s.lines[id],r=defs[id].region;let prod=0;l.buildings.forEach((b,i)=>{if(b.open)prod+=batch(s,id,i)/CYCLE;});const supply=Math.min(prod,capacity(s,id)/(2*travel(s,id)+CYCLE))+(l.queue+l.cargo)/RUSH_SECONDS;return nice(Math.max(6,RUSH_SECONDS*Math.min(rate(s,r),supply)*.8));}
// Time for a rush: three minutes, or three round trips of the region's slowest rush town when that is longer. Goods arrive by the
// caravan-load, so with a fixed three minutes the long-road regions (Desert, Eagle Pass) were close to unwinnable even for a perfect player.
function rushTime(s,r){const round=Math.max(0,...rushTowns(s,r).map(id=>2*travel(s,id)+CYCLE));return Math.max(RUSH_TIME,Math.round(3*round/10)*10);}
function rushPrize(s){return nice(Math.max(200,potential(s)*300));}
function rushReady(s){const r=s.extras.rush;return bookRank(s)>=1&&!r.run&&r.cool<=0&&!!rushRegion(s);}
function rushEnd(s,cool){const r=s.extras.rush;r.run=null;r.cool=cool;}
// Sales counted for the open job and the rush; called from the market, so offline sales count for jobs too.
function credit(s,id,n){const x=s.extras,j=x.book.job,u=x.rush.run;if(j&&j.town===id)j.done=Math.min(j.target,j.done+n);if(u&&!u.won&&u.town===id){u.done+=n;if(u.done+1e-7>=u.target){u.step++;u.town=null;u.done=0;u.target=0;if(u.step>=RUSH_STEPS)u.won=true;else rushDeal(s,u);}}}
function rushTick(s,dt){const r=s.extras.rush;if(r.cool>0)r.cool=Math.max(0,r.cool-dt);const u=r.run;if(!u||u.won)return;u.left-=dt;u.time+=dt;if(u.left<=0){r.lost=true;r.lostAt={step:u.step,picked:u.town?1:0};rushEnd(s,RUSH_FAIL_COOL);}}
function sealLevel(s,id){return s.extras.empire.up[id]||0;}
function picked(s,id){return Object.values(s.extras.empire.pick).includes(id);}
function sealBonus(s,id){return sealLevel(s,id)*SEAL_TREE[id].step;}
function branchLevels(s,branch){return Object.keys(SEAL_TREE).filter(id=>SEAL_TREE[id].branch===branch).reduce((n,id)=>n+sealLevel(s,id),0);}
function sealCost(s,id){return Math.ceil(SEAL_TREE[id].cost*Math.pow(SEAL_TREE[id].grow,sealLevel(s,id)));}
// The first empire reset never pays fewer than FIRST_SEALS: a casual player reaches it with about 3, too few to feel the tree.
const FIRST_SEALS=10;
// Trade Book seals: past the last rank (40 stamps), every 10 new stamps add one seal to the next empire reset, at most 3 a reset.
// Stamps are never spent; empire.stampsUsed remembers how many have already been turned into seals.
const BOOK_SEAL_FROM=40,BOOK_SEAL_EACH=10,BOOK_SEAL_CAP=3;
function bookSeals(s){const st=s.extras.book?.stamps||0,used=Math.max(BOOK_SEAL_FROM,s.extras.empire.stampsUsed||0);return Math.min(BOOK_SEAL_CAP,Math.floor(Math.max(0,st-used)/BOOK_SEAL_EACH));}
function bookSealProgress(s){const st=s.extras.book?.stamps||0,used=Math.max(BOOK_SEAL_FROM,s.extras.empire.stampsUsed||0),n=bookSeals(s);return {seals:n,cap:BOOK_SEAL_CAP,stamps:n>=BOOK_SEAL_CAP?BOOK_SEAL_EACH:Math.max(0,st-used)%BOOK_SEAL_EACH,each:BOOK_SEAL_EACH,open:st>=BOOK_SEAL_FROM};}
function runSeals(s){const n=Math.floor(Math.sqrt(Math.max(0,s.earned-s.extras.empire.base)/SEAL_DIVISOR));return s.extras.empire.resets===0?Math.max(FIRST_SEALS,n):n;}
function sealGain(s){return runSeals(s)+bookSeals(s);}
// Second-town gift: about 5 minutes of potential income, never less than the town's opening price back.
function secondTownGift(s){return nice(Math.max(defs[orders.forest[1]].unlock,potential(s)*300));}
const veteranRun=s=>s.extras.empire.resets>0,veteran=(s,r)=>s.regions[r].prestige>0||veteranRun(s);
const speedMult=s=>1+sealBonus(s,'speed')+(picked(s,'swift')?.25:0),loadMult=s=>1+sealBonus(s,'load')+(picked(s,'heavy')?.25:0),outputMult=s=>1+sealBonus(s,'output')+(picked(s,'keen')?.25:0),priceMult=s=>1+sealBonus(s,'price')+(picked(s,'merchant')?.25:0)+bookSale(s),paceMult=s=>1+sealBonus(s,'pace'),thriftMult=s=>1-sealBonus(s,'thrift')-(picked(s,'frugal')?.15:0);
function travel(s,id){return defs[id].travel/speedMult(s)/(ruleOf(s,defs[id].region).speed||1);}
// A speed upgrade bought mid-trip keeps each caravan where it is on the road.
function rescaleTrips(s,speedBefore){const k=speedBefore/speedMult(s);if(k!==1)for(const id of IDS){const l=s.lines[id];if(l.phase==='outbound'||l.phase==='returning')l.remaining*=k;}}
function halfAfter(s){return HALF_AFTER+(picked(s,'patient')?7200:0);}
function empireReady(s){return s.regions.swamp.prestige>0;}
// Everything earned this run goes back to the start; seals, the tree, medals, daily progress, the inn, ad timers and hired-staff know-how stay.
// An open Trade Book job is dropped too: its gold was priced from this run's income and would pay out minutes into the next one.
function empireReset(s){const x=s.extras,e=x.empire;x.rush.run=null;x.challenge.on={};x.book.job=null;x.book.offers=[];const b=bookSeals(s);e.seals+=sealGain(s);e.stampsUsed=Math.max(BOOK_SEAL_FROM,e.stampsUsed||0)+b*BOOK_SEAL_EACH;e.resets++;e.base=s.earned;s.gold=START_GOLD[sealLevel(s,'start')];x.rate=0;
 for(const r of ORDER){const m=s.regions[r];if(m.prestige>0)x.founded[r]=1;m.open=r==='forest';m.level=1;m.remaining=0;m.prestige=0;m.earnedSince=0;m.worker=r==='forest';if(journey&&s.journey)journey.resetMissions(s,r);}
 for(const id of IDS){const old=s.lines[id],l=freshLine(id===FIRST);l.workerNames=old.workerNames;l.caravanName=old.caravanName;s.lines[id]=l;}}
// Keepsakes that survive every reset: lifetime caravan trips per town (veteran trim at VET_RANKS) and each building's best milestone tier (workshop dress).
const VET_RANKS=[25,250,2500];
function vetRank(s,id){const n=s.extras.trips[id]||0;return VET_RANKS.filter(v=>n>=v).length;}
const tierOf=level=>MILESTONES.filter(m=>level>=m).length;
function dressUp(s,id,i){const d=s.extras.dress[id]||(s.extras.dress[id]=[0,0,0]),t=tierOf(s.lines[id].buildings[i].level);if(t>d[i])d[i]=t;}
// Critter album (1.7.6): five animals per region. One new visitor a day, from the regions the player has opened, in order.
const CRITTERS_PER_REGION=5,CRITTER_IDS=ORDER.flatMap(r=>Array.from({length:CRITTERS_PER_REGION},(_,i)=>r+'-'+(i+1)));
function nextCritter(s){for(const r of ORDER){if(!s.regions[r]?.open)continue;for(let i=1;i<=CRITTERS_PER_REGION;i++){const id=r+'-'+i;if(!s.extras.critters.got[id])return id;}}return null;}
function critterVisit(s,day){const c=s.extras.critters;if(!day||c.last===day)return null;const id=nextCritter(s);if(!id)return null;c.got[id]=day;c.last=day;return id;}
// Region statue tier (1.7.6): bronze, silver, gold, jeweled, radiant at a region's 1st to 5th re-founding.
const statueTier=(s,r)=>Math.min(5,Math.floor(Number(s.regions[r]?.prestige)||0));
function freshExtras(now=Date.now()){return {born:now,played:0,refounds:0,trips:{},dress:{},book:freshBook(),rush:freshRush(),challenge:freshChallenge(),empire:freshEmpire(),rate:0,adBoost:0,chestAt:0,ads:0,inn:0,tokens:0,tokenPaid:{},founded:{},daily:{next:0,last:''},critters:{got:{},last:''},dailies:0,boosts:0,merchants:0,ach:Object.fromEntries(ACHIEVEMENTS.map(a=>[a.id,0])),achSeen:Object.fromEntries(ACHIEVEMENTS.map(a=>[a.id,0]))};}
// saveId names one game across devices; cloudRev counts its cloud uploads. See cloudVerdict in services.js.
function fresh(now=Date.now()){return {version:VERSION,saveId:now.toString(36)+Math.random().toString(36).slice(2,10),cloudRev:0,gold:60,earned:0,lastAt:now,extras:freshExtras(now),regions:Object.fromEntries(ORDER.map(id=>[id,{open:id==='forest',level:1,workerName:person(null,'female'),worker:false,remaining:0,manualStarts:0,sold:0,prestige:0,earnedSince:0}])),lines:Object.fromEntries(IDS.map(id=>[id,freshLine(id===FIRST)]))};}
function freshLine(open){return {open,workerNames:[person(null,'male'),person(null,'female'),person(null,'male')],caravanName:person(null,'male'),warehouseLevel:1,caravan:false,caravanLevel:1,caravanWorker:false,boost:0,cool:0,manualDispatches:0,trips:0,phase:'loading',remaining:0,stock:0,cargo:0,queue:0,sold:0,buildings:[0,1,2].map(()=>({open:false,construct:0,level:1,worker:false,remaining:0,batch:0,cycles:0,manualStarts:0}))};}
function multiplier(s,r){return (s.regions[r].prestige||0)+1;}
// The very first Valley re-founding asks 45K instead of 60K (owner, 2026-11-13: first-timer pacing). Later ones are unchanged.
const FIRST_FOREST_TARGET=45000;
function prestigeTarget(s,r){const p=s.regions[r].prestige||0;return r==='forest'&&p===0?FIRST_FOREST_TARGET:PRESTIGE_BASE[r]*Math.pow(PRESTIGE_GROWTH,p);}
function prestigeRequirements(s,r){const m=s.regions[r];return [{ok:orders[r].every(id=>s.lines[id].open),key:'req.allTownsOpen',region:r},{ok:m.earnedSince+1e-7>=prestigeTarget(s,r),key:'req.regionEarned',region:r,value:m.earnedSince,target:prestigeTarget(s,r)}];}
// Resets the region's towns; gold, other regions and the market worker stay. Rebuilt staff return automatically (see act).
function prestige(s,r,rule){const m=s.regions[r],ch=s.extras.challenge,on=ch.on[r];ch.won=null;if(on){ch.done[r+':'+on]=1;s.extras.book.stamps+=CHALLENGE_STAMPS;ch.won=on;}delete ch.on[r];if(rule&&challengeOpen(s)&&challengeFree(s,r).includes(rule))ch.on[r]=rule;if(s.extras.rush.run?.region===r)s.extras.rush.run=null;m.prestige=(m.prestige||0)+1;s.extras.refounds=(s.extras.refounds||0)+1;m.earnedSince=0;grantFounding(s,r);m.level=1;m.remaining=0;for(const id of orders[r]){const old=s.lines[id],l=freshLine(id===orders[r][0]);l.workerNames=old.workerNames;l.caravanName=old.caravanName;s.lines[id]=l;}if(journey&&s.journey)journey.resetMissions(s,r);}
// Builder's Tokens: paid once per region, on its first re-founding, from the Frostlands on. They survive every reset.
function grantFounding(s,r){const x=s.extras;x.founded[r]=1;if(r!=='forest'&&!x.tokenPaid[r]){x.tokenPaid[r]=1;x.tokens+=TOKEN_GRANT;}}
// The first town's hut and caravan (10 gold each) are kept aside until both exist, so no other purchase can leave a run with nothing to produce or carry.
const hutDue=s=>{const b=s.lines[FIRST].buildings[0];return b.open||b.construct>0?0:10;},caravanDue=s=>s.lines[FIRST].caravan?0:10;
function available(s){return Math.max(0,s.gold-caravanDue(s)-hutDue(s));}
function spendable(s,c){return available(s)+1e-7>=c;}
function capacity(s,id){return Math.max(1,Math.floor(6*Math.pow(1.35,s.lines[id].caravanLevel-1)*LOAD[defs[id].region]*(isShip(id)?4:1)*loadMult(s)*(ruleOf(s,defs[id].region).load||1)));}
function stockCap(s,id){return Math.floor(Math.max(60,capacity(s,id)*6)*Math.pow(1.5,(s.lines[id].warehouseLevel||1)-1));}
function queueCap(s,r){return Math.floor(60*Math.pow(1.4,s.regions[r].level-1));}
function rate(s,r){return 2*Math.pow(1.35,s.regions[r].level-1)*paceMult(s)*(ruleOf(s,r).pace||1);}
// Building milestones: output doubles at each of these levels.
const MILESTONES=[25,50,100,200];
function milestone(level){const reached=MILESTONES.filter(m=>level>=m).length;return {mult:Math.pow(2,reached),next:MILESTONES[reached]??0};}
function batch(s,id,i){const level=s.lines[id].buildings[i].level;return Math.max(2,Math.round(3*Math.pow(2,i)*Math.pow(1.25,level-1)*milestone(level).mult*outputMult(s)));}
function price(s,id){return defs[id].price*priceMult(s)*(ruleOf(s,defs[id].region).pay||1);}
function regionCost(r,s){return {forest:0,snow:50000,desert:5e6,swamp:4e8,pass:3e10,harbor:2.4e12}[r]*(s?1-sealBonus(s,'open'):1);}
function offlineLimit(s){return OFFLINE_LIMIT+7200*(s.extras?.inn||0)+(s.extras?3600*sealBonus(s,'away'):0)+(s.extras&&picked(s,'patient')?7200:0);}
// Gold per second the current setup could earn with everything automated; scales daily, merchant and medal rewards.
function potential(s){let total=0;for(const r of ORDER){if(!s.regions[r].open)continue;let units=0,value=0;for(const id of orders[r]){const l=s.lines[id];if(!l.open)continue;let prod=0;l.buildings.forEach((b,i)=>{if(b.open)prod+=batch(s,id,i)/CYCLE;});const u=Math.min(prod,l.caravan?capacity(s,id)/(2*travel(s,id)+CYCLE):0);units+=u;value+=u*price(s,id);}if(units>0)total+=Math.min(1,rate(s,r)/units)*value*multiplier(s,r);}return total;}
const nice=n=>{const p=Math.pow(10,Math.max(0,Math.floor(Math.log10(Math.max(1,n)))-1));return Math.round(n/p)*p;};
function dailyReward(s,day=s.extras.daily.next){return nice(Math.max(50,potential(s)*DAILY_SECONDS[day]));}
// What the player really earns per second (sales over the last few minutes, without the ad x2), capped by the potential.
function earning(s){return Math.min(potential(s),s.extras.rate||0);}
function merchantReward(s){return nice(Math.max(30,earning(s)*45));}
// Reward per tier: a floor in gold, or that many seconds of potential income (180 s at the first tier, an hour at the last).
function achievementReward(s,tier){return nice(Math.max([100,1e3,1e4,3e4,1e5,3e5,1e6,3e6,1e7][tier],potential(s)*[180,480,900,1200,1500,1800,2400,3000,3600][tier]));}
function achievements(s){return ACHIEVEMENTS.map(a=>{const value=a.value(s),claimed=s.extras.ach[a.id]||0,reached=a.tiers.filter(t=>value+1e-7>=t).length;return {id:a.id,icon:a.icon,tiers:a.tiers,value,claimed,reached,target:a.tiers[Math.min(claimed,ACH_TIERS-1)],ready:reached>claimed,reward:claimed<ACH_TIERS?achievementReward(s,claimed):0};});}
// The inn's gate region counts once re-founded ever, so an empire reset doesn't lock the inn again.
function innOpen(s){const r=INN_GATE[s.extras.inn];return !!r&&((s.regions[r].prestige||0)>=1||!!s.extras.founded[r]);}
function innCost(s){return INN_COST[s.extras.inn]??0;}
// Ad rewards. The UI calls these only after the ad SDK reports the reward as earned.
function chestReward(s){return nice(Math.max(100,earning(s)*600));}
function chestReady(s,now=Date.now()){return now>=(s.extras.chestAt||0);}
function adReward(s,kind,gold=0,now=Date.now()){const x=s.extras;x.ads=(x.ads||0)+1;
 if(kind==='boost'){x.adBoost=Math.min(AD_BOOST_CAP,(x.adBoost||0)+AD_BOOST);return true;}
 if(kind==='chest'){if(!chestReady(s,now))return false;gold=chestReward(s);x.chestAt=now+CHEST_EVERY;}
 s.gold+=Math.max(0,num(gold));return true;}
// ahead: price of the level that many steps above the current one (used for bulk buying).
function cost(s,id,type,i=0,ahead=0){const c=baseCost(s,id,type,i,ahead);return UPGRADES.includes(type)?Math.ceil(c*thriftMult(s)):c;}
function baseCost(s,id,type,i,ahead){const d=defs[id],l=s.lines[id];if(type==='build')return [10,45,140][i]*d.scale;if(type==='worker')return [12,30,70][i]*d.scale;if(type==='caravan')return 10*d.scale;if(type==='caravanWorker')return 18*d.scale;if(type==='production')return Math.ceil(16*d.scale*Math.pow(2.5,i)*Math.pow(1.5,l.buildings[i].level-1+ahead));if(type==='warehouse')return Math.ceil(30*d.scale*Math.pow(1.65,(l.warehouseLevel||1)-1+ahead));if(type==='transport')return Math.ceil(24*d.scale*Math.pow(1.55,l.caravanLevel-1+ahead));const r=s.regions[id],scale=REGION_SCALE[ORDER.indexOf(id)];if(type==='marketWorker')return 18*scale;return Math.ceil(40*scale*Math.pow(1.5,r.level-1+ahead));}
// Bulk upgrade (x1/x10/max): how many levels the button buys and their total price. 'max' buys what is affordable
// (at least shows the next level); x10 needs all ten (or the levels left) to be affordable.
const UPGRADES=['production','warehouse','transport','market'];
function upgradeLevel(s,action,id,i){return action==='production'?s.lines[id].buildings[i].level:action==='warehouse'?(s.lines[id].warehouseLevel||1):action==='transport'?s.lines[id].caravanLevel:s.regions[id].level;}
function bulk(s,action,id,i=0,mode=1){const left=(action==='transport'?MAX_CARAVAN_LEVEL:MAX_LEVEL)-upgradeLevel(s,action,id,i);if(left<=0)return {n:0,cost:0,affordable:false};
 const limit=mode==='max'?left:Math.min(mode,left),budget=available(s);let n=0,sum=0;
 for(let k=0;k<limit;k++){const c=cost(s,id,action,i,k);if(mode==='max'&&n>0&&sum+c>budget+1e-7)break;sum+=c;n++;}
 return {n,cost:sum,affordable:spendable(s,sum)};}
// Buy to milestone: exactly the production levels up to the building's next x2, at normal prices, all or nothing.
function toMilestone(s,id,i){const b=s.lines[id].buildings[i],next=milestone(b.level).next;if(!b.open||!next)return {n:0,cost:0,affordable:false};return bulk(s,'production',id,i,next-b.level);}
// The upgrade that adds the most sellable gold per second for its price in this town (one level each), or null when none adds any.
// Only the town's tightest step (production, caravan, its market share) raises what it sells, so this points at that step's cheapest fix.
function bestUpgrade(s,id){const b=bestRaw(s,id);return b&&{action:b.action,i:b.i};}
// The best upgrade across a region's towns, in gold per second for its price; one the player can pay for now comes first.
function regionBest(s,r){let best=null;for(const id of orders[r]){const b=bestRaw(s,id);if(!b)continue;const o={town:id,action:b.action,i:b.i,affordable:spendable(s,b.cost),value:b.value*price(s,id)};if(!best||o.affordable&&!best.affordable||o.affordable===best.affordable&&o.value>best.value)best=o;}return best;}
// Valley towns 2 to 4: workers and drivers can be hired without doing the job once by hand (the first town taught it).
const handsFree=id=>defs[id].region==='forest'&&id!==FIRST;
// The first step still missing for goods to sell by themselves (in one region, or in any open one): a first building, a worker,
// a caravan, a driver, the market trader. null when every open town runs by itself.
function idleGap(s,only){for(const r of ORDER){if(!s.regions[r].open||only&&r!==only)continue;for(const id of orders[r]){const l=s.lines[id];if(!l.open)continue;const kind=!l.buildings.some(b=>b.open||b.construct>0)?'build':l.buildings.some(b=>b.open)&&!l.buildings.some(b=>b.open&&b.worker)?'worker':!l.caravan?'caravan':!l.caravanWorker?'driver':'';if(kind)return {kind,town:id,region:r};}if(!s.regions[r].worker)return {kind:'market',region:r};}return null;}
function bestRaw(s,id){const l=s.lines[id],r=defs[id].region,m=s.regions[r];if(!l.open)return null;const now=townRate(s,id);let best=null;
 const tryOne=(action,i,bump)=>{const c=cost(s,action==='market'?r:id,action,i);bump(1);const gain=townRate(s,id)-now;bump(-1);if(gain>1e-9&&(!best||gain/c>best.value))best={action,i,value:gain/c,cost:c};};
 l.buildings.forEach((b,i)=>{if(b.open&&b.level<MAX_LEVEL)tryOne('production',i,k=>{b.level+=k;});});
 if(l.caravan&&l.caravanLevel<MAX_CARAVAN_LEVEL)tryOne('transport',0,k=>{l.caravanLevel+=k;});
 if(m.level<MAX_LEVEL)tryOne('market',0,k=>{m.level+=k;});
 return best;}
function buyBulk(s,action,id,i,mode){if(!UPGRADES.includes(action))return 0;const {n,affordable}=bulk(s,action,id,i,mode);if(!affordable)return 0;let done=0;while(done<n&&act(s,action,id,i))done++;return done;}
// Requirement rows carry a text key plus region/town ids; the UI turns them into words (i18n.js).
function requirements(s,id){const d=defs[id],index=orders[d.region].indexOf(id);if(!s.regions[d.region].open)return [{ok:false,key:'req.openRegion',region:d.region}];if(!index)return [];const previous=orders[d.region][index-1],l=s.lines[previous];return [{ok:l.open,key:'req.townOpen',town:previous},{ok:l.buildings[0].level>=3&&l.buildings[0].open,key:'req.prevBuilding'},{ok:l.caravan&&l.caravanLevel>=2,key:'req.prevCaravan'}];}
function regionRequirements(s,r){const index=ORDER.indexOf(r);if(index<=0)return [];const prev=ORDER[index-1],last=orders[prev].at(-1),l=s.lines[last];return [{ok:s.regions[prev].open,key:'req.regionOpen',region:prev},{ok:(s.regions[prev].prestige||0)>=1,key:'req.prevPrestige',region:prev},{ok:orders[prev].every(id=>s.lines[id].open),key:'req.allTowns'},{ok:l.buildings[0].open&&l.buildings[0].level>=3,key:'req.lastBuilding',town:last},{ok:l.caravan&&l.caravanLevel>=2,key:'req.lastCaravan',town:last}];}
function can(s,action,id,i=0){if(action==='claimMission')return !!journey&&journey.canClaimMission(s,api,id);if(journey&&!journey.allowed(s,action,id,i,FIRST))return false;const d=defs[id],l=s.lines[id],b=l?.buildings[i],r=s.regions[id];
 if(action==='prestige')return !!r&&r.open&&prestigeRequirements(s,id).every(x=>x.ok);
 if(action==='inn'){const n=s.extras.inn;return n<3&&innOpen(s)&&spendable(s,INN_COST[n]);}
 if(action==='merchant')return !journey||!!s.journey?.introDone;
 if(action==='daily')return typeof id==='string'&&id!==s.extras.daily.last&&(!journey||!!s.journey?.introDone);// id: local date YYYY-MM-DD
 if(action==='achievement')return achievements(s).some(a=>a.id===id&&a.ready);
 if(action==='boost')return !!l?.open&&s.regions[d.region].open&&l.buildings.some(x=>x.open&&x.worker)&&!(l.cool>0);
 if(action==='empire')return empireReady(s);
 if(action==='challengeDrop')return !!s.extras.challenge.on[id];
 if(action==='bookTake'){const b=s.extras.book;return bookOpen(s)&&!b.job&&!!b.offers[id];}
 if(action==='bookDrop')return !!s.extras.book.job;
 if(action==='bookClaim'){const j=s.extras.book.job;return !!j&&j.done+1e-7>=j.target;}
 if(action==='rushStart')return rushReady(s);
 if(action==='rushPick'){const u=s.extras.rush.run;return !!u&&!u.won&&!u.town&&u.options.includes(id);}
 if(action==='rushClaim')return !!s.extras.rush.run?.won;
 if(action==='seal'){const u=SEAL_TREE[id];return !!u&&sealLevel(s,id)<u.max&&s.extras.empire.seals>=sealCost(s,id);}
 if(action==='sealPick'){const branch=Object.keys(SEAL_PICKS).find(k=>SEAL_PICKS[k].includes(id)),e=s.extras.empire;return !!branch&&e.pick[branch]!==id&&branchLevels(s,branch)>=PICK_NEED&&e.seals>=(e.pick[branch]?REPICK_COST:PICK_COST);}
 if(action==='unlockRegion')return !!r&&!r.open&&regionRequirements(s,id).every(x=>x.ok)&&spendable(s,regionCost(id,s));
 if(action==='unlock')return !!l&&!l.open&&requirements(s,id).every(x=>x.ok)&&spendable(s,d.unlock);
 if(action==='sell')return !!r&&r.open&&!r.worker&&r.remaining===0&&orders[id].some(k=>s.lines[k].queue>0);
 if(action==='marketWorker')return !!r&&r.open&&!r.worker&&r.manualStarts>0&&r.remaining===0&&r.sold>0&&spendable(s,cost(s,id,action));
 if(action==='market')return !!r&&r.open&&r.level<MAX_LEVEL&&spendable(s,cost(s,id,action));
 if(!l?.open||!s.regions[d.region].open)return false;
 if(action==='finishBuild')return !!b&&b.construct>0&&b.construct<=FREE_FINISH;
 if(action==='tokenSkip')return !!b&&b.construct>0&&s.extras.tokens>0;
 if(action==='build')return !!b&&!b.open&&!(b.construct>0)&&(i===0||l.buildings[i-1].open&&l.buildings[i-1].level>=2)&&(id===FIRST&&i===0?s.gold-caravanDue(s)+1e-7>=cost(s,id,action,i):spendable(s,cost(s,id,action,i)));
 if(action==='produce')return !!b?.open&&!b.worker&&b.remaining===0&&l.stock<stockCap(s,id);
 if(action==='worker')return !!b?.open&&!b.worker&&(handsFree(id)||b.cycles>0&&b.manualStarts>0)&&b.remaining===0&&spendable(s,cost(s,id,action,i));
 if(action==='caravan')return !l.caravan&&(id===FIRST?s.gold-hutDue(s)>=10:spendable(s,cost(s,id,action)));
 if(action==='dispatch')return l.caravan&&!l.caravanWorker&&l.phase==='loading'&&l.stock>=1;
 if(action==='caravanWorker')return l.caravan&&!l.caravanWorker&&(handsFree(id)||l.trips>0&&l.manualDispatches>0)&&l.phase==='loading'&&spendable(s,cost(s,id,action));
 if(action==='production')return !!b?.open&&b.level<MAX_LEVEL&&spendable(s,cost(s,id,action,i));
 if(action==='warehouse')return (l.warehouseLevel||1)<MAX_LEVEL&&spendable(s,cost(s,id,action));if(action==='transport')return l.caravan&&l.caravanLevel<MAX_CARAVAN_LEVEL&&spendable(s,cost(s,id,action));return false;
}
function produce(s,id,i,manual){const l=s.lines[id],b=l.buildings[i];if(!l.open||!b.open||b.remaining||l.stock>=stockCap(s,id))return;b.remaining=CYCLE;b.batch=batch(s,id,i);if(manual)b.manualStarts++;}
function dispatch(s,id,manual){const l=s.lines[id];if(!l.caravan||l.phase!=='loading'||l.stock<1)return;l.cargo=Math.min(capacity(s,id),Math.floor(l.stock));l.stock-=l.cargo;l.phase='outbound';l.remaining=travel(s,id);if(manual)l.manualDispatches++;}
function act(s,action,id,i=0){if(!can(s,action,id,i))return false;if(action==='claimMission')return journey.claimMission(s,api,id);const l=s.lines[id],b=l?.buildings[i],r=s.regions[id];if(action==='finishBuild'){finishBuilding(s,id,b);return true;}if(action==='tokenSkip'){s.extras.tokens--;b.construct=Math.max(0,b.construct-AD_SKIP);if(b.construct<=0)finishBuilding(s,id,b);return true;}
 if(action==='prestige'){prestige(s,id,RULES[i-1]);return true;}
 const x=s.extras;
 if(action==='empire'){empireReset(s);return true;}
 if(action==='challengeDrop'){const speed=ruleOf(s,id).speed||1;delete x.challenge.on[id];for(const k of orders[id]){const l=s.lines[k];if(l.phase==='outbound'||l.phase==='returning')l.remaining*=speed;}return true;}
 if(action==='bookTake'){const b=x.book,o=b.offers[id];b.job={...o,done:0};b.offers=[];return true;}
 if(action==='bookDrop'){x.book.job=null;x.book.offers=[];bookState(s);return true;}
 if(action==='bookClaim'){const b=x.book,j=b.job;b.stamps+=j.stamps;b.jobs++;s.gold+=j.gold;b.job=null;b.offers=[];bookState(s);return true;}
 if(action==='rushStart'){const u=rushRegion(s);x.rush.plays++;x.rush.lost=false;x.rush.run={region:u,step:0,left:rushTime(s,u),time:0,town:null,target:0,done:0,won:false,options:[],goals:{},prize:rushPrize(s)};rushDeal(s,x.rush.run);return true;}
 if(action==='rushPick'){const u=x.rush.run;u.town=id;u.target=u.goals[id];u.done=0;return true;}
 if(action==='rushClaim'){const r=x.rush,time=r.run.time;r.wins++;r.best=r.best?Math.min(r.best,time):time;s.gold+=r.run.prize||rushPrize(s);rushEnd(s,RUSH_COOL);return true;}
 if(action==='seal'){const speed=speedMult(s);x.empire.seals-=sealCost(s,id);x.empire.up[id]=sealLevel(s,id)+1;rescaleTrips(s,speed);return true;}
 if(action==='sealPick'){const speed=speedMult(s),branch=Object.keys(SEAL_PICKS).find(k=>SEAL_PICKS[k].includes(id));x.empire.seals-=x.empire.pick[branch]?REPICK_COST:PICK_COST;x.empire.pick[branch]=id;rescaleTrips(s,speed);return true;}
 if(action==='inn'){s.gold-=INN_COST[x.inn];x.inn++;return true;}
 if(action==='merchant'){s.gold+=merchantReward(s);x.merchants++;return true;}
 if(action==='daily'){s.gold+=dailyReward(s);x.daily.next=(x.daily.next+1)%7;x.daily.last=id;x.dailies++;return true;}
 if(action==='achievement'){s.gold+=achievementReward(s,x.ach[id]);x.ach[id]++;return true;}
 if(action==='boost'){l.boost=BOOST_TIME;l.cool=BOOST_COOL;x.boosts++;return true;}
 if(action==='unlockRegion'){s.gold-=regionCost(id,s);r.open=true;s.lines[orders[id][0]].open=true;if(veteranRun(s))r.worker=true;}
 else if(action==='unlock'){s.gold-=defs[id].unlock;l.open=true;}
 else if(action==='produce')produce(s,id,i,true);else if(action==='dispatch')dispatch(s,id,true);
 else if(action==='sell'){r.remaining=CYCLE;r.manualStarts++;}
 else{s.gold-=cost(s,id,action,i);if(action==='build'){const time=buildTime(s,id,i);if(time>0)b.construct=time;else b.open=true;}if(action==='worker')b.worker=true;if(action==='caravan')l.caravan=true;if(action==='caravanWorker')l.caravanWorker=true;if(action==='production'){b.level++;dressUp(s,id,i);}if(action==='warehouse')l.warehouseLevel=(l.warehouseLevel||1)+1;if(action==='transport')l.caravanLevel++;if(action==='marketWorker')r.worker=true;if(action==='market')r.level++;
  // After a prestige the region's staff come back on their own: no repeat of the manual first run.
  const old=l&&veteran(s,defs[id].region);if(old&&action==='build'&&b.open)b.worker=true;if(old&&action==='caravan')l.caravanWorker=true;}
 return true;
}
// gain: share of sale income that counts (0.5 for offline time past HALF_AFTER). A boosted town's goods sell for x2.
function step(s,dt,gain=1){
 const ad=s.extras.adBoost>0?2:1,before=s.earned;if(s.extras.adBoost>0)s.extras.adBoost=Math.max(0,s.extras.adBoost-dt);rushTick(s,dt);
 for(const id of IDS){const l=s.lines[id];if(!l.open||!s.regions[defs[id].region].open)continue;if(l.boost>0)l.boost=Math.max(0,l.boost-dt);if(l.cool>0)l.cool=Math.max(0,l.cool-dt);
  l.buildings.forEach((b,i)=>{if(b.construct>0){b.construct=Math.max(0,b.construct-dt);if(b.construct<=1e-8)finishBuilding(s,id,b);}if(!b.open)return;if(b.remaining>0){b.remaining=Math.max(0,b.remaining-dt);if(b.remaining<=1e-8){b.remaining=0;l.stock+=Math.min(b.batch,Math.max(0,stockCap(s,id)-l.stock));b.batch=0;b.cycles++;}}if(b.worker&&b.remaining===0)produce(s,id,i,false);});
  if(l.phase==='loading'){if(l.caravanWorker&&l.stock>=capacity(s,id))dispatch(s,id,false);}
  else{l.remaining=Math.max(0,l.remaining-dt);if(l.remaining<=1e-8){l.remaining=0;if(l.phase==='outbound'){l.trips++;s.extras.trips[id]=(s.extras.trips[id]||0)+1;if(defs[id].region==='pass'){l.queue+=l.cargo;l.cargo=0;l.phase='returning';l.remaining=travel(s,id);}else{l.phase='unloading';l.remaining=CYCLE;}}else if(l.phase==='returning')l.phase='loading';else if(l.phase==='unloading'){const n=Math.min(l.cargo,Math.max(0,queueCap(s,defs[id].region)-l.queue));l.queue+=n;l.cargo-=n;if(l.cargo<=1e-8){l.cargo=0;l.phase='returning';l.remaining=travel(s,id);}}}}
 }
 for(const r of ORDER){const m=s.regions[r];if(!m.open)continue;const time=m.worker?dt:Math.min(dt,m.remaining);m.remaining=Math.max(0,m.remaining-dt);const total=orders[r].reduce((n,id)=>n+s.lines[id].queue,0),budget=Math.min(total,rate(s,r)*time),focus=s.extras.rush.run?.town,lead=focus&&orders[r].includes(focus)?Math.min(s.lines[focus].queue,budget):0,restTotal=lead?total-s.lines[focus].queue:total,rest=budget-lead;if(total>0&&budget>0)for(const id of orders[r]){const l=s.lines[id],n=lead&&id===focus?lead:restTotal>0?Math.min(l.queue,rest*l.queue/restTotal):0,g=n*price(s,id)*multiplier(s,r)*gain*(l.boost>0?2:1)*ad;l.queue=Math.max(0,l.queue-n);l.sold+=n;m.sold+=n;s.gold+=g;s.earned+=g;m.earnedSince+=g;if(n>0)credit(s,id,n);}}
 if(dt>0){const x=s.extras;x.rate+=((s.earned-before)/ad/dt-x.rate)*Math.min(1,dt/180);}
}
function advance(s,seconds){let remaining=clamp(seconds,0,offlineLimit(s)),done=0;while(remaining>1e-8){const dt=Math.min(.25,remaining);step(s,dt,done>=halfAfter(s)-1e-9?.5:1);remaining-=dt;done+=dt;}return s;}
function restore(raw,now=Date.now()){
 if(!raw||!(raw.version>=MIN_VERSION&&raw.version<=VERSION)||!raw.lines||!raw.regions)throw Error('Kayıt sürümü veya içeriği desteklenmiyor.');const s=fresh(now);if(typeof raw.saveId==='string'&&raw.saveId)s.saveId=raw.saveId.slice(0,40);s.cloudRev=Math.floor(clamp(raw.cloudRev,0,1e12));const no=raw.cloudDeclined;if(no&&typeof no==='object')s.cloudDeclined={id:typeof no.id==='string'?no.id.slice(0,40):'',rev:Math.floor(clamp(no.rev,0,1e12)),earned:clamp(no.earned,0,BIG)};s.gold=clamp(raw.gold,0,BIG);s.earned=clamp(raw.earned,0,BIG);s.lastAt=clamp(raw.lastAt,0,now);
 const em=raw.extras?.empire,e0=s.extras.empire;if(em&&typeof em==='object'){e0.seals=Math.floor(clamp(em.seals,0,BIG));e0.resets=Math.floor(clamp(em.resets,0,1e9));e0.base=clamp(em.base,0,s.earned);e0.stampsUsed=Math.floor(clamp(em.stampsUsed,0,BIG));for(const [id,u] of Object.entries(SEAL_TREE))if(em.up?.[id])e0.up[id]=Math.floor(clamp(em.up[id],0,u.max));for(const [branch,list] of Object.entries(SEAL_PICKS))if(list.includes(em.pick?.[branch]))e0.pick[branch]=em.pick[branch];}
 for(const id of ORDER){const v=raw.regions[id];if(!v)continue;const r=s.regions[id];r.open=id==='forest'||v.open===true;r.level=level(v.level);r.workerName=person(v.workerName,'female');r.worker=r.open&&v.worker===true;r.remaining=clamp(v.remaining,0,CYCLE);r.manualStarts=Math.floor(clamp(v.manualStarts,0,1e12));r.sold=clamp(v.sold,0,BIG);r.prestige=Math.floor(clamp(v.prestige,0,1e6));r.earnedSince=clamp(v.earnedSince,0,BIG);if(id!=='forest'&&!s.regions[ORDER[ORDER.indexOf(id)-1]].open)r.open=false;}
 for(const id of IDS){const v=raw.lines[id];if(!v)continue;if(!Array.isArray(v.buildings)||v.buildings.length!==3)throw Error('Kasaba kaydı eksik.');const l=s.lines[id];l.open=s.regions[defs[id].region].open&&(id===FIRST||v.open===true);l.caravan=l.open&&v.caravan===true;l.caravanLevel=Math.floor(clamp(v.caravanLevel,1,MAX_CARAVAN_LEVEL));l.warehouseLevel=level(v.warehouseLevel);l.workerNames=[0,1,2].map(i=>person(v.workerNames?.[i],i===1?'female':'male'));l.caravanName=person(v.caravanName,'male');l.caravanWorker=l.caravan&&v.caravanWorker===true;l.manualDispatches=Math.floor(clamp(v.manualDispatches,0,1e12));l.trips=Math.floor(clamp(v.trips,0,1e12));l.sold=clamp(v.sold,0,BIG);l.boost=l.open?clamp(v.boost,0,BOOST_TIME):0;l.cool=l.open?clamp(v.cool,0,BOOST_COOL):0;
  v.buildings.forEach((p,i)=>{if(!p)throw Error('Bina kaydı eksik.');const b=l.buildings[i];b.open=l.open&&p.open===true;b.construct=l.open&&!b.open?clamp(p.construct,0,7200):0;b.level=level(p.level);b.worker=b.open&&p.worker===true;b.remaining=b.open?clamp(p.remaining,0,CYCLE):0;b.batch=b.remaining?clamp(p.batch,0,BIG):0;b.cycles=Math.floor(clamp(p.cycles,0,1e12));b.manualStarts=Math.floor(clamp(p.manualStarts,0,1e12));});
  l.stock=l.open?clamp(v.stock,0,stockCap(s,id)):0;l.queue=l.open?clamp(v.queue,0,defs[id].region==='pass'?BIG:queueCap(s,defs[id].region)):0;l.cargo=l.caravan?clamp(v.cargo,0,capacity(s,id)):0;l.phase=l.caravan&&['loading','outbound','unloading','returning'].includes(v.phase)?v.phase:'loading';l.remaining=l.phase==='loading'?0:clamp(v.remaining,0,l.phase==='unloading'?CYCLE:defs[id].travel);
 }
 if(raw.journey&&journey){s.journey=JSON.parse(JSON.stringify(raw.journey));journey.init(s,true);}
 // Extras (build 42). Saves from before it start with every medal already reached marked as seen, so nothing floods the screen.
 const x=raw.extras&&typeof raw.extras==='object'?raw.extras:null,e=s.extras,d=x?.daily||{};
 // A rush doesn't survive a restart. Jobs and offers are checked, so an edited or old save can't name a missing town.
 const job=o=>o&&typeof o==='object'&&IDS.includes(o.town)&&[1,2].includes(o.stamps)&&num(o.target)>0&&num(o.gold)>=0,bk=x?.book||{},ru=x?.rush||{};e.born=clamp(x?.born,0,now)||now;e.played=clamp(x?.played,0,BIG);e.book.stamps=Math.floor(clamp(bk.stamps,0,1e9));e.book.jobs=Math.floor(clamp(bk.jobs,0,1e9));e.book.offers=(Array.isArray(bk.offers)?bk.offers:[]).filter(job).slice(0,3).map(o=>({town:o.town,stamps:o.stamps,target:o.target,gold:o.gold}));if(job(bk.job))e.book.job={town:bk.job.town,stamps:bk.job.stamps,target:bk.job.target,gold:bk.job.gold,done:clamp(bk.job.done,0,bk.job.target)};e.rush.cool=clamp(ru.cool,0,RUSH_COOL);e.rush.best=clamp(ru.best,0,3600);e.rush.plays=Math.floor(clamp(ru.plays,0,1e9));e.rush.wins=Math.floor(clamp(ru.wins,0,1e9));for(const [r,k] of Object.entries(x?.challenge?.on||{}))if(ORDER.includes(r)&&CHALLENGES[k])e.challenge.on[r]=k;for(const k of Object.keys(x?.challenge?.done||{})){const [r,rule]=k.split(':');if(ORDER.includes(r)&&CHALLENGES[rule])e.challenge.done[k]=1;}e.inn=Math.floor(clamp(x?.inn,0,3));e.daily={next:Math.floor(clamp(d.next,0,6)),last:typeof d.last==='string'?d.last.slice(0,10):''};{const cr=x?.critters||{};e.critters={got:{},last:typeof cr.last==='string'?cr.last.slice(0,10):''};for(const [k,v] of Object.entries(cr.got||{}))if(CRITTER_IDS.includes(k))e.critters.got[k]=typeof v==='string'?v.slice(0,10):'';}
 e.rate=clamp(x?.rate,0,BIG);e.refounds=Math.max(Math.floor(clamp(x?.refounds,0,1e9)),ORDER.reduce((n,r)=>n+s.regions[r].prestige,0));for(const k of ['dailies','boosts','merchants','ads'])e[k]=Math.floor(clamp(x?.[k],0,1e9));e.adBoost=clamp(x?.adBoost,0,AD_BOOST_CAP);e.chestAt=clamp(x?.chestAt,0,now+CHEST_EVERY);for(const k of ['ach','achSeen'])for(const a of ACHIEVEMENTS)e[k][a.id]=Math.floor(clamp(x?.[k]?.[a.id],0,ACH_TIERS));
 if(!x)for(const a of achievements(s))e.achSeen[a.id]=a.reached;
 // Before tokens: everything the player already earned stays instant, and regions already re-founded pay their tokens now.
 if(x?.founded&&typeof x.founded==='object')for(const r of ORDER){if(x.founded[r])e.founded[r]=1;if(x.tokenPaid?.[r])e.tokenPaid[r]=1;}else for(const r of LEGACY_REGIONS)if(e.empire.resets>0||s.regions[r].prestige>0)grantFounding(s,r);
 if(x?.founded)e.tokens=Math.floor(clamp(x.tokens,0,1e6));
 // Keepsakes: saved values, never below what the current towns already show (older saves start from their current trips and levels).
 for(const id of IDS){const n=Math.max(Math.floor(clamp(x?.trips?.[id],0,1e12)),s.lines[id].trips);if(n)e.trips[id]=n;const d=x?.dress?.[id];if(Array.isArray(d))e.dress[id]=[0,1,2].map(i=>Math.floor(clamp(d[i],0,MILESTONES.length)));s.lines[id].buildings.forEach((b,i)=>{if(b.open)dressUp(s,id,i);});}
 return s;
}
// One painted caravan per region (art-v3/caravans/<region>.webp).
// Sea towns (layout 'shore': route distance from the town to the pier tip): a ship as far as the pier, then a cart. Regions without a cart of their own borrow one.
function isShip(id){const d=defs[id];return layouts[d.region].shore?.[d.row]!==undefined;}
function skin(s,id,distance){const d=defs[id];return isShip(id)&&!(distance>layouts[d.region].shore[d.row])?d.region:LAND_SKIN[d.region]||d.region;}
const api={handsFree,idleGap,regionBest,halfAfter,innOpen,secondTownGift,bookSeals,bookSealProgress,runSeals,BOOK_SEAL_CAP,BOOK_SEAL_EACH,rushTime,refreshBook,ACH_TIERS,VET_RANKS,vetRank,toMilestone,CRITTER_IDS,CRITTERS_PER_REGION,nextCritter,critterVisit,statueTier,bestUpgrade,MIN_VERSION,TOKEN_GRANT,BOOK_LEVEL,BOOK_RANKS,RUSH_STEPS,RUSH_TIME,RUSH_COOL,RUSH_FAIL_COOL,bookRank,bookOpen,bookState,rushReady,rushRegion,rushPrize,rushTarget,townHold,CHALLENGE_STAMPS,RULES,challengeOpen,challengeFree,SEAL_TREE,SEAL_PICKS,PICK_NEED,PICK_COST,REPICK_COST,START_GOLD,sealLevel,picked,sealCost,sealGain,branchLevels,empireReady,travel,attachJourney,VERSION,MAX_LEVEL,MAX_CARAVAN_LEVEL,CYCLE,OFFLINE_LIMIT,ORDER,IDS,FIRST,defs,orders,fresh,restore,advance,available,capacity,stockCap,queueCap,rate,batch,milestone,MILESTONES,price,cost,regionCost,requirements,regionRequirements,multiplier,prestigeTarget,prestigeRequirements,can,act,skin,bulk,buyBulk,UPGRADES,offlineLimit,potential,dailyReward,merchantReward,earning,buildTime,adConstruct,BUILD_TIME,FREE_FINISH,AD_SKIP,achievementReward,achievements,innCost,INN_GATE,chestReward,chestReady,adReward,AD_BOOST,AD_BOOST_CAP,CHEST_EVERY,BOOST_TIME,BOOST_COOL,HALF_AFTER};
return api;
});
