import { problems } from './data/problems.js';

const problem = problems[0];
const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const defenseGrid = document.querySelector('#defenseGrid');
const feedback = document.querySelector('#feedback');
const arrowSvg = document.querySelector('#refutationArrow');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const PIECES = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const FILES = 'abcdefgh';
const RESET_HOLD_MS = 170;
const KEY_TRAVEL_MS = 520;
const BETWEEN_MOVES_MS = 180;
const DEFENCE_TRAVEL_MS = 670;
const DEFENCE_HOLD_MS = 380;

let replayingDefenseClick = false;
let animatingDefense = false;
let arrivalTimer = null;
let cueTimer = null;

const turnCue = document.createElement('div');
turnCue.className = 'turn-cue';
turnCue.setAttribute('aria-live','polite');
boardWrap?.append(turnCue);

function wait(ms){
  return new Promise(resolve=>window.setTimeout(resolve,ms));
}

function parseFenPosition(fen){
  const position={};
  const rows=fen.split(' ')[0].split('/');
  rows.forEach((row,ri)=>{
    let file=0;
    for(const ch of row){
      if(/\d/.test(ch)) file+=Number(ch);
      else{
        position[FILES[file]+(8-ri)]=ch;
        file++;
      }
    }
  });
  return position;
}

function applyMove(position,uci){
  const next={...position};
  const from=uci.slice(0,2);
  const to=uci.slice(2,4);
  if(next[from]){
    next[to]=next[from];
    delete next[from];
  }
  return next;
}

function pieceColor(piece){
  return piece===piece.toUpperCase()?'white':'black';
}

function squareEl(square){
  return board?.querySelector(`[data-square="${square}"]`);
}

function createPiece(piece){
  const el=document.createElement('div');
  el.className=`piece ${pieceColor(piece)}`;
  el.textContent=PIECES[piece];
  return el;
}

function clearReplayClasses(square){
  square.classList.remove(
    'last','selected','hint-piece','refutation-piece','refutation-target','answer-piece','answer-target',
    'legal','capture-target','hover-target','defense-preview-target','defense-landed','defense-arrival',
    'capture-impact','replay-key-source','replay-key-target','replay-defence-source','replay-defence-target'
  );
}

function paintPosition(position){
  if(!board) return;
  board.querySelectorAll('.square').forEach(square=>{
    clearReplayClasses(square);
    square.querySelectorAll('.piece').forEach(piece=>piece.remove());
    const code=position[square.dataset.square];
    if(code) square.append(createPiece(code));
  });
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
  const target=squareEl(square);
  if(!target) return;
  target.classList.remove('defense-arrival');
  void target.offsetWidth;
  target.classList.add('defense-arrival');
  if(arrivalTimer) clearTimeout(arrivalTimer);
  arrivalTimer=setTimeout(()=>target.classList.remove('defense-arrival'),920);
}

function hideExistingArrow(){
  arrowSvg?.classList.remove('is-visible','answer-mode');
}

async function animateMove({uci,before,after,duration,kind,capture=false}){
  const from=uci.slice(0,2);
  const to=uci.slice(2,4);
  const fromSquare=squareEl(from);
  const toSquare=squareEl(to);
  const piece=fromSquare?.querySelector('.piece');
  const capturedPiece=toSquare?.querySelector('.piece');

  if(!board || !fromSquare || !toSquare || !piece){
    paintPosition(after);
    await wait(80);
    return;
  }

  const sourceClass=kind==='key'?'replay-key-source':'replay-defence-source';
  const targetClass=kind==='key'?'replay-key-target':'replay-defence-target';
  fromSquare.classList.add(sourceClass);
  toSquare.classList.add(targetClass);

  if(reduceMotion?.matches){
    await wait(90);
    paintPosition(after);
    await wait(90);
    return;
  }

  const boardRect=board.getBoundingClientRect();
  const fromRect=fromSquare.getBoundingClientRect();
  const toRect=toSquare.getBoundingClientRect();
  const dx=toRect.left-fromRect.left;
  const dy=toRect.top-fromRect.top;

  const flyer=document.createElement('div');
  flyer.className=`defense-flyer replay-flyer replay-${kind}-flyer`;
  flyer.style.left=`${fromRect.left-boardRect.left}px`;
  flyer.style.top=`${fromRect.top-boardRect.top}px`;
  flyer.style.width=`${fromRect.width}px`;
  flyer.style.height=`${fromRect.height}px`;
  flyer.style.transitionDuration=`${duration}ms`;
  flyer.append(piece.cloneNode(true));
  board.append(flyer);

  piece.classList.add('defense-source-hidden');

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      flyer.style.transform=`translate3d(${dx}px, ${dy}px, 0)`;
    });
  });

  if(capture && capturedPiece){
    window.setTimeout(()=>{
      capturedPiece.classList.add('capture-breaking');
      toSquare.classList.add('capture-impact');
    },Math.max(220,duration-230));
  }

  await wait(duration);
  toSquare.classList.add(kind==='key'?'replay-key-landed':'defense-landed');
  if(kind==='defence') flashArrival(to);
  await wait(kind==='key'?120:90);

  flyer.remove();
  capturedPiece?.classList.remove('capture-breaking');
  paintPosition(after);
}

function commitDefense(button,to){
  replayingDefenseClick=true;
  button.click();
  replayingDefenseClick=false;
  animatingDefense=false;
  board?.classList.remove('variation-replay');
  defenseGrid?.classList.remove('is-previewing');

  requestAnimationFrame(()=>{
    flashArrival(to);
    showTurnCue('WHITE TO MOVE','この防御へのMateを探す','white-turn',1200);
  });
}

async function playVariation(defense,button){
  if(animatingDefense) return;
  animatingDefense=true;
  defenseGrid?.classList.add('is-previewing');
  button.classList.add('defense-preview');
  board?.classList.add('variation-replay');
  hideExistingArrow();

  const initial=parseFenPosition(problem.fen);
  const postKey=applyMove(initial,problem.key.uci);
  const postDefence=applyMove(postKey,defense.black);
  const defenceCapture=Boolean(postKey[defense.black.slice(2,4)]);

  setFeedback('変化を最初から確認します','同じKeyから、黒が今回はどう防御するかを見ます。');
  showTurnCue('VARIATION','初期局面 → Key → Defence','replay');
  paintPosition(initial);
  await wait(reduceMotion?.matches?90:RESET_HOLD_MS);

  showTurnCue('WHITE KEY',problem.key.san,'key-turn');
  await animateMove({
    uci:problem.key.uci,
    before:initial,
    after:postKey,
    duration:KEY_TRAVEL_MS,
    kind:'key'
  });
  await wait(reduceMotion?.matches?80:BETWEEN_MOVES_MS);

  setFeedback(`黒の防御 ${defense.blackSan}`,'白のKeyは同じ。ここから黒の選択だけが分岐します。');
  showTurnCue('BLACK DEFENCE',defense.blackSan,'defence');
  await animateMove({
    uci:defense.black,
    before:postKey,
    after:postDefence,
    duration:DEFENCE_TRAVEL_MS,
    kind:'defence',
    capture:defenceCapture
  });
  await wait(reduceMotion?.matches?90:DEFENCE_HOLD_MS);

  button.classList.remove('defense-preview');
  hideTurnCue();
  commitDefense(button,defense.black.slice(2,4));
}

if(defenseGrid){
  defenseGrid.addEventListener('click',event=>{
    const button=event.target.closest('.defense-chip');
    if(!button || !defenseGrid.contains(button) || replayingDefenseClick) return;
    if(button.disabled || animatingDefense) return;

    const buttons=[...defenseGrid.querySelectorAll('.defense-chip')];
    const index=buttons.indexOf(button);
    const defense=problem.defenses[index];
    if(!defense) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    playVariation(defense,button);
  },true);
}
