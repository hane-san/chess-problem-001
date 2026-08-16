import { problems } from './data/problems.js';

const PIECES = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const FILES = 'abcdefgh';
const problem = problems[0];
let board = parseFen(problem.fen);
let orientation = 'white';
let selected = null;
let dragFrom = null;
let phase = 'key';
let activeDefense = null;
let solvedDefenses = new Set();
let lastMove = [];

const boardEl = document.querySelector('#board');
const feedback = document.querySelector('#feedback');
const phaseTitle = document.querySelector('#phaseTitle');
const phaseText = document.querySelector('#phaseText');
const phaseIndex = document.querySelector('.phase-index');
const defenseSection = document.querySelector('#defenseSection');
const defenseGrid = document.querySelector('#defenseGrid');
const defenseCount = document.querySelector('#defenseCount');

function parseFen(fen){
  const rows=fen.split(' ')[0].split('/'); const state={};
  rows.forEach((row,ri)=>{let file=0; for(const ch of row){ if(/\d/.test(ch)){file+=Number(ch)} else {state[FILES[file]+(8-ri)]=ch;file++}}});
  return state;
}
function squareOrder(){
  const ranks=orientation==='white'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const files=orientation==='white'?[...FILES]:[...FILES].reverse();
  return ranks.flatMap(r=>files.map(f=>f+r));
}
function pieceColor(p){return p===p.toUpperCase()?'white':'black'}
function render(){
  boardEl.innerHTML='';
  squareOrder().forEach(sq=>{
    const file=FILES.indexOf(sq[0]), rank=Number(sq[1]);
    const div=document.createElement('div'); div.className=`square ${(file+rank)%2?'light':'dark'}`; div.dataset.square=sq;
    if(selected===sq) div.classList.add('selected');
    if(lastMove.includes(sq)) div.classList.add('last');
    const edgeFile=orientation==='white'?(rank===1):(rank===8); const edgeRank=orientation==='white'?(sq[0]==='a'):(sq[0]==='h');
    if(edgeFile){const c=document.createElement('span');c.className='coord file';c.textContent=sq[0];div.append(c)}
    if(edgeRank){const c=document.createElement('span');c.className='coord rank';c.textContent=sq[1];div.append(c)}
    const p=board[sq]; if(p){
      const el=document.createElement('div'); el.className=`piece ${pieceColor(p)}`; el.textContent=PIECES[p]; el.draggable=canMovePiece(p);
      if(!canMovePiece(p))el.classList.add('disabled');
      el.addEventListener('dragstart',e=>{dragFrom=sq;el.classList.add('dragging');e.dataTransfer.effectAllowed='move'});
      el.addEventListener('dragend',()=>{dragFrom=null;el.classList.remove('dragging')});
      div.append(el);
    }
    div.addEventListener('dragover',e=>e.preventDefault());
    div.addEventListener('drop',e=>{e.preventDefault();if(dragFrom)attemptMove(dragFrom,sq)});
    div.addEventListener('click',()=>handleClick(sq));
    boardEl.append(div);
  });
}
function canMovePiece(p){
  if(phase==='key')return pieceColor(p)==='white';
  if(phase==='mate')return pieceColor(p)==='white';
  return false;
}
function handleClick(sq){
  const p=board[sq];
  if(selected){
    if(selected===sq){selected=null;render();return}
    if(p && canMovePiece(p)){selected=sq;render();return}
    attemptMove(selected,sq); selected=null; render(); return;
  }
  if(p && canMovePiece(p)){selected=sq;render()}
}
function movePiece(uci){
  const from=uci.slice(0,2),to=uci.slice(2,4); if(!board[from])return false;
  board[to]=board[from]; delete board[from]; lastMove=[from,to]; return true;
}
function attemptMove(from,to){
  const uci=from+to;
  if(phase==='key'){
    if(uci===problem.key.uci){movePiece(uci);onKeySolved();render();return}
    const knownTry=problem.tries.find(t=>t.uci===uci);
    if(knownTry){showFeedback('bad','×',`${knownTry.san} — a convincing try`,`${knownTry.refutation} が一手だけ残るため失敗。盤面は元に戻しました。`);pulseBoard();return}
    showFeedback('bad','×','Not the key.','この手では、黒のすべての応手に対して2手目のmateを保証できません。');pulseBoard();return;
  }
  if(phase==='mate'&&activeDefense){
    if(uci===activeDefense.mate){movePiece(uci); solvedDefenses.add(activeDefense.id); showFeedback('good','✓',`${activeDefense.mateSan} — mate.`,activeDefense.note); phase='defenses'; updatePhase(); renderDefenses(); render(); if(solvedDefenses.size===problem.defenses.length)completeProblem(); return}
    showFeedback('bad','×','That is not the mating reply.','この防御に対する2手目をもう一度探してください。');pulseBoard();
  }
}
function onKeySolved(){
  phase='defenses'; showFeedback('good','✓',`${problem.key.san} — key found.`,problem.key.note); defenseSection.classList.remove('is-hidden'); renderDefenses();updatePhase();
}
function renderDefenses(){
  defenseGrid.innerHTML=''; defenseCount.textContent=`${solvedDefenses.size} / ${problem.defenses.length}`;
  problem.defenses.forEach(d=>{const b=document.createElement('button');b.className='defense-chip';b.textContent=d.label;if(solvedDefenses.has(d.id))b.classList.add('done');if(activeDefense?.id===d.id&&phase==='mate')b.classList.add('active');b.disabled=solvedDefenses.has(d.id);b.addEventListener('click',()=>chooseDefense(d));defenseGrid.append(b)})
}
function chooseDefense(d){
  board=parseFen(problem.fen); movePiece(problem.key.uci); movePiece(d.black); activeDefense=d; phase='mate'; showFeedback('neutral','→',d.blackSan,'この黒の防御に対して、白の2手目で詰ませる。');updatePhase();renderDefenses();render();
}
function updatePhase(){
  if(phase==='key'){phaseIndex.textContent='01';phaseTitle.textContent='Find the key';phaseText.textContent='静かな初手も疑う。まず仮説を立てる。'}
  else if(phase==='defenses'){phaseIndex.textContent='02';phaseTitle.textContent='Test every defence';phaseText.textContent='黒の応手を選び、ひとつずつmateを証明する。'}
  else if(phase==='mate'){phaseIndex.textContent='03';phaseTitle.textContent='Finish the line';phaseText.textContent='選んだ防御に対する白の2手目を盤上で指す。'}
}
function showFeedback(type,icon,title,text){feedback.className=`feedback ${type}`;feedback.querySelector('.feedback-icon').textContent=icon;feedback.querySelector('strong').textContent=title;feedback.querySelector('span').textContent=text}
function pulseBoard(){boardEl.classList.remove('pulse');void boardEl.offsetWidth;boardEl.classList.add('pulse')}
function reset(){board=parseFen(problem.fen);selected=null;activeDefense=null;phase='key';lastMove=[];solvedDefenses=new Set();defenseSection.classList.add('is-hidden');showFeedback('neutral','○','Quietly inspect the position.','まずは黒王の周囲と、黒の合法そうな応手を眺める。');updatePhase();render()}
function reveal(){
  if(phase==='key'){movePiece(problem.key.uci);onKeySolved();render()}
  else if(phase==='mate'&&activeDefense){movePiece(activeDefense.mate);solvedDefenses.add(activeDefense.id);showFeedback('good','✓',`${activeDefense.mateSan} — revealed.`,activeDefense.note);phase='defenses';updatePhase();renderDefenses();render()}
  else showFeedback('neutral','i','Choose a defence.','黒の応手をひとつ選ぶと、その局面のmateを考えられます。')
}
function hint(){
  if(phase==='key')showFeedback('neutral','·','Hint 01','王手ではありません。白キングの「待つ一歩」を候補に。')
  else if(phase==='mate')showFeedback('neutral','·','Hint 02',activeDefense.note.replace(/mating|mate/gi,'decisive'))
  else showFeedback('neutral','·','Hint','未検証の黒の防御をひとつ選んでください。')
}
function completeProblem(){showFeedback('good','★','Proof complete.','すべての代表防御にmateを確認しました。keyを「当てた」のではなく、構造を証明できています。')}

document.querySelector('#resetBtn').addEventListener('click',reset);
document.querySelector('#revealBtn').addEventListener('click',reveal);
document.querySelector('#hintBtn').addEventListener('click',hint);
document.querySelector('#flipBtn').addEventListener('click',()=>{orientation=orientation==='white'?'black':'white';render()});
render();updatePhase();
