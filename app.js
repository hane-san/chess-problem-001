import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { problems } from './data/problems.js';

const PIECES = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const FILES = 'abcdefgh';
const DRAG_THRESHOLD_PX = 7;
const REFUTATION_DELAY_MS = 500;
const REFUTATION_MOVE_MS = 1050;
const REFUTATION_RESET_MS = 2250;
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
let hintEnabled = readHintPreference();
let hintSquare = null;
let refutationFrom = null;
let refutationTo = null;
let isShowingRefutation = false;
let demoTimers = [];

const boardEl = document.querySelector('#board');
const feedback = document.querySelector('#feedback');
const phaseTitle = document.querySelector('#phaseTitle');
const phaseText = document.querySelector('#phaseText');
const phaseIndex = document.querySelector('.phase-index');
const defenseSection = document.querySelector('#defenseSection');
const defenseGrid = document.querySelector('#defenseGrid');
const defenseCount = document.querySelector('#defenseCount');
const hintToggle = document.querySelector('#hintToggle');
const arrowSvg = document.querySelector('#refutationArrow');
const arrowLine = document.querySelector('#refutationLine');

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
function canMovePiece(p){return !isShowingRefutation&&(phase==='key'||phase==='mate')&&pieceColor(p)==='white';}

function readHintPreference(){
  try{return localStorage.getItem('cp-hint-enabled')!=='false';}
  catch{return true;}
}

function saveHintPreference(){
  try{localStorage.setItem('cp-hint-enabled',hintEnabled?'true':'false');}catch{}
}

function moveSpec(move){
  const spec={from:move.from,to:move.to};
  if(move.promotion) spec.promotion=move.promotion;
  return spec;
}

function baseEngine(){
  const chess=new Chess(problem.fen);
  if(phase==='mate'&&activeDefense){
    chess.move({from:problem.key.uci.slice(0,2),to:problem.key.uci.slice(2,4)});
    chess.move({from:activeDefense.black.slice(0,2),to:activeDefense.black.slice(2,4)});
  }
  return chess;
}

function restoreBaseBoard(){
  board=parseFen(baseEngine().fen());
  lastMove=[];
}

function legalMovesFrom(sq){
  if(!(phase==='key'||phase==='mate')||isShowingRefutation) return [];
  try{return baseEngine().moves({square:sq,verbose:true});}
  catch{return [];}
}

function currentHintSquare(){
  if(!hintEnabled||isShowingRefutation) return null;
  if(phase==='key') return problem.key.uci.slice(0,2);
  if(phase==='mate'&&activeDefense) return activeDefense.mate.slice(0,2);
  return null;
}

function syncHint(){
  hintSquare=currentHintSquare();
  updateHintToggle();
  updateMarkers();
}

function updateHintToggle(){
  hintToggle.classList.toggle('is-on',hintEnabled);
  hintToggle.setAttribute('aria-checked',hintEnabled?'true':'false');
}

function toggleHint(){
  hintEnabled=!hintEnabled;
  saveHintPreference();
  syncHint();
}

function selectSquare(sq){
  const p=board[sq];
  if(!p||!canMovePiece(p)) return false;
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
  if(refutationFrom&&refutationTo) requestAnimationFrame(()=>showRefutationArrow(refutationFrom,refutationTo));
}

function updateMarkers(){
  boardEl.querySelectorAll('.square').forEach(el=>{
    const sq=el.dataset.square;
    el.classList.toggle('selected',sq===selected);
    el.classList.toggle('hint-piece',sq===hintSquare);
    el.classList.toggle('refutation-piece',sq===refutationFrom);
    el.classList.toggle('refutation-target',sq===refutationTo);
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
  if(isShowingRefutation) return;
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
  if(!gesture||gesture.id!==e.pointerId||!selected||isShowingRefutation) return;
  e.preventDefault();
  if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>DRAG_THRESHOLD_PX) gesture.moved=true;
  const sq=squareAtPoint(e.clientX,e.clientY);
  const next=sq&&legalMoveTo(sq)?sq:null;
  if(next!==hoverTarget){hoverTarget=next;updateMarkers();}
}

function endPointer(e){
  if(!gesture||gesture.id!==e.pointerId||isShowingRefutation) return;
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

function cancelPointer(){
  gesture=null;
  hoverTarget=null;
  updateMarkers();
}

function commitSelectedMove(to){
  if(!selected||!legalMoveTo(to)||isShowingRefutation) return;
  const from=selected;
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  if(navigator.vibrate) navigator.vibrate(12);
  attemptMove(from,to);
}

function mateInOneExists(chess){
  return chess.moves({verbose:true}).some(move=>{
    const next=new Chess(chess.fen());
    next.move(moveSpec(move));
    return next.isCheckmate();
  });
}

function findKeyRefutation(from,to){
  try{
    const chess=new Chess(problem.fen);
    chess.move({from,to});
    for(const blackMove of chess.moves({verbose:true})){
      const afterDefense=new Chess(chess.fen());
      afterDefense.move(moveSpec(blackMove));
      if(!mateInOneExists(afterDefense)) return blackMove;
    }
  }catch{}
  return null;
}

function findReplyAfterWrongMate(from,to){
  try{
    const chess=baseEngine();
    chess.move({from,to});
    if(chess.isCheckmate()) return null;
    const replies=chess.moves({verbose:true});
    replies.sort((a,b)=>replyScore(b)-replyScore(a));
    return replies[0]||null;
  }catch{
    return null;
  }
}

function replyScore(move){
  let score=0;
  if(move.san.includes('+')) score+=4;
  if(move.captured) score+=2;
  if(move.san.includes('x')) score+=1;
  return score;
}

function attemptMove(from,to){
  const uci=from+to;
  if(phase==='key'){
    if(uci===problem.key.uci){
      board=parseFen(problem.fen);
      movePiece(uci);
      onKeySolved();
      render();
      return;
    }
    const refutation=findKeyRefutation(from,to);
    startRefutationDemo({from,to,refutation,kind:'key'});
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
      render();
      return;
    }
    const refutation=findReplyAfterWrongMate(from,to);
    startRefutationDemo({from,to,refutation,kind:'mate'});
  }
}

function startRefutationDemo({from,to,refutation,kind}){
  clearDemoTimers();
  isShowingRefutation=true;
  clearSelection();
  hintSquare=null;
  hideRefutationArrow();
  refutationFrom=null;
  refutationTo=null;

  const attemptEngine=baseEngine();
  try{attemptEngine.move({from,to});}catch{
    isShowingRefutation=false;
    restoreBaseBoard();
    syncHint();
    render();
    return;
  }

  board=parseFen(attemptEngine.fen());
  lastMove=[from,to];
  render();

  if(kind==='key') showFeedback('bad','×','Not the key.','黒にこの手を壊す応手があります。');
  else showFeedback('bad','×','Not mate.','黒にまだ応手が残っています。');

  if(!refutation){
    demoTimers.push(setTimeout(()=>finishRefutationDemo(),REFUTATION_RESET_MS));
    return;
  }

  demoTimers.push(setTimeout(()=>{
    refutationFrom=refutation.from;
    refutationTo=refutation.to;
    updateMarkers();
    showRefutationArrow(refutationFrom,refutationTo);
    if(kind==='key') showFeedback('bad','↯',refutation.san,'この黒手のあと、白は次の1手で詰ませられません。');
    else showFeedback('bad','↯',refutation.san,'黒がこう応じられるので、まだmateではありません。');
  },REFUTATION_DELAY_MS));

  demoTimers.push(setTimeout(()=>{
    try{attemptEngine.move(moveSpec(refutation));}catch{}
    board=parseFen(attemptEngine.fen());
    lastMove=[refutation.from,refutation.to];
    render();
  },REFUTATION_MOVE_MS));

  demoTimers.push(setTimeout(()=>finishRefutationDemo(),REFUTATION_RESET_MS));
}

function finishRefutationDemo(){
  clearDemoTimers();
  isShowingRefutation=false;
  refutationFrom=null;
  refutationTo=null;
  hideRefutationArrow();
  restoreBaseBoard();
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  render();
  syncHint();
}

function clearDemoTimers(){
  demoTimers.forEach(clearTimeout);
  demoTimers=[];
}

function showRefutationArrow(from,to){
  const fromEl=boardEl.querySelector(`[data-square="${from}"]`);
  const toEl=boardEl.querySelector(`[data-square="${to}"]`);
  if(!fromEl||!toEl) return;

  const boardRect=boardEl.getBoundingClientRect();
  const a=fromEl.getBoundingClientRect();
  const b=toEl.getBoundingClientRect();
  const x1=a.left-boardRect.left+a.width/2;
  const y1=a.top-boardRect.top+a.height/2;
  const x2=b.left-boardRect.left+b.width/2;
  const y2=b.top-boardRect.top+b.height/2;

  arrowSvg.setAttribute('viewBox',`0 0 ${boardRect.width} ${boardRect.height}`);
  arrowLine.setAttribute('x1',x1);
  arrowLine.setAttribute('y1',y1);
  arrowLine.setAttribute('x2',x2);
  arrowLine.setAttribute('y2',y2);
  arrowSvg.classList.add('is-visible');
}

function hideRefutationArrow(){
  arrowSvg.classList.remove('is-visible');
}

function movePiece(uci){
  const from=uci.slice(0,2),to=uci.slice(2,4);
  if(!board[from]) return false;
  board[to]=board[from];
  delete board[from];
  lastMove=[from,to];
  return true;
}

function onKeySolved(){
  phase='defenses';
  clearSelection();
  showFeedback('good','✓',`${problem.key.san} — key found.`,problem.key.note);
  defenseSection.classList.remove('is-hidden');
  renderDefenses();
  updatePhase();
  syncHint();
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
    b.disabled=solvedDefenses.has(d.id)||isShowingRefutation;
    b.addEventListener('click',()=>chooseDefense(d));
    defenseGrid.append(b);
  });
}

function chooseDefense(d){
  if(isShowingRefutation) return;
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
  syncHint();
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
  clearDemoTimers();
  isShowingRefutation=false;
  refutationFrom=null;
  refutationTo=null;
  hideRefutationArrow();
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
  syncHint();
}

function reveal(){
  if(isShowingRefutation) return;
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
    syncHint();
  }else{
    showFeedback('neutral','i','Choose a defence.','黒の応手をひとつ選ぶと、その局面のmateを考えられます。');
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
hintToggle.addEventListener('click',toggleHint);
document.querySelector('#flipBtn').addEventListener('click',()=>{
  if(isShowingRefutation) return;
  orientation=orientation==='white'?'black':'white';
  selected=null;
  legalMoves=[];
  hoverTarget=null;
  render();
  syncHint();
});

render();
updatePhase();
syncHint();
