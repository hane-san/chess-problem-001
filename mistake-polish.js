const board = document.querySelector('#board');
const feedback = document.querySelector('#feedback');
const arrow = document.querySelector('#refutationArrow');
const turnCue = document.querySelector('.turn-cue');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const PIECE_CLASS = {
  '♔':'k','♚':'k','♕':'q','♛':'q','♖':'r','♜':'r',
  '♗':'b','♝':'b','♘':'n','♞':'n','♙':'p','♟':'p'
};

let stableSnapshot = null;
let mistakeBase = null;
let attemptSnapshot = null;
let latestSnapshot = null;
let rewindTimer = null;
let rewinding = false;
let mistakeActive = false;

function snapshot(){
  const map={};
  board?.querySelectorAll('.square').forEach(square=>{
    const piece=square.querySelector('.piece');
    if(piece) map[square.dataset.square]=piece.textContent.trim();
  });
  return map;
}

function cloneMap(map){ return map ? {...map} : null; }
function sameMap(a,b){
  if(!a||!b) return false;
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for(const key of keys) if(a[key]!==b[key]) return false;
  return true;
}

function createPiece(glyph){
  const el=document.createElement('div');
  const type=PIECE_CLASS[glyph];
  const white='♔♕♖♗♘♙'.includes(glyph);
  el.className=`piece piece-${type} ${white?'white':'black'}`;
  el.textContent=glyph;
  return el;
}

function paint(map){
  if(!map||!board) return;
  board.querySelectorAll('.square').forEach(square=>{
    square.querySelectorAll('.piece').forEach(piece=>piece.remove());
    square.classList.remove('last','selected','legal','capture-target','hover-target','refutation-piece','refutation-target','answer-piece','answer-target','king-square');
    const glyph=map[square.dataset.square];
    if(glyph){
      square.append(createPiece(glyph));
      if(glyph==='♔'||glyph==='♚') square.classList.add('king-square');
    }
  });
}

function inferMove(before,after){
  if(!before||!after) return null;
  const removed=Object.keys(before).filter(square=>before[square]!==after[square]);
  const changed=Object.keys(after).filter(square=>before[square]!==after[square]);
  for(const from of removed){
    const glyph=before[from];
    for(const to of changed){
      if(from!==to && after[to]===glyph) return {from,to,glyph};
    }
  }
  return null;
}

function squareEl(square){ return board?.querySelector(`[data-square="${square}"]`); }
function wait(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

function cue(title){
  if(!turnCue) return;
  turnCue.className='turn-cue rewind is-visible';
  turnCue.innerHTML=`<small>REWIND</small><strong>${title}</strong>`;
}
function hideCue(){ turnCue?.classList.remove('is-visible'); }

async function reverseMove(forward,beforeMap,duration){
  if(!forward){ paint(beforeMap); return; }
  const from=forward.to;
  const to=forward.from;
  const fromSquare=squareEl(from);
  const toSquare=squareEl(to);
  const piece=fromSquare?.querySelector('.piece');
  if(!piece || reduceMotion?.matches){
    await wait(reduceMotion?.matches?80:40);
    paint(beforeMap);
    return;
  }

  const boardRect=board.getBoundingClientRect();
  const a=fromSquare.getBoundingClientRect();
  const b=toSquare.getBoundingClientRect();
  const flyer=document.createElement('div');
  flyer.className='defense-flyer replay-flyer replay-rewind-flyer mistake-rewind-flyer';
  flyer.style.left=`${a.left-boardRect.left}px`;
  flyer.style.top=`${a.top-boardRect.top}px`;
  flyer.style.width=`${a.width}px`;
  flyer.style.height=`${a.height}px`;
  flyer.style.transitionDuration=`${duration}ms`;
  flyer.append(piece.cloneNode(true));
  board.append(flyer);
  piece.style.opacity='0';
  const dx=b.left-a.left;
  const dy=b.top-a.top;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    flyer.style.transform=`translate3d(${dx}px,${dy}px,0)`;
  }));
  await wait(duration);
  flyer.remove();
  paint(beforeMap);
}

async function runRewind(){
  if(!mistakeActive||rewinding||!mistakeBase||!attemptSnapshot) return;
  rewinding=true;
  board?.classList.add('mistake-rewind');
  arrow?.classList.remove('is-visible','answer-mode');

  const current=cloneMap(latestSnapshot)||snapshot();
  const replyMove=!sameMap(current,attemptSnapshot)?inferMove(attemptSnapshot,current):null;
  const attemptMove=inferMove(mistakeBase,attemptSnapshot);

  if(replyMove){
    cue('相手の反証手を戻す');
    await reverseMove(replyMove,attemptSnapshot,260);
    await wait(90);
  }else{
    paint(attemptSnapshot);
  }

  cue('この仮説を戻す');
  await reverseMove(attemptMove,mistakeBase,300);
  await wait(120);
  hideCue();
  board?.classList.remove('mistake-rewind');
  rewinding=false;
}

function beginMistake(){
  if(mistakeActive) return;
  mistakeActive=true;
  mistakeBase=cloneMap(stableSnapshot)||snapshot();
  attemptSnapshot=snapshot();
  latestSnapshot=cloneMap(attemptSnapshot);
  if(rewindTimer) clearTimeout(rewindTimer);
  rewindTimer=setTimeout(runRewind,1450);
}

function endMistake(){
  if(rewindTimer){ clearTimeout(rewindTimer); rewindTimer=null; }
  mistakeActive=false;
  rewinding=false;
  mistakeBase=null;
  attemptSnapshot=null;
  latestSnapshot=null;
  hideCue();
  board?.classList.remove('mistake-rewind');
  stableSnapshot=snapshot();
}

const boardObserver=new MutationObserver(()=>{
  const bad=feedback?.classList.contains('bad');
  if(rewinding) return;
  if(bad){
    latestSnapshot=snapshot();
    if(!mistakeActive) beginMistake();
  }else if(!board?.classList.contains('variation-replay')&&!board?.classList.contains('proof-sweep')){
    stableSnapshot=snapshot();
  }
});
if(board) boardObserver.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

const feedbackObserver=new MutationObserver(()=>{
  const bad=feedback?.classList.contains('bad');
  if(bad) beginMistake();
  else if(mistakeActive && !rewinding) endMistake();
});
if(feedback) feedbackObserver.observe(feedback,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});

stableSnapshot=snapshot();
