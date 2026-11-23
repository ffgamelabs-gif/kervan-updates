// Native services (Android app only; silent no-ops in the browser and on itch.io):
// local notifications for idle caravans and the daily reward, and Firebase Analytics events.
window.createGameServices=function(){
'use strict';
const cap=window.Capacitor,native=!!cap?.isNativePlatform?.(),P=cap?.Plugins||{},LN=native?P.LocalNotifications:null,FA=native?P.FirebaseAnalytics:null,PLAY=native?P.KervanPlay:null,CLOUD=native?P.KervanCloud:null;
// Inexact alarms: a reminder a few minutes late is fine, and it needs no 'exact alarm' permission screen.
const IDS=[{id:1},{id:2},{id:3},{id:4}],ICON={smallIcon:'ic_stat_kervan',iconColor:'#E2BD63',isExactNotification:false};
// Analytics: event names [a-z_], params kept small; failures never reach the game.
// web_rev names the web code a player runs (store build + update patch), so numbers can be split by patch. Raise it with every patch or build.
const WEB_REV='71.5';
function track(name,params={}){if(!FA)return;try{FA.logEvent({name,params:{...params,web_rev:WEB_REV}}).catch(()=>{});}catch{}}
// Asks once (Android 13+ shows the system dialog); returns whether notifications are allowed.
async function askNotifications(){if(!LN)return false;try{let p=await LN.checkPermissions();if(p.display==='prompt'||p.display==='prompt-with-rationale')p=await LN.requestPermissions();track('notifications_permission',{result:p.display});return p.display==='granted';}catch{return false;}}
// On leaving the app: one note when offline earnings stop (the inn's limit), one evening reminder for the daily reward.
// Leaving and returning run strictly one after another (queue), and gen counts them: a schedule for a leave that is already over
// does nothing, so it can neither fire while playing nor wipe a newer leave's reminders (Codex sweep 039).
let gen=0,queue=Promise.resolve();
function scheduleAway(o){if(!LN)return Promise.resolve();const my=++gen;queue=queue.then(()=>scheduleNow(o,my)).catch(()=>{});return queue;}
async function scheduleNow({capSeconds,capTitle,capText,dailyTitle,dailyText,automated,dailyDone,build,next},my){if(my!==gen)return;try{const p=await LN.checkPermissions();if(my!==gen||p.display!=='granted')return;await LN.cancel({notifications:IDS}).catch(()=>{});if(my!==gen)return;
 const list=[];if(automated)list.push({id:1,title:capTitle,body:capText,schedule:{at:new Date(Date.now()+capSeconds*1000),allowWhileIdle:true},...ICON});
 // Past the offline limit the game stops counting, so a building that needs longer isn't ready when that time comes.
 // A concrete next step ("Taşyürek is ready to open"), at the moment the gold for it should be there.
 if(next&&next.seconds<=capSeconds)list.push({id:4,title:next.title,body:next.text,schedule:{at:new Date(Date.now()+next.seconds*1000),allowWhileIdle:true},...ICON});
 if(build&&build.seconds<=capSeconds)list.push({id:3,title:build.title,body:build.text,schedule:{at:new Date(Date.now()+build.seconds*1000),allowWhileIdle:true},...ICON});
 const at=new Date();at.setHours(19,0,0,0);if(dailyDone)at.setDate(at.getDate()+1);while(at-Date.now()<3*3600e3)at.setDate(at.getDate()+1);list.push({id:2,title:dailyTitle,body:dailyText,schedule:{at,allowWhileIdle:true},...ICON});
 if(my!==gen)return;await LN.schedule({notifications:list});}catch{}}
// Back in the app: nothing pending should fire while playing.
function cancelAway(){if(!LN)return;gen++;queue=queue.then(async()=>{try{await LN.cancel({notifications:IDS}).catch(()=>{});await LN.removeAllDeliveredNotifications?.().catch(()=>{});}catch{}});}
// Google Play rating box and in-app update (Play-installed copies only; quiet elsewhere).
function review(){if(!PLAY)return;try{PLAY.requestReview().then(r=>track('review_prompt',{result:r?.result||''})).catch(()=>{});}catch{}}
function checkUpdate(){if(!PLAY)return;try{PLAY.checkForUpdate().then(r=>{if(r?.result==='started')track('update_prompt');}).catch(()=>{});}catch{}}
// Cloud save (Play Games Saved Games). Every call resolves; null means unavailable.
const safe=p=>p.then(r=>r?.ok?r:null).catch(()=>null);
const cloud={status:()=>CLOUD?safe(CLOUD.status()):Promise.resolve(null),signIn:()=>CLOUD?safe(CLOUD.signIn()):Promise.resolve(null),load:()=>CLOUD?safe(CLOUD.load()):Promise.resolve(null),save:(data,description)=>CLOUD?safe(CLOUD.save({data,description})):Promise.resolve(null)};
// What a cloud read means for this device. read is null when the read failed, and data is null when the cloud slot is empty.
// A failed read or unreadable data never allows an upload. Every upload bumps cloudRev, so a higher number means another device wrote since.
function cloudVerdict(local,read,version,minVersion=version){
 if(!read)return {action:'wait',reason:'read_failed'};
 if(!read.data)return {action:'upload'};
 let raw;try{raw=JSON.parse(read.data);}catch{return {action:'wait',reason:'invalid'};}
 if(!raw||typeof raw!=='object'||!Number.isFinite(raw.version)||!raw.lines||!raw.regions||!raw.regions.forest||!raw.lines[window.GameEngine?.FIRST||'y'])return {action:'wait',reason:'invalid'};
 if(raw.version>version)return {action:'wait',reason:'newer_version'};
 // The same check as loading a save on the device: a damaged cloud copy is never offered or adopted.
 if(raw.version>=minVersion&&window.GameEngine?.restore){try{window.GameEngine.restore(raw);}catch{return {action:'wait',reason:'invalid'};}}
 if(raw.version<minVersion)return {action:'upload'}; // Older test saves don't load, by design. Any version from minVersion up still loads, so it is compared below and never overwritten unseen.
 // A cloud copy the player already turned down is not offered again until another device writes a newer one.
 const no=local.cloudDeclined;if(no&&(raw.saveId||'')===no.id&&(Number(raw.cloudRev)||0)<=no.rev&&(no.id||(Number(raw.earned)||0)===no.earned))return {action:'upload'};
 if(raw.saveId===local.saveId)return (Number(raw.cloudRev)||0)>(local.cloudRev||0)?{action:'offer',raw}:{action:'upload'};
 if(raw.saveId)return {action:'offer',raw};
 // Written before saves had an id: compare resets first, since a reset keeps lifetime earnings.
 const resets=x=>Number(x.extras?.empire?.resets)||0,ahead=resets(raw)>resets(local)||(resets(raw)===resets(local)&&(Number(raw.earned)||0)>local.earned+1);
 return ahead?{action:'offer',raw}:{action:'upload'};
}
// Reads before every upload, stops while a read fails or a choice is open, and backs up whichever copy the player gives up.
function cloudSync(o){
 const EVERY=300000;let ready=false,busy=false,waiting=false,deciding=false,last=0;
 // The device keeps its new revision only once the cloud confirms the upload. A failed upload leaves cloudRev as it was, so if another
 // device writes meanwhile, its higher number makes the next read offer a choice instead of overwriting it (Codex sweep 039, 2026-11-19).
 const write=async()=>{const s=o.state(),rev=(s.cloudRev||0)+1,ok=await cloud.save(JSON.stringify({...s,cloudRev:rev,lastAt:Date.now()}),o.describe());if(ok&&o.state()===s){s.cloudRev=Math.max(s.cloudRev||0,rev);o.saveLocal();}return ok;};/* only the game that was uploaded records it */
 function decided(raw,use){deciding=false;ready=true;last=Date.now();o.backup(use?'device':'cloud',use?JSON.stringify(o.state()):JSON.stringify(raw));
  if(use){o.adopt(raw);return;}const s=o.state();s.cloudDeclined={id:typeof raw.saveId==='string'?raw.saveId.slice(0,40):'',rev:Number(raw.cloudRev)||0,earned:Number(raw.earned)||0};o.saveLocal();s.cloudRev=Math.max(s.cloudRev||0,Number(raw.cloudRev)||0);if(o.canUpload()&&!busy){busy=true;write().finally(()=>{busy=false;});}}
 function hold(v){ready=false;if(v.action==='offer'){deciding=true;o.offer(v.raw,use=>decided(v.raw,use));}else{waiting=true;track('cloud_hold',{reason:v.reason});}}
 async function start(){if(busy||deciding)return;busy=true;try{const st=await cloud.status();o.signedIn(!!st?.signedIn);if(!st?.signedIn)return;last=Date.now();waiting=false;const v=cloudVerdict(o.state(),await cloud.load(),o.version,o.minVersion);if(v.action!=='upload')hold(v);else{ready=true;if(o.canUpload())await write();}}finally{busy=false;}}
 async function upload(force=false){const now=Date.now();if(!ready){if(waiting&&!busy&&!deciding&&now-last>=EVERY)await start();return;}if(busy||!o.canUpload()||(!force&&now-last<EVERY))return;last=now;busy=true;try{const v=cloudVerdict(o.state(),await cloud.load(),o.version,o.minVersion);if(v.action==='upload')await write();else hold(v);}finally{busy=false;}}
 return {start,upload};
}
// Rewarded ads (Android app only). init() gathers consent once (UMP shows its form only where the law requires it);
// show() resolves true only when the SDK reports the reward as earned. Elsewhere ads are simply unavailable.
// ?fakeads=1 (browser QA only): every ad "plays" for half a second and pays.
const FAKE={init:()=>Promise.resolve({canRequestAds:true,privacyRequired:true}),show:()=>new Promise(r=>setTimeout(()=>r({earned:true,reason:'fake'}),500)),privacyOptions:()=>Promise.resolve({canRequestAds:true,privacyRequired:true})};
const ADS=native?P.KervanAds:new URLSearchParams(location.search).has('fakeads')?FAKE:null;let adState={canRequestAds:false,privacyRequired:false};
const ads={get available(){return !!ADS&&adState.canRequestAds;},get privacyRequired(){return !!ADS&&adState.privacyRequired;},
 init:()=>ADS?ADS.init().then(r=>{adState=r||adState;track('ads_consent',{can:String(!!adState.canRequestAds)});return adState;}).catch(()=>adState):Promise.resolve(adState),
 show:placement=>{if(!ADS)return Promise.resolve(false);track('ad_offer_accept',{placement});return ADS.show({placement}).then(r=>{track(r?.earned?'ad_reward':'ad_no_reward',{placement,reason:r?.reason||''});return !!r?.earned;}).catch(()=>false);},
 privacy:()=>ADS?ADS.privacyOptions().then(r=>{adState=r||adState;return adState;}).catch(()=>adState):Promise.resolve(adState)};
return {native,track,askNotifications,scheduleAway,cancelAway,review,checkUpdate,cloud,cloudVerdict,cloudSync,ads};
};
