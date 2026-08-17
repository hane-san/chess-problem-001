const root = document.documentElement;

let stableWidth = window.innerWidth;
let stableHeight = window.innerHeight;
let orientationTimer = null;

function applyStableViewport(){
  root.style.setProperty('--stable-app-height', `${Math.round(stableHeight)}px`);
}

function captureViewport(force=false){
  const width = window.innerWidth;
  const height = window.innerHeight;
  const widthChanged = Math.abs(width - stableWidth) > 44;

  // iOS changes viewport height when the browser chrome moves. Ignore height-only
  // changes so the board and lower controls do not jump during interaction.
  if(force || widthChanged){
    stableWidth = width;
    stableHeight = height;
    applyStableViewport();
  }
}

captureViewport(true);

window.addEventListener('resize',()=>captureViewport(false),{passive:true});
window.addEventListener('orientationchange',()=>{
  if(orientationTimer) clearTimeout(orientationTimer);
  orientationTimer = setTimeout(()=>captureViewport(true),280);
},{passive:true});
