import { problems } from './data/problems.js';

const problem = problems[0];
const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const defenseGrid = document.querySelector('#defenseGrid');
const feedback = document.querySelector('#feedback');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const DEFENCE_TRAVEL_MS = 470;
const DEFENCE_HOLD_MS = 300;

let replayingDefenseClick = false;
let animatingDefense = false;
let arrivalTimer = null;
let cueTimer = null;

const turnCue = document.createElement('div');
turnCue.className = 'turn-cue';
turnCue.setAttribute('aria-live','polite');
boardWrap?.append(turnCue);

function squareEl(square){
  return board?.querySelector(`[data-square="${square}"]`);
}

function setFeedback(title,text){
  if(!feedback) return;
  const strong=feedback.querySelector('strong');
  const span=feedback.querySelector('span');
  if(strong) strong.textContent=title;
  if(span) span.textContent=text;
  feedback.className='feedback neutral';
  const icon=feedback.querySelector('.feedback-icon');
  if(icon) icon.textContent='→';
}

function showTurnCue(kicker,title,kind='defence',duration=0){
  if(!turnCue) return;
  if(cueTimer){clearTimeout(cueTimer);cueTimer=null;}
  turnCue.className=`turn-cue ${kind}`;
  turnCue.innerHTML=`<small>${kicker}</small><strong>${title}</strong>`;
  requestAnimationFrame(()=>turnCue.classList.add('is-visible'));
  if(duration){
    cueTimer=setTimeout(()=>turnCue.classList.remove('is-visible'),duration);
  }
}

function hideTurnCue(){
  if(cueTimer){clearTimeout(cueTimer);cueTimer=null;}
  turnCue?.classList.remove('is-visible');
}

function flashArrival(square){
  const target = squareEl(square);
  if(!target) return;
  target.classList.remove('defense-arrival');
  void target.offsetWidth;
  target.classList.add('defense-arrival');
  if(arrivalTimer) clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(()=>target.classList.remove('defense-arrival'), 820);
}

function commitDefense(button,to){
  replayingDefenseClick = true;
  button.click();
  replayingDefenseClick = false;
  animatingDefense = false;
  defenseGrid?.classList.remove('is-previewing');

  requestAnimationFrame(()=>{
    flashArrival(to);
    showTurnCue('WHITE TO MOVE','Mateを探す','white-turn',1050);
  });
}

function playDefenseMove(defense, button){
  const from = defense.black.slice(0,2);
  const to = defense.black.slice(2,4);
  const fromSquare = squareEl(from);
  const toSquare = squareEl(to);
  const piece = fromSquare?.querySelector('.piece');
  const capturedPiece = toSquare?.querySelector('.piece');

  animatingDefense = true;
  defenseGrid?.classList.add('is-previewing');
  button.classList.add('defense-preview');
  setFeedback(`黒の防御 ${defense.blackSan}`, 'まず黒がどう動くかを確認します。白の応手はそのあとです。');
  showTurnCue('BLACK DEFENCE',defense.blackSan,'defence');

  if(!board || !fromSquare || !toSquare || !piece || reduceMotion?.matches){
    window.setTimeout(()=>commitDefense(button,to), reduceMotion?.matches ? 180 : 0);
    return;
  }

  const boardRect = board.getBoundingClientRect();
  const fromRect = fromSquare.getBoundingClientRect();
  const toRect = toSquare.getBoundingClientRect();
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;

  const flyer = document.createElement('div');
  flyer.className = 'defense-flyer';
  flyer.style.left = `${fromRect.left - boardRect.left}px`;
  flyer.style.top = `${fromRect.top - boardRect.top}px`;
  flyer.style.width = `${fromRect.width}px`;
  flyer.style.height = `${fromRect.height}px`;

  const clone = piece.cloneNode(true);
  flyer.append(clone);
  board.append(flyer);
  piece.classList.add('defense-source-hidden');
  toSquare.classList.add('defense-preview-target');

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      flyer.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });
  });

  if(capturedPiece){
    window.setTimeout(()=>{
      capturedPiece.classList.add('capture-breaking');
      toSquare.classList.add('capture-impact');
    }, Math.max(170,DEFENCE_TRAVEL_MS-170));
  }

  window.setTimeout(()=>{
    toSquare.classList.add('defense-landed');
    flashArrival(to);
  },DEFENCE_TRAVEL_MS);

  window.setTimeout(()=>{
    flyer.remove();
    piece.classList.remove('defense-source-hidden');
    capturedPiece?.classList.remove('capture-breaking');
    toSquare.classList.remove('defense-preview-target','defense-landed','capture-impact');
    button.classList.remove('defense-preview');
    hideTurnCue();
    commitDefense(button,to);
  },DEFENCE_TRAVEL_MS+DEFENCE_HOLD_MS);
}

if(defenseGrid){
  defenseGrid.addEventListener('click', event=>{
    const button = event.target.closest('.defense-chip');
    if(!button || !defenseGrid.contains(button) || replayingDefenseClick) return;
    if(button.disabled || animatingDefense) return;

    const buttons = [...defenseGrid.querySelectorAll('.defense-chip')];
    const index = buttons.indexOf(button);
    const defense = problem.defenses[index];
    if(!defense) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    playDefenseMove(defense, button);
  }, true);
}
