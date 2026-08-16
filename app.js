import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { problems } from './data/problems.js';

const PIECES = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const FILES = 'abcdefgh';
const DRAG_THRESHOLD_PX = 7;
const HINT_GLOW_MS = 2400;
const problem = problems[0];

let board = parseFen(problem.fen);
let orientation = 'white';
let selected = null;
let legalMoves = [];
let hoverTarget = null;
let gesture = null;
let phase = 'key';
let activeDefense = null;
let solvedDefenses = new Set();
let lastMove = [];
let hintSquare = null;
let hintTimer = null;

const boardEl = document.querySelector('#board');
const feedback = document.querySelector('#feedback');
const phaseTitle = document.querySelector('#phaseTitle');
const phaseText = document.querySelector('#phaseText');
const phaseIndex = document.querySelector('.phase-index');
const defenseSection = document.querySelector('#defenseSection');
const defenseGrid = document.querySelector('#defenseGrid');
const defenseCount = document.querySelector('#defenseCount');

function parseFen(fen){
  const rows=fen.split(' ')[0].split('/');
  const state={};
  rows.forEach((row,ri)=>{
    let file=0;
    for(const ch of row){
      if(/\d/.test(ch)) file+=Number(ch);
      else {state[FILES[file]+(8-ri)]=ch;file++;}
    }
  });
  return state;
}

function squareOrder(){
  const ranks=orientation==='white'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const files=orientation==='white'?[...FILES]:[...FILES].reverse();
  return ranks.flatMap(r=>files.map(f=>f+r));
}

function pieceColor(p){return p===p.toUpperCase()?'white':'black';}
function canMovePiece(p){return (phase==='key'||phase==='mate')&&pieceColor(p)==='white';}

function engineForCurrentPosition(){
  const chess=new Chess(problem.fen);
  if(phase==='mate'&&activeDefense){
    chess.move({from:problem.key.uci.slice(0,2),to:problem.key.uci.slice(2,4)});
    chess.move({from:activeDefense.black.slice(0,2),to:activeDefense.black.slice(2,4)});
  }
  return chess;
}

function legalMovesFrom(sq){
  if(!(phase==='key'||phase==='mate')) return [];
  try{
    return engineForCurrentPosition().moves({square:sq,verbose:true});
  }catch{
    return [];
  }
}

function clearHint(){
  if(hintTimer){clearTimeout(hintTimer);hintTimer=null;}
  hintSquare=null;
}

function showPieceHint(sq){
  clearHint();
  hintSquare=sq;
  updateMarkers();
  hintTimer=setTimeout(()=>{
    hintSquare=null;
    hintTimer=null;
    updateMarkers();
  },HINT_GLOW_MS);
}

function selectSquare(sq){
  const p=board[sq];
  if(!p||!canMovePiece(p)) return false;
  clearHint();
  selected=sq;
  legalMoves=legalMovesFrom(sq);
  hoverTarget=null;
  updateMarkers();
  return true;
}

function clearSelection(){
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  updateMarkers();
}

function legalMoveTo(sq){return legalMoves.find(m=>m.to===sq);}

function render(){
  boardEl.innerHTML='';
  squareOrder().forEach(sq=>{
    const file=FILES.indexOf(sq[0]);
    const rank=Number(sq[1]);
    const div=document.createElement('div');
    div.className=`square ${(file+rank)%2?'light':'dark'}`;
    div.dataset.square=sq;
    if(lastMove.includes(sq)) div.classList.add('last');

    const edgeFile=orientation==='white'?(rank===1):(rank===8);
    const edgeRank=orientation==='white'?(sq[0]==='a'):(sq[0]==='h');
    if(edgeFile){const c=document.createElement('span');c.className='coord file';c.textContent=sq[0];div.append(c);}
    if(edgeRank){const c=document.createElement('span');c.className='coord rank';c.textContent=sq[1];div.append(c);}

    const p=board[sq];
    if(p){
      const el=document.createElement('div');
      el.className=`piece ${pieceColor(p)}`;
      el.textContent=PIECES[p];
      div.append(el);
    }
    boardEl.append(div);
  });
  updateMarkers();
}

function updateMarkers(){
  boardEl.querySelectorAll('.square').forEach(el=>{
    const sq=el.dataset.square;
    el.classList.toggle('selected',sq===selected);
    el.classList.toggle('hint-piece',sq===hintSquare);
    el.classList.remove('legal','capture-target','hover-target');
    const move=legalMoveTo(sq);
    if(move){
      el.classList.add('legal');
      if(move.captured) el.classList.add('capture-target');
    }
    if(sq===hoverTarget&&move) el.classList.add('hover-target');
  });
}

function squareAtPoint(x,y){
  const el=document.elementFromPoint(x,y)?.closest?.('.square');
  return el&&boardEl.contains(el)?el.dataset.square:null;
}

function beginPointer(e){
  if(e.button!==undefined&&e.button!==0) return;
  const sq=e.target.closest('.square')?.dataset.square;
  if(!sq) return;
  e.preventDefault();

  const p=board[sq];
  const ownMovable=p&&canMovePiece(p);

  if(ownMovable){
    selectSquare(sq);
    gesture={id:e.pointerId,from:sq,startX:e.clientX,startY:e.clientY,moved:false};
  }else if(selected&&legalMoveTo(sq)){
    gesture={id:e.pointerId,from:selected,startX:e.clientX,startY:e.clientY,moved:false,directTarget:sq};
    hoverTarget=sq;
    updateMarkers();
  }else{
    gesture={id:e.pointerId,from:null,startX:e.clientX,startY:e.clientY,moved:false};
  }

  try{boardEl.setPointerCapture(e.pointerId);}catch{}
}

function movePointer(e){
  if(!gesture||gesture.id!==e.pointerId||!selected) return;
  e.preventDefault();
  if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>DRAG_THRESHOLD_PX) gesture.moved=true;
  const sq=squareAtPoint(e.clientX,e.clientY);
  const next=sq&&legalMoveTo(sq)?sq:null;
  if(next!==hoverTarget){hoverTarget=next;updateMarkers();}
}

function endPointer(e){
  if(!gesture||gesture.id!==e.pointerId) return;
  e.preventDefault();
  const old=gesture;
  gesture=null;

  const releaseSq=squareAtPoint(e.clientX,e.clientY) || old.directTarget || null;
  const move=releaseSq?legalMoveTo(releaseSq):null;

  if(selected&&move&&releaseSq!==selected&&(old.moved||old.directTarget)){
    commitSelectedMove(releaseSq);
    return;
  }

  hoverTarget=null;

  if(old.from&&releaseSq===old.from){
    updateMarkers();
    return;
  }

  const p=releaseSq?board[releaseSq]:null;
  if(p&&canMovePiece(p)){
    selectSquare(releaseSq);
    return;
  }

  if(selected&&move){
    commitSelectedMove(releaseSq);
    return;
  }

  updateMarkers();
}

function cancelPointer(){gesture=null;hoverTarget=null;updateMarkers();}

function commitSelectedMove(to){
  if(!selected||!legalMoveTo(to)) return;
  const from=selected;
  clearHint();
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  if(navigator.vibrate) navigator.vibrate(12);
  attemptMove(from,to);
  render();
}

function movePiece(uci){
  const from=uci.slice(0,2),to=uci.slice(2,4);
  if(!board[from]) return false;
  board[to]=board[from];
  delete board[from];
  lastMove=[from,to];
  return true;
}

function attemptMove(from,to){
  const uci=from+to;
  if(phase==='key'){
    if(uci===problem.key.uci){movePiece(uci);onKeySolved();return;}
    const knownTry=problem.tries.find(t=>t.uci===uci);
    if(knownTry){
      showFeedback('bad','×',`${knownTry.san} — a convincing try`,`${knownTry.refutation} が一手だけ残るため失敗。盤面は元に戻しました。`);
      return;
    }
    showFeedback('bad','×','Legal, but not the key.','合法手ではありますが、黒のすべての応手に対して2手目のmateを保証できません。');
    return;
  }

  if(phase==='mate'&&activeDefense){
    if(uci===activeDefense.mate){
      movePiece(uci);
      solvedDefenses.add(activeDefense.id);
      showFeedback('good','✓',`${activeDefense.mateSan} — mate.`,activeDefense.note);
      phase='defenses';
      updatePhase();
      renderDefenses();
      if(solvedDefenses.size===problem.defenses.length) completeProblem();
      return;
    }
    showFeedback('bad','×','Legal, but not mate.','この防御に対する2手目としては詰みになりません。もう一度探してください。');
  }
}

function onKeySolved(){
  phase='defenses';
  clearHint();
  clearSelection();
  showFeedback('good','✓',`${problem.key.san} — key found.`,problem.key.note);
  defenseSection.classList.remove('is-hidden');
  renderDefenses();
  updatePhase();
}

function renderDefenses(){
  defenseGrid.innerHTML='';
  defenseCount.textContent=`${solvedDefenses.size} / ${problem.defenses.length}`;
  problem.defenses.forEach(d=>{
    const b=document.createElement('button');
    b.className='defense-chip';
    b.textContent=d.label;
    if(solvedDefenses.has(d.id)) b.classList.add('done');
    if(activeDefense?.id===d.id&&phase==='mate') b.classList.add('active');
    b.disabled=solvedDefenses.has(d.id);
    b.addEventListener('click',()=>chooseDefense(d));
    defenseGrid.append(b);
  });
}

function chooseDefense(d){
  clearHint();
  board=parseFen(problem.fen);
  movePiece(problem.key.uci);
  movePiece(d.black);
  activeDefense=d;
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  phase='mate';
  showFeedback('neutral','→',d.blackSan,'この黒の防御に対して、白の2手目で詰ませる。');
  updatePhase();
  renderDefenses();
  render();
}

function updatePhase(){
  document.body.dataset.phase=phase;
  phaseText.textContent='';
  if(phase==='key'){
    phaseIndex.textContent='01';
    phaseTitle.textContent='Find the key';
  }else if(phase==='defenses'){
    phaseIndex.textContent='02';
    phaseTitle.textContent='Test every defence';
  }else if(phase==='mate'){
    phaseIndex.textContent='03';
    phaseTitle.textContent='Finish the line';
  }
}

function showFeedback(type,icon,title,text){
  feedback.className=`feedback ${type}`;
  feedback.querySelector('.feedback-icon').textContent=icon;
  feedback.querySelector('strong').textContent=title;
  feedback.querySelector('span').textContent=text;
}

function reset(){
  clearHint();
  board=parseFen(problem.fen);
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  activeDefense=null;
  phase='key';
  lastMove=[];
  solvedDefenses=new Set();
  defenseSection.classList.add('is-hidden');
  showFeedback('neutral','○','Quietly inspect the position.','まずは黒王の周囲を見る。');
  updatePhase();
  render();
}

function reveal(){
  clearHint();
  clearSelection();
  if(phase==='key'){
    movePiece(problem.key.uci);
    onKeySolved();
    render();
  }else if(phase==='mate'&&activeDefense){
    movePiece(activeDefense.mate);
    solvedDefenses.add(activeDefense.id);
    showFeedback('good','✓',`${activeDefense.mateSan} — revealed.`,activeDefense.note);
    phase='defenses';
    updatePhase();
    renderDefenses();
    render();
  }else{
    showFeedback('neutral','i','Choose a defence.','黒の応手をひとつ選ぶと、その局面のmateを考えられます。');
  }
}

function hint(){
  if(phase==='key'){
    showPieceHint(problem.key.uci.slice(0,2));
  }else if(phase==='mate'&&activeDefense){
    showPieceHint(activeDefense.mate.slice(0,2));
  }
}

function completeProblem(){
  showFeedback('good','★','Proof complete.','すべての代表防御にmateを確認しました。keyを「当てた」のではなく、構造を証明できています。');
}

boardEl.addEventListener('pointerdown',beginPointer);
boardEl.addEventListener('pointermove',movePointer);
boardEl.addEventListener('pointerup',endPointer);
boardEl.addEventListener('pointercancel',cancelPointer);
boardEl.addEventListener('lostpointercapture',cancelPointer);
boardEl.addEventListener('contextmenu',e=>e.preventDefault());
boardEl.addEventListener('selectstart',e=>e.preventDefault());
boardEl.addEventListener('dragstart',e=>e.preventDefault());

document.querySelector('#resetBtn').addEventListener('click',reset);
document.querySelector('#revealBtn').addEventListener('click',reveal);
document.querySelector('#hintBtn').addEventListener('click',hint);
document.querySelector('#flipBtn').addEventListener('click',()=>{
  clearHint();
  orientation=orientation==='white'?'black':'white';
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  render();
});

render();
updatePhase();