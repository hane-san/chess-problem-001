import { problems } from './data/problems.js';

const problem = problems[0];
const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const defenseGrid = document.querySelector('#defenseGrid');
const turnCue = document.querySelector('.turn-cue');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const KEY_TRAVEL_MS = 520;
const KEY_BREATH_MS = 300;
const MATE_TRAVEL_MS = 560;
const MATE_BREATH_MS = 360;
const KEY_CONFIRM_MS = 920;

let bypass = false;
let animating = false;
let confirmationTimer = null;

const keyConfirmation = document.createElement('div');
keyConfirmation.className = 'key-confirmation';
keyConfirmation.setAttribute('aria-live','polite');
boardWrap?.append(keyConfirmation);

function activeDefense(){
  const buttons = [...(defenseGrid?.querySelectorAll('.defense-chip') || [])];
  const active = buttons.find(button=>button.classList.contains('active'));
  if(!active) return null;
  const index = buttons.indexOf(active);
  return index >= 0 ? problem.defenses[index] : null;
}

function squareEl(square){
  return board?.querySelector(`[data-square="${square}"]`);
}

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function showCue(kicker,title,kind='proof-mate'){
  if(!turnCue) return;
  turnCue.className=`turn-cue ${kind} is-visible`;
  turnCue.innerHTML=`<small>${kicker}</small><strong>${title}</strong>`;
}

function hideCue(){
  turnCue?.classList.remove('is-visible');
}

function showKeyConfirmation(){
  if(!keyConfirmation) return;
  if(confirmationTimer) clearTimeout(confirmationTimer);
  keyConfirmation.innerHTML=`<strong>KEY FOUND <b>✓</b></strong><span>${problem.key.san} · ここから黒の防御変化を検証</span>`;
  keyConfirmation.classList.add('is-visible');
  confirmationTimer=setTimeout(()=>keyConfirmation.classList.remove('is-visible'),KEY_CONFIRM_MS);
}

function flashBlackKing(){
  const king=[...board.querySelectorAll('.piece.black')]
    .find(piece=>piece.textContent.trim()==='♚')?.closest('.square');
  if(!king) return;
  king.classList.remove('mate-impact');
  void king.offsetWidth;
  king.classList.add('mate-impact');
  setTimeout(()=>king.classList.remove('mate-impact'),1150);
}

function dispatchCorePointer(type,target,pointerId,pointerType,clientX,clientY){
  const event=new PointerEvent(type,{
    bubbles:true,
    cancelable:true,
    pointerId,
    pointerType:pointerType || 'touch',
    isPrimary:true,
    button:0,
    buttons:type==='pointerup'?0:1,
    clientX,
    clientY,
    pressure:type==='pointerup'?0:.5
  });
  target.dispatchEvent(event);
}

function clearSuccessTravelClasses(){
  board?.classList.remove('white-success-travel','white-key-travel','white-mate-travel');
}

function restoreHiddenPieces(){
  board?.querySelectorAll('.defense-source-hidden,.capture-breaking').forEach(piece=>{
    piece.classList.remove('defense-source-hidden','capture-breaking');
  });
  board?.querySelectorAll('.white-key-target,.white-mate-target,.capture-impact').forEach(square=>{
    square.classList.remove('white-key-target','white-mate-target','capture-impact');
  });
  board?.querySelectorAll('.white-success-flyer').forEach(flyer=>flyer.remove());
}

function commitMove(from,to,sourceEvent){
  const source=squareEl(from);
  const target=squareEl(to);
  if(!source||!target) return false;

  // The core board resolves the release square with elementFromPoint().
  // Keep the board hit-testable while replaying the synthetic commit; the long-press
  // wrapper still blocks real user input because key-settling/mate-settling is active.
  clearSuccessTravelClasses();

  const a=source.getBoundingClientRect();
  const b=target.getBoundingClientRect();
  const pointerId=sourceEvent.pointerId || 1;
  const pointerType=sourceEvent.pointerType || 'touch';
  const beforePhase=document.body.dataset.phase;

  bypass=true;
  document.body.classList.add('programmatic-commit');
  try{
    dispatchCorePointer('pointerdown',source,pointerId,pointerType,a.left+a.width/2,a.top+a.height/2);
    dispatchCorePointer('pointermove',target,pointerId,pointerType,b.left+b.width/2,b.top+b.height/2);
    dispatchCorePointer('pointerup',target,pointerId,pointerType,b.left+b.width/2,b.top+b.height/2);
  }finally{
    document.body.classList.remove('programmatic-commit');
    bypass=false;
  }

  // Both successful Key and successful mating move enter the defence-selection phase.
  const committed=beforePhase!== 'defenses' && document.body.dataset.phase==='defenses';
  if(!committed){
    console.error('[MATE/TWO] visual move finished but the core move did not commit', {from,to,beforePhase,afterPhase:document.body.dataset.phase});
    restoreHiddenPieces();
  }
  return committed;
}

async function animateWhiteMove({from,to,duration,kind,capture=true}){
  const fromSquare=squareEl(from);
  const toSquare=squareEl(to);
  const piece=fromSquare?.querySelector('.piece');
  const capturedPiece=capture ? toSquare?.querySelector('.piece') : null;

  if(!board || !fromSquare || !toSquare || !piece || reduceMotion?.matches){
    await wait(reduceMotion?.matches ? 90 : 35);
    return;
  }

  const boardRect=board.getBoundingClientRect();
  const a=fromSquare.getBoundingClientRect();
  const b=toSquare.getBoundingClientRect();
  const flyer=document.createElement('div');
  flyer.className=`defense-flyer replay-flyer white-success-flyer white-${kind}-flyer`;
  flyer.style.left=`${a.left-boardRect.left}px`;
  flyer.style.top=`${a.top-boardRect.top}px`;
  flyer.style.width=`${a.width}px`;
  flyer.style.height=`${a.height}px`;
  flyer.style.transitionDuration=`${duration}ms`;
  flyer.append(piece.cloneNode(true));
  board.append(flyer);

  piece.classList.add('defense-source-hidden');
  toSquare.classList.add(`white-${kind}-target`);

  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    flyer.style.transform=`translate3d(${b.left-a.left}px,${b.top-a.top}px,0)`;
  }));

  if(capturedPiece){
    setTimeout(()=>{
      capturedPiece.classList.add('capture-breaking');
      toSquare.classList.add('capture-impact');
    },Math.max(180,duration-220));
  }

  await wait(duration);
  flyer.remove();
  capturedPiece?.classList.remove('capture-breaking');
  toSquare.classList.remove('capture-impact',`white-${kind}-target`);
  // The source remains hidden only until commitMove() synchronously rerenders the true board.
}

async function animateCorrectKey({from,to,event}){
  animating = true;
  board?.classList.add('white-success-travel','white-key-travel');
  document.body.classList.add('key-settling');

  showCue('WHITE KEY',problem.key.san,'key-turn');
  await animateWhiteMove({from,to,duration:KEY_TRAVEL_MS,kind:'key',capture:false});
  const committed=commitMove(from,to,event);

  if(!committed){
    restoreHiddenPieces();
    document.body.classList.remove('key-settling');
    clearSuccessTravelClasses();
    hideCue();
    animating=false;
    return;
  }

  await wait(reduceMotion?.matches ? 110 : KEY_BREATH_MS);
  showCue('KEY FOUND',problem.key.san,'key-found');
  showKeyConfirmation();
  window.dispatchEvent(new CustomEvent('cp-key-settled',{
    detail:{keySan:problem.key.san}
  }));

  await wait(reduceMotion?.matches ? 100 : 420);
  document.body.classList.remove('key-settling');
  clearSuccessTravelClasses();
  setTimeout(hideCue,620);
  animating = false;
}

async function animateCorrectMate({from,to,defense,event}){
  animating = true;
  board?.classList.add('white-success-travel','white-mate-travel');
  document.body.classList.add('mate-settling');

  showCue('WHITE MOVE',defense.mateSan,'proof-mate');
  await animateWhiteMove({from,to,duration:MATE_TRAVEL_MS,kind:'mate',capture:true});
  const committed=commitMove(from,to,event);

  if(!committed){
    restoreHiddenPieces();
    document.body.classList.remove('mate-settling');
    clearSuccessTravelClasses();
    hideCue();
    animating=false;
    return;
  }

  await wait(reduceMotion?.matches ? 120 : MATE_BREATH_MS);
  flashBlackKing();
  showCue('CHECKMATE',defense.mateSan,'checkmate');

  document.body.classList.remove('mate-settling');
  clearSuccessTravelClasses();
  window.dispatchEvent(new CustomEvent('cp-mate-settled',{
    detail:{defenseId:defense.id,mateSan:defense.mateSan}
  }));

  setTimeout(hideCue,1050);
  animating = false;
}

board?.addEventListener('pointerup',event=>{
  if(bypass || animating || event.isTrusted) return;

  const phase=document.body.dataset.phase;
  if(phase!=='key' && phase!=='mate') return;

  const source=board.querySelector('.square.selected');
  const target=event.target.closest?.('.square');
  if(!source || !target || !board.contains(target)) return;

  const from=source.dataset.square;
  const to=target.dataset.square;
  const uci=from+to;

  if(phase==='key' && uci===problem.key.uci){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    animateCorrectKey({from,to,event});
    return;
  }

  if(phase==='mate'){
    const defense=activeDefense();
    if(!defense || uci!==defense.mate) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    animateCorrectMate({from,to,defense,event});
  }
},true);
