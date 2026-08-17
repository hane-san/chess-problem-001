import { problems } from './data/problems.js';

const problem = problems[0];
const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const defenseGrid = document.querySelector('#defenseGrid');
const feedback = document.querySelector('#feedback');
const arrowSvg = document.querySelector('#refutationArrow');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const PIECES = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const PIECE_TYPE = {K:'k',Q:'q',R:'r',B:'b',N:'n',P:'p',k:'k',q:'q',r:'r',b:'b',n:'n',p:'p'};
const FILES = 'abcdefgh';

const BRANCH_HOLD_MS = 150;
const REWIND_MATE_MS = 380;
const REWIND_DEFENCE_MS = 440;
const BETWEEN_BRANCH_MS = 150;
const DEFENCE_TRAVEL_MS = 670;
const DEFENCE_HOLD_MS = 380;

const PROOF_DEFENCE_MS = 300;
const PROOF_MATE_MS = 310;
const PROOF_REWIND_MATE_MS = 180;
const PROOF_REWIND_DEFENCE_MS = 210;
const PROOF_HOLD_MS = 150;

let replayingDefenseClick = false;
let animatingDefense = false;
let proofRunning = false;
let lastDefense = null;
let arrivalTimer = null;
let cueTimer = null;

const turnCue = document.createElement('div');
turnCue.className = 'turn-cue';
turnCue.setAttribute('aria-live','polite');
boardWrap?.append(turnCue);

function wait(ms){
  return new Promise(resolve=>window.setTimeout(resolve,ms));
}

function reverseUci(uci){
  return uci.slice(2,4)+uci.slice(0,2);
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
  el.className=`piece piece-${PIECE_TYPE[piece]} ${pieceColor(piece)}`;
  el.textContent=PIECES[piece];
  return el;
}

function clearReplayClasses(square){
  square.classList.remove(
    'last','selected','hint-piece','refutation-piece','refutation-target','answer-piece','answer-target',
    'legal','capture-target','hover-target','defense-preview-target','defense-landed','defense-arrival',
    'capture-impact','replay-key-source','replay-key-target','replay-key-landed','replay-defence-source','replay-defence-target',
    'replay-rewind-source','replay-rewind-target','proof-source','proof-target','proof-mate-target','king-square','mate-impact'
  );
}

function paintPosition(position){
  if(!board) return;
  board.querySelectorAll('.square').forEach(square=>{
    clearReplayClasses(square);
    square.querySelectorAll('.piece').forEach(piece=>piece.remove());
    const code=position[square.dataset.square];
    if(code){
      square.append(createPiece(code));
      if(PIECE_TYPE[code]==='k') square.classList.add('king-square');
    }
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

function flashMateKing(){
  const king=[...board.querySelectorAll('.piece.black')].find(piece=>piece.textContent.trim()==='♚')?.closest('.square');
  if(!king) return;
  king.classList.remove('mate-impact');
  void king.offsetWidth;
  king.classList.add('mate-impact');
  setTimeout(()=>king.classList.remove('mate-impact'),720);
}

function hideExistingArrow(){
  arrowSvg?.classList.remove('is-visible','answer-mode');
}

function moveClasses(kind){
  if(kind==='key') return ['replay-key-source','replay-key-target','replay-key-flyer'];
  if(kind==='rewind') return ['replay-rewind-source','replay-rewind-target','replay-rewind-flyer'];
  if(kind==='proof-mate') return ['proof-source','proof-mate-target','proof-mate-flyer'];
  if(kind==='proof-defence') return ['proof-source','proof-target','proof-defence-flyer'];
  return ['replay-defence-source','replay-defence-target','replay-defence-flyer'];
}

async function animateMove({uci,after,duration,kind='defence',capture=false}){
  const from=uci.slice(0,2);
  const to=uci.slice(2,4);
  const fromSquare=squareEl(from);
  const toSquare=squareEl(to);
  const piece=fromSquare?.querySelector('.piece');
  const capturedPiece=toSquare?.querySelector('.piece');

  if(!board || !fromSquare || !toSquare || !piece){
    paintPosition(after);
    await wait(70);
    return;
  }

  const [sourceClass,targetClass,flyerClass]=moveClasses(kind);
  fromSquare.classList.add(sourceClass);
  toSquare.classList.add(targetClass);

  if(reduceMotion?.matches){
    await wait(70);
    paintPosition(after);
    await wait(70);
    return;
  }

  const boardRect=board.getBoundingClientRect();
  const fromRect=fromSquare.getBoundingClientRect();
  const toRect=toSquare.getBoundingClientRect();
  const dx=toRect.left-fromRect.left;
  const dy=toRect.top-fromRect.top;

  const flyer=document.createElement('div');
  flyer.className=`defense-flyer replay-flyer ${flyerClass}`;
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
    },Math.max(150,duration-210));
  }

  await wait(duration);
  if(kind==='key') toSquare.classList.add('replay-key-landed');
  else if(kind==='defence'||kind==='proof-defence'){
    toSquare.classList.add('defense-landed');
    flashArrival(to);
  }
  await wait(kind==='rewind'?45:80);

  flyer.remove();
  capturedPiece?.classList.remove('capture-breaking');
  paintPosition(after);
}

function solvedButtonFor(defense){
  const buttons=[...defenseGrid.querySelectorAll('.defense-chip')];
  const index=problem.defenses.findIndex(item=>item.id===defense?.id);
  return index>=0?buttons[index]:null;
}

async function rewindToBranchPoint(initial,postKey){
  if(!lastDefense){
    paintPosition(postKey);
    showTurnCue('BRANCH POINT',problem.key.san,'key-turn');
    await wait(reduceMotion?.matches?70:BRANCH_HOLD_MS);
    return;
  }

  const postDefence=applyMove(postKey,lastDefense.black);
  const postMate=applyMove(postDefence,lastDefense.mate);
  const phase=document.body.dataset.phase || 'defenses';
  const wasSolved=solvedButtonFor(lastDefense)?.classList.contains('done');

  if(phase==='defenses' && wasSolved){
    paintPosition(postMate);
    showTurnCue('REWIND','白のMateを戻す','rewind');
    await animateMove({
      uci:reverseUci(lastDefense.mate),
      after:postDefence,
      duration:REWIND_MATE_MS,
      kind:'rewind'
    });
    await wait(reduceMotion?.matches?50:80);
  }else{
    paintPosition(postDefence);
  }

  showTurnCue('BRANCH POINT','黒の防御を戻す','rewind');
  await animateMove({
    uci:reverseUci(lastDefense.black),
    after:postKey,
    duration:REWIND_DEFENCE_MS,
    kind:'rewind'
  });
  await wait(reduceMotion?.matches?50:BETWEEN_BRANCH_MS);
}

function commitDefense(button,defense){
  replayingDefenseClick=true;
  button.click();
  replayingDefenseClick=false;
  lastDefense=defense;
  animatingDefense=false;
  board?.classList.remove('variation-replay');
  defenseGrid?.classList.remove('is-previewing');

  requestAnimationFrame(()=>{
    flashArrival(defense.black.slice(2,4));
    showTurnCue('WHITE TO MOVE','この防御へのMateを探す','white-turn',1200);
  });
}

async function playVariation(defense,button){
  if(animatingDefense || proofRunning) return;
  animatingDefense=true;
  defenseGrid?.classList.add('is-previewing');
  button.classList.add('defense-preview');
  board?.classList.add('variation-replay');
  hideExistingArrow();

  const initial=parseFenPosition(problem.fen);
  const postKey=applyMove(initial,problem.key.uci);
  const postDefence=applyMove(postKey,defense.black);
  const defenceCapture=Boolean(postKey[defense.black.slice(2,4)]);

  setFeedback('分岐点へ戻ります','Keyはそのまま。黒の前の防御だけを巻き戻して、別の変化を見ます。');
  await rewindToBranchPoint(initial,postKey);

  setFeedback(`黒の防御 ${defense.blackSan}`,'同じKeyから、黒が今回はこの防御を選びます。');
  showTurnCue('BLACK DEFENCE',defense.blackSan,'defence');
  await animateMove({
    uci:defense.black,
    after:postDefence,
    duration:DEFENCE_TRAVEL_MS,
    kind:'defence',
    capture:defenceCapture
  });
  await wait(reduceMotion?.matches?80:DEFENCE_HOLD_MS);

  button.classList.remove('defense-preview');
  hideTurnCue();
  commitDefense(button,defense);
}

async function playProofSweep(){
  if(proofRunning || animatingDefense) return;
  proofRunning=true;
  animatingDefense=true;
  defenseGrid?.classList.add('is-previewing','proof-running');
  board?.classList.add('variation-replay','proof-sweep');
  hideExistingArrow();

  const initial=parseFenPosition(problem.fen);
  const postKey=applyMove(initial,problem.key.uci);

  setFeedback('最終確認','黒がどの防御を選んでも、白の2手目で順番にMateできることを再生します。');
  await rewindToBranchPoint(initial,postKey);
  paintPosition(postKey);
  await wait(reduceMotion?.matches?60:120);

  const buttons=[...defenseGrid.querySelectorAll('.defense-chip')];

  for(let index=0;index<problem.defenses.length;index++){
    const defense=problem.defenses[index];
    const button=buttons[index];
    const postDefence=applyMove(postKey,defense.black);
    const postMate=applyMove(postDefence,defense.mate);
    const defenceCapture=Boolean(postKey[defense.black.slice(2,4)]);
    const mateCapture=Boolean(postDefence[defense.mate.slice(2,4)]);

    button?.classList.add('proof-active');
    showTurnCue(`DEFENCE ${index+1} / ${problem.defenses.length}`,defense.blackSan,'defence');
    await animateMove({
      uci:defense.black,
      after:postDefence,
      duration:PROOF_DEFENCE_MS,
      kind:'proof-defence',
      capture:defenceCapture
    });

    showTurnCue('WHITE MATE',defense.mateSan,'proof-mate');
    await animateMove({
      uci:defense.mate,
      after:postMate,
      duration:PROOF_MATE_MS,
      kind:'proof-mate',
      capture:mateCapture
    });
    flashMateKing();
    await wait(reduceMotion?.matches?60:PROOF_HOLD_MS);

    if(index<problem.defenses.length-1){
      await animateMove({
        uci:reverseUci(defense.mate),
        after:postDefence,
        duration:PROOF_REWIND_MATE_MS,
        kind:'rewind'
      });
      await animateMove({
        uci:reverseUci(defense.black),
        after:postKey,
        duration:PROOF_REWIND_DEFENCE_MS,
        kind:'rewind'
      });
    }

    button?.classList.remove('proof-active');
  }

  showTurnCue('PROOF COMPLETE','すべてのDefenceにMate','proof-complete',1700);
  board?.classList.remove('variation-replay','proof-sweep');
  defenseGrid?.classList.remove('is-previewing','proof-running');
  animatingDefense=false;
  proofRunning=false;
  window.dispatchEvent(new CustomEvent('cp-proof-sweep-finished'));
}

if(defenseGrid){
  defenseGrid.addEventListener('click',event=>{
    const button=event.target.closest('.defense-chip');
    if(!button || !defenseGrid.contains(button) || replayingDefenseClick) return;
    if(button.disabled || animatingDefense || proofRunning) return;

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

new MutationObserver(()=>{
  const phase=document.body.dataset.phase || 'key';
  if(phase==='key') lastDefense=null;
  if(phase==='defenses'){
    const match=(document.querySelector('#defenseCount')?.textContent || '').match(/^(\d+)/);
    if(match && Number(match[1])===0) lastDefense=null;
  }
}).observe(document.body,{attributes:true,attributeFilter:['data-phase']});

window.addEventListener('cp-proof-sweep',()=>playProofSweep());
