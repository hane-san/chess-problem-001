import { problems } from './data/problems.js';

const problem = problems[0];
const board = document.querySelector('#board');
const defenseGrid = document.querySelector('#defenseGrid');
const turnCue = document.querySelector('.turn-cue');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const MATE_TRAVEL_MS = 560;
const MATE_BREATH_MS = 360;

let bypass = false;
let animating = false;

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

function flashBlackKing(){
  const king=[...board.querySelectorAll('.piece.black')]
    .find(piece=>piece.textContent.trim()==='♚')?.closest('.square');
  if(!king) return;
  king.classList.remove('mate-impact');
  void king.offsetWidth;
  king.classList.add('mate-impact');
  setTimeout(()=>king.classList.remove('mate-impact'),1050);
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

async function animateCorrectMate({from,to,defense,target,event}){
  animating = true;
  board?.classList.add('white-mate-travel');
  document.body.classList.add('mate-settling');

  const fromSquare=squareEl(from);
  const toSquare=squareEl(to);
  const piece=fromSquare?.querySelector('.piece');
  const capturedPiece=toSquare?.querySelector('.piece');

  showCue('WHITE MOVE',defense.mateSan,'proof-mate');

  if(!board || !fromSquare || !toSquare || !piece || reduceMotion?.matches){
    await wait(reduceMotion?.matches ? 100 : 40);
  }else{
    const boardRect=board.getBoundingClientRect();
    const a=fromSquare.getBoundingClientRect();
    const b=toSquare.getBoundingClientRect();
    const flyer=document.createElement('div');
    flyer.className='defense-flyer replay-flyer white-mate-flyer';
    flyer.style.left=`${a.left-boardRect.left}px`;
    flyer.style.top=`${a.top-boardRect.top}px`;
    flyer.style.width=`${a.width}px`;
    flyer.style.height=`${a.height}px`;
    flyer.style.transitionDuration=`${MATE_TRAVEL_MS}ms`;
    flyer.append(piece.cloneNode(true));
    board.append(flyer);

    piece.classList.add('defense-source-hidden');
    toSquare.classList.add('white-mate-target');

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      flyer.style.transform=`translate3d(${b.left-a.left}px,${b.top-a.top}px,0)`;
    }));

    if(capturedPiece){
      setTimeout(()=>{
        capturedPiece.classList.add('capture-breaking');
        toSquare.classList.add('capture-impact');
      },Math.max(180,MATE_TRAVEL_MS-220));
    }

    await wait(MATE_TRAVEL_MS);
    flyer.remove();
    piece.classList.remove('defense-source-hidden');
    capturedPiece?.classList.remove('capture-breaking');
    toSquare.classList.remove('capture-impact','white-mate-target');
  }

  // Let the core app commit the already-validated move and render the true final position.
  commitPointer(target,event);

  // Hold the finished board for one beat before naming the result.
  await wait(reduceMotion?.matches ? 120 : MATE_BREATH_MS);
  flashBlackKing();
  showCue('CHECKMATE',defense.mateSan,'proof-mate');

  document.body.classList.remove('mate-settling');
  board?.classList.remove('white-mate-travel');
  window.dispatchEvent(new CustomEvent('cp-mate-settled',{
    detail:{defenseId:defense.id,mateSan:defense.mateSan}
  }));

  setTimeout(hideCue,1050);
  animating = false;
}

board?.addEventListener('pointerup',event=>{
  if(bypass || animating || event.isTrusted) return;
  if(document.body.dataset.phase!=='mate') return;

  const defense=activeDefense();
  if(!defense) return;

  const source=board.querySelector('.square.selected');
  const target=event.target.closest?.('.square');
  if(!source || !target || !board.contains(target)) return;

  const from=source.dataset.square;
  const to=target.dataset.square;
  if(from+to!==defense.mate) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  animateCorrectMate({from,to,defense,target,event});
},true);
