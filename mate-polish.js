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

function commitPointer(target, sourceEvent){
  bypass = true;
  try{
    const event = new PointerEvent('pointerup',{
      bubbles:true,
      cancelable:true,
      pointerId:sourceEvent.pointerId,
      pointerType:sourceEvent.pointerType || 'touch',
      isPrimary:sourceEvent.isPrimary ?? true,
      button:0,
      buttons:0,
      clientX:sourceEvent.clientX,
      clientY:sourceEvent.clientY,
      screenX:sourceEvent.screenX || 0,
      screenY:sourceEvent.screenY || 0,
      pressure:0
    });
    target.dispatchEvent(event);
  }finally{
    bypass = false;
  }
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
  // Keep the source hidden until the core app commits and rerenders the true board.
  // This avoids a one-frame snap back to the origin square.
  toSquare.classList.remove('capture-impact',`white-${kind}-target`);
}

async function animateCorrectKey({from,to,target,event}){
  animating = true;
  board?.classList.add('white-success-travel','white-key-travel');
  document.body.classList.add('key-settling');

  showCue('WHITE KEY',problem.key.san,'key-turn');
  await animateWhiteMove({from,to,duration:KEY_TRAVEL_MS,kind:'key',capture:false});

  // Commit the already-validated key through the core app.
  commitPointer(target,event);
  await wait(reduceMotion?.matches ? 110 : KEY_BREATH_MS);

  showCue('KEY FOUND',problem.key.san,'key-found');
  showKeyConfirmation();
  window.dispatchEvent(new CustomEvent('cp-key-settled',{
    detail:{keySan:problem.key.san}
  }));

  await wait(reduceMotion?.matches ? 100 : 420);
  document.body.classList.remove('key-settling');
  board?.classList.remove('white-success-travel','white-key-travel');
  setTimeout(hideCue,620);
  animating = false;
}

async function animateCorrectMate({from,to,defense,target,event}){
  animating = true;
  board?.classList.add('white-success-travel','white-mate-travel');
  document.body.classList.add('mate-settling');

  showCue('WHITE MOVE',defense.mateSan,'proof-mate');
  await animateWhiteMove({from,to,duration:MATE_TRAVEL_MS,kind:'mate',capture:true});

  // Commit the already-validated mating move and render the true final position.
  commitPointer(target,event);

  // Hold the completed board for a beat before announcing the result.
  await wait(reduceMotion?.matches ? 120 : MATE_BREATH_MS);
  flashBlackKing();
  showCue('CHECKMATE',defense.mateSan,'checkmate');

  document.body.classList.remove('mate-settling');
  board?.classList.remove('white-success-travel','white-mate-travel');
  window.dispatchEvent(new CustomEvent('cp-mate-settled',{
    detail:{defenseId:defense.id,mateSan:defense.mateSan}
  }));

  setTimeout(hideCue,1050);
  animating = false;
}

board?.addEventListener('pointerup',event=>{
  // interaction-polish emits the synthetic pointer event after a long-press drag.
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
    animateCorrectKey({from,to,target,event});
    return;
  }

  if(phase==='mate'){
    const defense=activeDefense();
    if(!defense || uci!==defense.mate) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    animateCorrectMate({from,to,defense,target,event});
  }
},true);
