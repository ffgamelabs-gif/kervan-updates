// The global menu close button follows short as well as tall parchment sheets.
// This observes presentation only and never reads or changes player saves.
(()=>{
 const panels=[...document.querySelectorAll('.tab-panel:not([data-tab="map"])')];
 const sync=()=>{
  const active=panels.find(el=>el.classList.contains('active')&&el.getBoundingClientRect().height>0);
  if(!active)return;
  const height=Math.round(active.getBoundingClientRect().height);
  const root=document.documentElement,value=height+'px';
  if(root.style.getPropertyValue('--parchment-visible-height')!==value)root.style.setProperty('--parchment-visible-height',value);
 };
 if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(sync);panels.forEach(el=>observer.observe(el));}
 const changes=new MutationObserver(sync);panels.forEach(el=>changes.observe(el,{attributes:true,attributeFilter:['class','hidden']}));
 window.addEventListener('resize',sync);sync();
})();
