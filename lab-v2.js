import { Chess } from './vendor/chess.js';
import { problems } from './data/problems.js';
import { kingSquare, kingCoverage, controlMap, controlRays, chooseDefence, keyRefutation, describeFailure, whiteSurvival, shadowsDefeatedBy } from './tactics.js?v=20261018-shadow2';

/* MATE / TWO 2.0 — one rules authority, one gesture controller, one animation queue.
   The board is always rendered from a legal chess.js FEN, never from decorative DOM state. */
const problem = problems[0];
// Original vector artwork keeps the same silhouette on Safari, Windows and Android.
const PIECE_ART = {
  p: '<circle cx="24" cy="12" r="5.5"/><path d="M19 19h10l-1 5c0 5 2 8 5 11H15c3-3 5-6 5-11l-1-5Z"/><path d="M15 35h18l2 6H13l2-6Z"/>',
  r: '<path d="M12 7h6v6h4V7h4v6h4V7h6v11l-5 4v12H17V22l-5-4V7Z"/><path d="M15 34h18l2 7H13l2-7Z"/><path d="M17 22h14M18 17h12" fill="none"/>',
  b: '<path d="M24 5c-3 5-10 9-10 15 0 5 4 8 10 8s10-3 10-8c0-6-7-10-10-15Z"/><path d="m26 11-5 9" fill="none"/><path d="M21 28h6l3 7H18l3-7Z"/><path d="M15 35h18l2 6H13l2-6Z"/>',
  n: '<path d="m15 7 7 3c11 0 16 11 12 25H17c1-6 6-9 11-13l-7 2-4-2-5 1-4-5 10-9-3-2Z"/><path d="M16 35h18l2 6H13l3-6Z"/><path d="m28 17-4-4M12 18l5-2" fill="none"/><circle cx="21" cy="14" r="1" fill="var(--piece-stroke)" stroke="none"/>',
  q: '<path d="m12 16 6 5 6-10 6 10 6-5-5 18H17l-5-18Z"/><circle cx="11" cy="13" r="2.5"/><circle cx="24" cy="8" r="2.5"/><circle cx="37" cy="13" r="2.5"/><path d="M17 29h14M16 34h16l3 7H13l3-7Z"/>',
  k: '<path d="M24 4v10M20 8h8" fill="none" stroke-width="2.5"/><path d="M24 17c-8-11-18-1-11 7l6 7h10l6-7c7-8-3-18-11-7Z"/><path d="M24 17v14" fill="none"/><path d="M17 31h14l2 5H15l2-5ZM15 36h18l2 5H13l2-5Z"/>'
};
const NAME = {k:'キング',q:'クイーン',r:'ルーク',b:'ビショップ',n:'ナイト',p:'ポーン'};
const PROGRESS_KEY = 'mate-two:progress:'+problem.id;
const PREFERENCES_KEY = 'mate-two:preferences';
const $ = (id) => document.getElementById(id);
const board = $('board');
const lines = $('branchLines');
const wrap = document.querySelector('.board-wrap');
const phaseTitle = $('phaseTitle');
const phaseIndex = document.querySelector('.phase-index');
const feedback = $('feedback');
const solvedCount = $('solvedCount');
const overlay = $('resultOverlay');
const branchTray = $('branchTray');
const helpText = $('helpText');
const backBtn = $('backBtn');
const showBranchesBtn = $('showBranchesBtn');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const initial = new Chess(problem.fen);
const initialFen = initial.fen();
const postKeyEngine = new Chess(initialFen);
postKeyEngine.move({from:problem.key.uci.slice(0,2),to:problem.key.uci.slice(2,4)});
const postKeyFen = postKeyEngine.fen();

const branches = postKeyEngine.moves({verbose:true}).map((move,index)=>{
  const next = new Chess(postKeyFen);
  next.move({from:move.from,to:move.to,promotion:move.promotion});
  const mateOptions = next.moves({verbose:true}).filter(candidate=>{
    const final = new Chess(next.fen());
    final.move({from:candidate.from,to:candidate.to,promotion:candidate.promotion});
    return final.isCheckmate();
  });
  if(!mateOptions.length) throw new Error('Broken #2: no mate after '+move.san);
  const known = problem.defenses.find(def=>def.black===move.from+move.to);
  const preferred = mateOptions.find(candidate=>candidate.from+candidate.to===known?.mate);
  const sameFamily = problem.defenses.find(def=>mateOptions.some(candidate=>candidate.from+candidate.to===def.mate));
  const chosen = preferred || mateOptions.find(candidate=>candidate.from+candidate.to===sameFamily?.mate) || mateOptions[0];
  return {
    id:move.from+move.to+(move.promotion||''), index, move,
    san:move.san, afterFen:next.fen(), mate:chosen, mates:mateOptions,
    label:known?.label || move.san,
    note:known?.note || sameFamily?.note || '黒の移動で変わった利き・逃げ道を確かめましょう。',
    from:move.from, to:move.to
  };
});
const solved = new Set();
const blackOrigins = [...new Set(branches.map(branch=>branch.from))];
let phase = 'key';             // key | explore | black | mate | victory | explain | review | complete
let viewFen = initialFen;
let active = null;
let completedMate = false;
let selected = null;
let legal = [];
let hover = null;
let focusFrom = null;
let gesture = null;
let busy = false;
let sequence = 0;
let hintsOn = true;
let listOpen = false;
let orientation = 'white';
let audioOn = false;
let audioContext = null;
let overlayAction = null;
let proofPlaying = false;
let cueTimer = null;
let keyboardSquare = 'g2';
const animations = new Set();
let mateProof = null;
let persistenceAvailable = true;
let explanation = null;
let failureRewindTimer = null;
let playbackStage = null;

function setPlaybackStage(stage){playbackStage=stage;document.body.dataset.playback=stage||'';}
function pauseFailureRewind(){
  clearTimeout(failureRewindTimer);failureRewindTimer=null;
  if(explanation){if(explanation.autoRewind)hideCue();explanation.autoRewind=false;}
}

function readStorage(key){
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}
function writeStorage(key,value){
  try { localStorage.setItem(key,JSON.stringify(value)); }
  catch { persistenceAvailable=false; }
}
function savePreferences(){writeStorage(PREFERENCES_KEY,{audioOn,orientation,hintsOn});}
function saveProgress(){
  // Save a legal checkpoint, never an intermediate animation frame.
  const checkpoint=phase==='black'?'mate':phase==='explain'?explanation.returnPhase:['complete','victory','review'].includes(phase)?'explore':phase;
  writeStorage(PROGRESS_KEY,{
    version:1,fen:initialFen,key:problem.key.uci,solved:[...solved],
    phase:checkpoint,active:active?.id || null,focusFrom
  });
  $('saveStatus').textContent=persistenceAvailable?'進み具合を自動保存':'保存できません · この画面では続けられます';
}
function restoreProgress(){
  const preferences=readStorage(PREFERENCES_KEY);
  audioOn=preferences?.audioOn===true;
  orientation=preferences?.orientation==='black'?'black':'white';
  hintsOn=preferences?.hintsOn!==false;
  const saved=readStorage(PROGRESS_KEY);
  if(saved?.version!==1 || saved.fen!==initialFen || saved.key!==problem.key.uci)return false;
  if(!['key','explore','mate'].includes(saved.phase) || !Array.isArray(saved.solved))return false;
  for(const id of saved.solved)if(branches.some(b=>b.id===id))solved.add(id);
  phase=saved.phase;
  focusFrom=blackOrigins.includes(saved.focusFrom)?saved.focusFrom:null;
  active=phase==='mate'?branches.find(b=>b.id===saved.active):null;
  if(phase==='mate'&&!active)phase='explore';
  if(phase==='key'){solved.clear();focusFrom=null;}
  // A completed mate resumes at the branch point, where every solved line is revisitable.
  if(active&&solved.has(active.id)){active=null;phase='explore';}
  viewFen=phase==='key'?initialFen:active?active.afterFen:postKeyFen;
  return phase!=='key';
}
function cancelGesture(){
  if(gesture){try{board.releasePointerCapture(gesture.id);}catch{}}
  gesture=null;hover=null;
}
function cancelAnimations(){for(const animation of animations)animation.cancel();animations.clear();}
// Safari may suspend Web Animations without settling animation.finished.
async function settleAnimation(animation,duration){
  let watchdog;
  try{
    const deadline=new Promise(resolve=>{
      watchdog=setTimeout(()=>resolve('timeout'),Math.max(150,Math.ceil(duration)+420));
    });
    const result=await Promise.race([
      animation.finished.then(()=> 'finished',()=> 'cancelled'),
      deadline
    ]);
    if(result==='timeout' && animation.playState!=='finished'){
      try{animation.finish();}catch{try{animation.cancel();}catch{}}
    }
    return result;
  }finally{clearTimeout(watchdog);}
}
function recoverOperation(error){
  console.error('Move operation failed',error);
  const returnPhase=explanation?.returnPhase||phase;
  ++sequence;cancelAnimations();cancelGesture();busy=false;proofPlaying=false;
  $('skipProof').hidden=true;hideCue();hideOverlay();
  pauseFailureRewind();explanation=null;setPlaybackStage(null);
  completedMate=false;lastPlayedMate=null;mateProof=null;
  if(returnPhase==='key'){phase='key';viewFen=initialFen;active=null;}
  else if(active){phase='mate';viewFen=active.afterFen;}
  else{phase='explore';viewFen=postKeyFen;}
  selected=null;legal=[];paint();
  setFeedback('局面を戻しました','もう一度操作してください。検証済みの応手は保存されています。');
  saveProgress();
}
// A backgrounded iPhone must never resume halfway through an obsolete animation.
function settleInterruptedOperation(){
  if(!busy)return;
  ++sequence;cancelAnimations();cancelGesture();pauseFailureRewind();
  busy=false;proofPlaying=false;mateProof=null;completedMate=false;lastPlayedMate=null;
  $('skipProof').hidden=true;hideCue();hideOverlay();explanation=null;setPlaybackStage(null);
  if(phase==='victory'||phase==='review'){
    phase=solved.size===branches.length?'complete':'explore';
    active=null;focusFrom=null;viewFen=postKeyFen;
  }else if(phase==='black'){
    phase='explore';active=null;viewFen=postKeyFen;
  }else if(phase==='explain'){
    phase=active?'mate':'key';viewFen=active?active.afterFen:initialFen;
  }else if(phase==='mate'){
    viewFen=active?active.afterFen:postKeyFen;
  }else if(phase==='key'){
    viewFen=initialFen;
  }else{
    phase='explore';active=null;viewFen=postKeyFen;
  }
  selected=null;legal=[];hover=null;paint();
  setFeedback('盤面を安全な局面へ復帰','中断したアニメーションを取り消しました。続きから操作できます。');
  saveProgress();
}
function run(action){Promise.resolve().then(action).catch(recoverOperation);}

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function valid(token){return token===sequence;}
function moveSpec(m){return {from:m.from,to:m.to,...(m.promotion?{promotion:m.promotion}:{})};}
function squareAt(x,y){
  const element = document.elementFromPoint(x,y)?.closest?.('.square');
  return element && board.contains(element) ? element.dataset.square : null;
}
function engine(){return new Chess(viewFen);}
function legalFrom(from){try{return engine().moves({square:from,verbose:true});}catch{return [];}}
function targetMove(to){return legal.find(m=>m.to===to);}
function clearSelection(){selected=null;legal=[];hover=null;updateGuides();}
function setFeedback(title,detail,kind='neutral'){
  feedback.className='feedback '+kind;
  feedback.querySelector('strong').textContent=title;
  feedback.querySelector('span').textContent=detail;
  feedback.querySelector('.feedback-icon').textContent=kind==='good'?'✓':kind==='bad'?'×':'◇';
}
function cue(title,detail='',kind='neutral',duration=0){
  clearTimeout(cueTimer);
  const el=$('boardCue');
  el.innerHTML='';
  const main=document.createElement('strong');main.textContent=title;
  const sub=document.createElement('span');sub.textContent=detail;
  el.append(main,sub);
  el.className='board-cue visible '+kind;
  if(duration) {
    cueTimer=setTimeout(()=>el.classList.remove('visible'),duration);
  }
}
function hideCue(){clearTimeout(cueTimer);$('boardCue').classList.remove('visible');}
function hideOverlay(){
  if(document.activeElement===overlay)board.focus({preventScroll:true});
  overlay.classList.remove('visible');overlay.hidden=true;overlayAction=null;
}
function showOverlay(title,detail,action,kind='mate'){
  $('resultTitle').textContent=title;
  $('resultDetail').textContent=detail;
  $('resultAction').textContent=action;
  overlay.className='result-overlay visible '+kind;
  overlay.hidden=false;
  overlay.setAttribute('aria-label',title+'。'+detail+'。'+action);
  overlay.focus({preventScroll:true});
}
function squareElement(sq){return board.querySelector('[data-square="'+sq+'"]');}
function rankFiles(){
  const ranks = orientation==='white'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const files = orientation==='white'?'abcdefgh':'hgfedcba';
  return ranks.flatMap(rank=>[...files].map(file=>file+rank));
}
function updateGuides(){
  const hintOrigins=new Set(phase==='key'?[problem.key.uci.slice(0,2)]:phase==='mate'&&active?active.mates.map(m=>m.from):[]);
  board.querySelectorAll('.square').forEach(el=>{
    const sq=el.dataset.square;
    const possible=targetMove(sq);
    el.classList.toggle('selected',sq===selected);
    el.classList.toggle('legal',!!possible);
    el.classList.toggle('capture-target',!!possible?.captured);
    el.classList.toggle('hover-target',sq===hover && !!possible);
    el.classList.toggle('last',!!(active && phase==='mate' && (sq===active.to || sq===active.from)));
    el.classList.toggle('hint-origin',hintsOn && !busy && hintOrigins.has(sq));
    if(el.getAttribute('role')==='button')el.setAttribute('aria-pressed',String(sq===selected));
    else el.removeAttribute('aria-pressed');
  });
}
function makePiece(type,color){
  const el=document.createElement('span');
  el.className='piece piece-'+type+' '+(color==='w'?'white':'black');
  el.setAttribute('aria-hidden','true');
  el.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="var(--piece-fill)" stroke="var(--piece-stroke)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+PIECE_ART[type]+'</svg>';
  return el;
}
function renderBoard(){
  const position=engine();
  const hadFocus=board.contains(document.activeElement);
  board.innerHTML='';
  rankFiles().forEach(sq=>{
    const el=document.createElement('div');
    const file=sq.charCodeAt(0)-97;
    const rank=Number(sq[1]);
    el.className='square '+((file+rank)%2?'light':'dark');
    el.dataset.square=sq;
    const piece=position.get(sq);
    if(piece) el.append(makePiece(piece.type,piece.color));
    if((orientation==='white'&&rank===1)||(orientation==='black'&&rank===8)){
      const coord=document.createElement('span');
      coord.className='coord file';coord.textContent=sq[0];el.append(coord);
    }
    if((orientation==='white'&&sq[0]==='a')||(orientation==='black'&&sq[0]==='h')){
      const coord=document.createElement('span');
      coord.className='coord rank';coord.textContent=sq[1];el.append(coord);
    }
    if(piece && piece.type==='k'){
      const identity=document.createElement('span');
      identity.className='king-identity '+(piece.color==='w'?'white-king':'black-king');
      identity.textContent=piece.color==='w'?'白王':'黒王';
      identity.setAttribute('aria-hidden','true');
      el.classList.add('king-square',piece.color==='w'?'king-white':'king-black');
      el.append(identity);
    }
    el.setAttribute('aria-label',sq+' '+(piece?(piece.color==='w'?'白':'黒')+NAME[piece.type]:'空きマス'));
    el.setAttribute('role','button');
    el.tabIndex=sq===keyboardSquare?0:-1;
    board.append(el);
  });
  updateGuides();
  if(phase==='explore'||phase==='complete')renderGhosts();
  else{
    if(active&&['black','mate','explain','victory'].includes(phase))renderResidues();
    drawExplanation();
  }
  if(hadFocus)squareElement(keyboardSquare)?.focus({preventScroll:true});
}
function renderGhosts(){
  lines.replaceChildren();
  board.querySelectorAll('.ghost-target,.branch-origin-count').forEach(el=>el.remove());
  board.querySelectorAll('.square').forEach(el=>{
    el.classList.remove('branch-origin','branch-origin-active','branch-origin-done');
    el.setAttribute('role','button');el.setAttribute('aria-pressed','false');
    const piece=postKeyEngine.get(el.dataset.square);
    el.setAttribute('aria-label',el.dataset.square+' '+(piece?(piece.color==='w'?'白':'黒')+NAME[piece.type]:'空きマス'));
  });
  for(const from of blackOrigins){
    const square=squareElement(from),options=branches.filter(b=>b.from===from);
    const remaining=options.filter(b=>!solved.has(b.id)).length;
    square.classList.add('branch-origin');
    square.classList.toggle('branch-origin-active',focusFrom===from);
    square.classList.toggle('branch-origin-done',remaining===0);
    square.setAttribute('aria-label','黒'+NAME[postKeyEngine.get(from).type]+' '+from+' 残り'+remaining+'手');
    const counter=document.createElement('span');counter.className='branch-origin-count';
    counter.textContent=remaining?String(remaining):'✓';square.append(counter);
  }
  if(!focusFrom)return;
  for(const branch of branches.filter(b=>b.from===focusFrom&&!solved.has(b.id))){
    const host=squareElement(branch.to),button=document.createElement('button');
    button.type='button';button.className='ghost-target shadow-choice';
    if(postKeyEngine.get(branch.to)?.color==='w'){
      button.classList.add('shadow-capture');
      const mark=document.createElement('span');mark.className='shadow-capture-mark';mark.textContent='×';mark.setAttribute('aria-hidden','true');button.append(mark);
    }
    button.dataset.branch=branch.id;button.disabled=busy;
    button.setAttribute('aria-label','黒 '+branch.san+' のシャドーを攻略');
    button.append(makePiece(postKeyEngine.get(branch.from).type,'b'));
    button.addEventListener('click',event=>{event.stopPropagation();if(!busy)run(()=>openBranch(branch));});
    host.setAttribute('role','group');host.removeAttribute('aria-pressed');
    host.setAttribute('aria-label',branch.to+' 黒の候補 '+branch.san);host.append(button);
  }
}
function renderResidues(){
  for(const branch of branches.filter(b=>b.from===focusFrom&&b.id!==active?.id&&!solved.has(b.id))){
    const ghost=document.createElement('span');
    ghost.className='ghost-target ghost-residue';ghost.dataset.branch=branch.id;
    ghost.setAttribute('aria-hidden','true');ghost.append(makePiece(postKeyEngine.get(branch.from).type,'b'));
    squareElement(branch.to)?.append(ghost);
  }
}
function clearAnalysisMarks(){
  lines.replaceChildren();$('boardLegend').hidden=true;
  board.querySelectorAll('.square').forEach(el=>{
    el.classList.remove('analysis-king','analysis-controlled','analysis-escape','analysis-blocked','analysis-black','analysis-source','analysis-move-from','analysis-move-to','analysis-safe');
    el.querySelectorAll('.analysis-cell-mark').forEach(mark=>mark.remove());
  });
}
function drawExplanation(){
  clearAnalysisMarks();
  const showingMate=phase==='victory'&&mateProof;
  board.classList.toggle('showing-mate-proof',!!showingMate);
  if(!showingMate && (phase!=='explain'||!explanation||explanation.mode==='none'))return;
  const e=showingMate?{mode:'mate-proof'}:explanation,position=engine();
  const arrows=[];
  const mark=(square,type,label)=>{
    const host=squareElement(square);if(!host)return;
    host.classList.add(type);
    if(label){const tag=document.createElement('span');tag.className='analysis-cell-mark';tag.textContent=label;host.append(tag);}
  };
  if(e.mode==='mate-proof'){
    const data=kingCoverage(position,'b');
    mark(data.king,'analysis-king','詰');
    for(const cell of data.cells){
      if(cell.kind==='occupied')mark(cell.square,'analysis-blocked','塞');
      else if(cell.kind==='controlled'){
        mark(cell.square,'analysis-controlled','×');
        for(const from of cell.attackers){
          if(position.get(from))arrows.push({from,to:cell.square,color:'w',kind:'control',knight:position.get(from).type==='n'});
        }
      }else mark(cell.square,'analysis-escape','逃');
    }
    for(const from of data.checkers){
      if(position.get(from))arrows.push({from,to:data.king,color:'w',kind:'check',knight:position.get(from).type==='n'});
    }
    $('boardLegend').textContent='CHECKMATE · 王手 '+data.checkers.length+' / 王の逃げ道 '+data.escapes.length+' / 黒の合法応手 0。緑の矢印は白の利き、「×」は押さえられたマス、「塞」は黒自身の駒です。';
  }else if(e.mode==='response'){
    if(e.reply){arrows.push({from:e.reply.from,to:e.reply.to,color:'b',kind:'response',knight:e.reply.piece==='n'});mark(e.reply.from,'analysis-move-from');mark(e.reply.to,'analysis-move-to');}
    $('boardLegend').textContent='赤い矢印：黒の実際の応手';
  }else if(e.mode==='black'){
    const map=controlMap(position,'b',e.focusBlack);
    map.forEach(cell=>mark(cell.square,'analysis-black'));
    arrows.push(...controlRays(position,'b',e.focusBlack));
    for(const square of 'abcdefgh'.split('').flatMap(file=>[1,2,3,4,5,6,7,8].map(rank=>file+rank)))if(position.get(square)?.color==='b')squareElement(square)?.classList.add('analysis-source');
    $('boardLegend').textContent=e.focusBlack?'黒 '+e.focusBlack+' の利き · 同じ駒でもう一度タップで全体へ':'赤いマス：黒の利き · 黒駒をタップすると絞り込み';
  }else{
    const survival=e.mode==='survival'&&e.survival;
    const data=kingCoverage(position,survival?'w':e.description.coverage.color),enemy=data.color==='b'?'w':'b';
    mark(data.king,'analysis-king');
    for(const cell of data.cells){
      if(cell.kind==='escape')mark(cell.square,'analysis-escape','逃');
      else if(cell.kind==='occupied')mark(cell.square,'analysis-blocked','塞');
      else{mark(cell.square,'analysis-controlled');cell.attackers.forEach(from=>arrows.push({from,to:cell.square,color:enemy,kind:'control',knight:position.get(from)?.type==='n'}));}
    }
    data.checkers.forEach(from=>arrows.push({from,to:data.king,color:enemy,kind:'check',knight:position.get(from)?.type==='n'}));
    if(survival){
      arrows.push({from:survival.move.from,to:survival.move.to,color:'w',kind:'survival',knight:survival.move.piece==='n'});
      mark(survival.move.to,'analysis-safe','受');
      $('boardLegend').textContent='緑の矢印：白の逃げ・受けの一例 · 赤：黒の利き · 青「逃」：白王の逃げ先';
    }else $('boardLegend').textContent=data.color==='b'?'青「逃」：黒王の逃げ先 · 緑：白の利き ·「塞」：自駒':'赤：黒の王手・利き ·「塞」：白の自駒';
  }
  $('boardLegend').hidden=false;
  const bounds=board.getBoundingClientRect();if(!bounds.width)return;
  const ns='http://www.w3.org/2000/svg';
  lines.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
  const defs=document.createElementNS(ns,'defs');
  for(const [color,fill] of [['w','#e5f7a7'],['b','#f4a38b']]){
    const marker=document.createElementNS(ns,'marker');marker.id='analysis-arrow-'+color;marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','8');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','4');marker.setAttribute('markerHeight','4');marker.setAttribute('orient','auto');
    const path=document.createElementNS(ns,'path');path.setAttribute('d','M 0 0 L 10 5 L 0 10 z');path.setAttribute('fill',fill);marker.append(path);defs.append(marker);
  }
  lines.append(defs);
  const seen=new Set();
  for(const arrow of arrows){
    if(arrow.from===arrow.to)continue;
    const key=arrow.from+arrow.to+arrow.kind;if(seen.has(key))continue;seen.add(key);
    const a=squareElement(arrow.from)?.getBoundingClientRect(),z=squareElement(arrow.to)?.getBoundingClientRect();if(!a||!z)continue;
    const x=a.left-bounds.left+a.width/2,y=a.top-bounds.top+a.height/2,xx=z.left-bounds.left+z.width/2,yy=z.top-bounds.top+z.height/2;
    const dx=xx-x,dy=yy-y,len=Math.hypot(dx,dy)||1,pad=Math.min(z.width*.2,len*.18);
    const endX=xx-dx/len*pad,endY=yy-dy/len*pad;
    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',arrow.knight?'M '+x+' '+y+' L '+(Math.abs(dx)>Math.abs(dy)?endX:x)+' '+(Math.abs(dx)>Math.abs(dy)?y:endY)+' L '+endX+' '+endY:'M '+x+' '+y+' L '+endX+' '+endY);
    path.setAttribute('marker-end','url(#analysis-arrow-'+arrow.color+')');
    path.classList.add('analysis-arrow',arrow.color==='b'?'black-control':'white-control',arrow.kind);
    path.dataset.from=arrow.from;path.dataset.to=arrow.to;path.dataset.color=arrow.color;
    lines.append(path);
  }
}
function setBlackFocus(from){
  if(busy || !['explore','complete'].includes(phase) || !blackOrigins.includes(from))return;
  phase='explore';
  hideCue();
  focusFrom=focusFrom===from?null:from;
  renderGhosts();
  renderUI();
  updateGuides();
  if(focusFrom){
    const options=branches.filter(b=>b.from===focusFrom);
    const completed=options.filter(b=>solved.has(b.id)).length;
    const piece=postKeyEngine.get(focusFrom);
    setFeedback('黒の '+NAME[piece.type]+' のシャドー','残り '+(options.length-completed)+' 体。半透明の黒いシャドーを1つ選んで攻略しましょう。');
  }else{
    setFeedback('どの黒駒から検証しますか？','印の付いた黒駒をタップして、可能な応手を表示します。');
  }
  saveProgress();
}
function renderTray(){
  branchTray.replaceChildren();
  branchTray.classList.toggle('open',listOpen && (phase==='explore'||phase==='mate'||phase==='complete'));
  branches.forEach(b=>{
    const button=document.createElement('button');
    button.className='branch-chip'+(solved.has(b.id)?' done':'')+(active?.id===b.id?' active':'');
    button.dataset.branch=b.id;
    button.textContent=(solved.has(b.id)?'✓ ':'')+'…'+b.san;
    button.type='button';
    button.disabled=busy||!overlay.hidden;
    button.setAttribute('aria-label','黒 '+b.san+(solved.has(b.id)?' 検証済み':' を検証'));
    if(active?.id===b.id)button.setAttribute('aria-current','true');
    button.addEventListener('click',()=>{if(!busy)run(()=>openBranch(b));});
    branchTray.append(button);
  });
}
function renderUI(){
  document.body.dataset.phase=phase;document.body.dataset.busy=String(busy);
  board.setAttribute('aria-busy',String(busy));
  const total=branches.length;
  solvedCount.textContent=solved.size+' / '+total;
  $('branchCount').textContent='残り '+(total-solved.size)+' 体';
  $('progressBar').style.width=(solved.size/total*100)+'%';
  $('progressTrack').setAttribute('aria-valuenow',String(solved.size));
  $('progressTrack').setAttribute('aria-valuemax',String(total));
  const step=phase==='key'||phase==='explain'&&explanation?.returnPhase==='key'?'key':['explore','black'].includes(phase)?'explore':'mate';
  const stepNames=['key','explore','mate'];
  document.querySelectorAll('.phase-steps li').forEach(el=>{
    if(el.dataset.step===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
    el.classList.toggle('done',stepNames.indexOf(el.dataset.step)<stepNames.indexOf(step));
  });
  const phases={
    key:['01','FIND THE KEY','白の初手を探しましょう','駒 → 移動先の順にタップ。スライドでも動かせます。'],
    explore:['02','CHOOSE A SHADOW','攻略するシャドーを選ぶ',focusFrom?'半透明の黒駒を選ぶと、その手だけが実体化します。':'印のある黒駒をタップ。攻略したシャドーは消えていきます。'],
    black:['02','BLACK TO MOVE','黒の '+(active?.san||'応手')+' を確認','ほかの候補は薄い点線で残ります。'],
    mate:['03','DEFEAT THE SHADOW','白の一手でシャドーを攻略',hintsOn?'光る駒は詰みにつながる白駒。移動先を考えましょう。':'白駒を動かして詰みを探しましょう。「応手へ」で戻れます。'],
    victory:['✓','CHECKMATE','シャドーを攻略しました','同じ一手で詰むシャドーをまとめて撃破。余韻のあと巻き戻します。'],
    explain:['!','READ THE REFUTATION','黒の応手と白の受けを確認',explanation?.autoRewind?'このあと自動で巻き戻し。盤面タップや「止めて読む」で停止できます。':'解説は停止中。表示を切り替えて、納得してからもう一度。'],
    review:['↻','PROOF REVIEW','すべての詰みを振り返る','黒の応手と白の詰みを順に再生しています。'],
    complete:['✓','ALL SHADOWS CLEARED','すべてのシャドーを攻略','全13手に詰みを証明しました。応手一覧から見直せます。']
  };
  const info=phases[phase];phaseIndex.textContent=info[0];$('phaseLabel').textContent=info[1];phaseTitle.textContent=info[2];helpText.textContent=info[3];
  backBtn.hidden=phase!=='mate';backBtn.disabled=busy;
  showBranchesBtn.hidden=['key','explain','black','victory','review'].includes(phase);
  showBranchesBtn.textContent=listOpen?'一覧を閉じる':'応手一覧';showBranchesBtn.setAttribute('aria-expanded',String(listOpen));
  $('soundBtn').setAttribute('aria-pressed',String(audioOn));$('soundBtn').setAttribute('aria-label','効果音 '+(audioOn?'オン':'オフ'));
  $('flipBtn').setAttribute('aria-pressed',String(orientation==='black'));$('flipBtn').disabled=busy;
  $('hintToggle').setAttribute('aria-pressed',String(hintsOn));$('hintToggle').textContent='✧ 駒ヒント '+(hintsOn?'ON':'OFF');
  const locked=busy||!overlay.hidden;
  $('hintToggle').disabled=locked;showBranchesBtn.disabled=locked;
  $('strategyBtn').hidden=phase==='explain';$('strategyBtn').disabled=locked;
  $('revealBtn').hidden=phase==='explain';$('revealBtn').disabled=locked;
  $('revealBtn').textContent=phase==='key'?'初手を見る ↗':phase==='mate'?'詰みを見る ↗':solved.size===total?'全手順を再生 ↗':'次のシャドーへ ↗';
  if(locked)board.querySelectorAll('button.ghost-target').forEach(el=>{el.disabled=true;});
  $('explanationPanel').hidden=phase!=='explain';
  if(explanation&&phase==='explain'){
    const e=explanation;
    for(const [id,mode] of [['responseViewBtn','response'],['coverageViewBtn','coverage'],['blackControlBtn','black'],['survivalViewBtn','survival']]){
      $(id).setAttribute('aria-pressed',String(e.mode===mode));$(id).disabled=busy||(mode==='response'&&!e.reply)||(mode==='survival'&&!e.survival);
    }
    $('coverageViewBtn').textContent=e.description.coverage.color==='w'?'② 白王の包囲':'② 黒王の逃げ道';
    $('retryBtn').disabled=busy;
    $('pauseExplanationBtn').disabled=busy||!e.autoRewind;
    $('pauseExplanationBtn').textContent=e.autoRewind?'Ⅱ 止めて読む':'Ⅱ 解説は停止中';
    $('explanationDetail').textContent=e.mode==='survival'&&e.survival?'黒 '+e.reply.san+' → 白 '+e.survival.move.san+'。'+(e.survival.wasCheck?'白は王手を外せます。':'白にも合法な応手があります。')+'黒の強い応手に対し、白がしのぐ一例です。':e.mode==='response'?(e.reply?'黒 '+e.reply.san+'：'+e.reply.from+' → '+e.reply.to+'。赤い矢印が実際の応手です。':'黒の合法な応手がありません。'):e.mode==='black'?(e.focusBlack?'黒 '+e.focusBlack+' の利きを表示中。もう一度タップすると黒全体に戻ります。':'赤いマスと各方向の矢印が、周囲の黒駒も含めた利きです。黒駒をタップして絞れます。'):'「逃」は王が合法に移動できるマス。「塞」は自分の駒でふさがったマス。矢印は逃げ先を押さえる利きです。';
  }
  renderTray();
}
function setPosition(fen){
  viewFen=fen;
  renderBoard();
}
function paint(){
  renderBoard();
  renderUI();
}
function primeAudio(){
  if(!audioOn)return;
  try{
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A)return;
    audioContext ||= new A();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  }catch{}
}
function tone(freq,duration=0.06,volume=.035,type='triangle'){
  if(!audioOn||!audioContext||audioContext.state!=='running')return;
  const t=audioContext.currentTime;
  const osc=audioContext.createOscillator(), gain=audioContext.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,t);
  osc.frequency.exponentialRampToValueAtTime(freq*.78,t+duration);
  gain.gain.setValueAtTime(volume,t);
  gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.connect(gain);gain.connect(audioContext.destination);
  osc.start(t);osc.stop(t+duration+.008);
}
function sound(kind){
  if(kind==='capture'){
    tone(740,.095,.05,'sawtooth');
    setTimeout(()=>tone(270,.12,.04,'triangle'),35);
  }else if(kind==='mate'){
    tone(660,.11,.035);setTimeout(()=>tone(990,.14,.035),100);
  }else if(kind==='error'){
    tone(260,.12,.025);
  }else{
    tone(490,.065,.032);
  }
}
function burst(square,token){
  if(!valid(token))return;
  const host=squareElement(square);
  if(!host)return;
  const effect=document.createElement('span');
  effect.className='capture-burst';
  for(let i=0;i<6;i++){
    const flake=document.createElement('i');
    flake.style.setProperty('--a',(i*60)+'deg');
    effect.append(flake);
  }
  host.append(effect);
  setTimeout(()=>effect.remove(),370);
}
async function animatedMove(from,to,afterFen,{capture=false,duration=290,reverse=false,quiet=false}={},token=sequence){
  if(!valid(token))return false;
  if(reduceMotion.matches){
    setPosition(afterFen);
    if(!quiet)sound(capture&&!reverse?'capture':'move');
    return true;
  }
  const origin=squareElement(from),destination=squareElement(to);
  const piece=origin?.querySelector('.piece');
  if(!origin||!destination||!piece){
    if(valid(token))setPosition(afterFen);
    return valid(token);
  }
  const a=origin.getBoundingClientRect(),b=destination.getBoundingClientRect();
  const boardRect=board.getBoundingClientRect();
  const sprite=document.createElement('div');
  sprite.className='move-sprite'+(reverse?' reverse':'');
  sprite.style.left=(a.left-boardRect.left)+'px';
  sprite.style.top=(a.top-boardRect.top)+'px';
  sprite.style.width=a.width+'px';
  sprite.style.height=a.height+'px';
  sprite.append(piece.cloneNode(true));
  board.append(sprite);
  piece.style.visibility='hidden';
  const ms=duration;
  const dx=b.left-a.left,dy=b.top-a.top;
  try{
    const animation=sprite.animate([
      {transform:'translate3d(0,0,0) scale(1)',offset:0},
      {transform:'translate3d('+(dx*.52)+'px,'+(dy*.52)+'px,0) scale(1.09)',offset:.52},
      {transform:'translate3d('+dx+'px,'+dy+'px,0) scale(1)',offset:1}
    ],{duration:ms,easing:'cubic-bezier(.24,.75,.22,1)',fill:'forwards'});
    animations.add(animation);
    animation.finished.then(()=>animations.delete(animation),()=>animations.delete(animation));
    if(capture && !reverse){
      await wait(ms*.7);
      if(valid(token)){burst(to,token);if(!quiet)sound('capture');}
      await settleAnimation(animation,ms);
    }else{
      await settleAnimation(animation,ms);
      if(valid(token)&&!quiet)sound('move');
    }
  }catch{
    await wait(ms);
  }finally{
    sprite.remove();
    piece.style.visibility='';
  }
  if(!valid(token))return false;
  setPosition(afterFen);
  return true;
}
async function transitionMove(beforeFen,move,{duration=290,quiet=false}={},token=sequence){
  const before=new Chess(beforeFen);
  const target=before.get(move.to);
  const after=new Chess(beforeFen);
  after.move(moveSpec(move));
  setPosition(beforeFen);
  const ok=await animatedMove(move.from,move.to,after.fen(),{capture:!!target,duration,quiet},token);
  return ok?after.fen():null;
}
async function rewindMove(beforeFen,move,afterFen,token=sequence,duration=390){
  if(!valid(token))return;
  setPosition(afterFen);
  await animatedMove(move.to,move.from,beforeFen,{reverse:true,duration,quiet:true},token);
}
function ensureBoardVisible(){
  // On short iPhone viewports, controls may sit below the board. Bring the
  // whole board back into view before measuring or animating the next move.
  const rect=wrap.getBoundingClientRect();
  const visibleTop=window.visualViewport?.offsetTop || 0;
  const visibleBottom=visibleTop+(window.visualViewport?.height || window.innerHeight);
  if(rect.top<visibleTop || rect.bottom>visibleBottom)wrap.scrollIntoView({block:'center',behavior:'auto'});
}
function newOperation(){
  sequence+=1;
  cancelGesture();ensureBoardVisible();
  busy=true;
  clearSelection();
  hideOverlay();
  hideCue();
  renderUI();
  return sequence;
}
function endOperation(token){
  if(!valid(token))return;
  busy=false;
  updateGuides();renderUI();
  saveProgress();
}
async function attemptWhite(move){
  if(busy||!move||completedMate||!['key','mate'].includes(phase))return;
  primeAudio();
  const returnPhase=phase,before=viewFen,token=newOperation();
  const played=await transitionMove(before,move,{duration:445},token);
  if(!played||!valid(token))return;
  await wait(reduceMotion.matches?60:220);if(!valid(token))return;
  if(returnPhase==='key'&&move.from+move.to===problem.key.uci){
    phase='explore';active=null;completedMate=false;focusFrom=null;
    setPosition(postKeyFen);
    cue('KEY FOUND ✓','黒駒 → シャドーの順に選んで攻略','key',1350);
    setFeedback('初手を発見。シャドー攻略へ','印の付いた黒駒を選ぶと、その駒の移動先にシャドーが現れます。','good');
    sound('mate');endOperation(token);paint();return;
  }
  if(returnPhase==='mate'&&new Chess(played).isCheckmate()){
    const defeated=shadowsDefeatedBy(branches,move).filter(b=>!solved.has(b.id));
    completedMate=true;lastPlayedMate=move;
    for(const branch of defeated)solved.add(branch.id);
    phase='victory';saveProgress();renderUI();
    setFeedback(defeated.length>1?'同じ一手で'+defeated.length+'体を一括撃破 ✓':'シャドーを攻略 ✓',move.san+' で詰み。破壊の余韻のあと、駒を元の位置へ巻き戻します。','good');
    cue('CHECKMATE ✓',defeated.length>1?'同じ '+move.san+' で '+defeated.length+' 体を一括撃破':'このシャドーを攻略しました','key');sound('mate');
    const king=kingSquare(new Chess(played),'b');
    squareElement(king)?.classList.add('mate-impact');
    // A real checkmate has no legal Black response; explain it rather than
    // manufacturing an impossible King escape animation.
    mateProof=true;
    drawExplanation();
    setPlaybackStage('mate-proof');
    const coverage=kingCoverage(new Chess(played),'b');
    setFeedback('CHECKMATE · 黒は一手も指せません',
      '王手 '+coverage.checkers.length+'、黒王の合法な逃げ道 '+coverage.escapes.length+'。緑の矢印と「×」「塞」で詰みの理由を確認できます。','good');
    cue('CHECKMATE','黒の合法応手 0 · 王手と逃げ道を確認','key');
    await wait(reduceMotion.matches?450:1550);if(!valid(token))return;
    mateProof=null;drawExplanation();
    await shadowDefeat([active,...defeated.filter(b=>b.id!==active.id)],move,token);if(!valid(token))return;
    setPlaybackStage('hold');
    await wait(reduceMotion.matches?180:520);if(!valid(token))return;
    await rewindBranch(token,{defeated});return;
  }
  const position=new Chess(played);
  const trial=problem.tries.find(trial=>trial.uci===move.from+move.to);
  const reply=returnPhase==='key'?keyRefutation(position,trial?.refutation):chooseDefence(position);
  await presentFailure({beforeFen:before,move,playedFen:played,reply,returnPhase},token);
}
async function presentFailure(data,token){
  const after=new Chess(data.playedFen);if(data.reply)after.move(moveSpec(data.reply));
  explanation={...data,afterFen:after.fen(),mode:'response',focusBlack:null,survival:data.reply?whiteSurvival(after):null,autoRewind:true};
  explanation.description=describeFailure(data.playedFen,data.reply,after.fen(),data.returnPhase);
  phase='explain';sound('error');renderUI();drawExplanation();
  setFeedback(data.reply?'黒の応手を確認しましょう':'この局面は詰みではありません',data.reply?'黒 '+data.reply.san+' を盤上で再生します。':explanation.description.detail,'bad');
  if(data.reply){
    cue('黒の応手','…'+data.reply.san,'bad');
    await wait(reduceMotion.matches?90:550);if(!valid(token))return;
    const result=await transitionMove(data.playedFen,data.reply,{duration:680},token);
    if(!result||!valid(token))return;
    await wait(reduceMotion.matches?100:350);if(!valid(token))return;
  }
  if(explanation.survival){
    explanation.mode='survival';renderUI();
    cue('白の逃げ・受け',explanation.survival.move.san+' でしのぐ一例');
    await wait(reduceMotion.matches?90:430);if(!valid(token))return;
    const result=await transitionMove(explanation.afterFen,explanation.survival.move,{duration:650},token);
    if(!result||!valid(token))return;
  }else{explanation.mode='coverage';setPosition(explanation.afterFen);}
  hideCue();
  setFeedback(explanation.description.title,explanation.description.detail,'bad');
  endOperation(token);paint();
  if(document.hidden){pauseFailureRewind();renderUI();return;}
  cue(explanation.survival?'黒 '+data.reply.san+' → 白 '+explanation.survival.move.san:'黒の反証','盤面タップで止めて読む · このあと巻き戻し','black');
  const lesson=explanation;
  failureRewindTimer=setTimeout(()=>{
    failureRewindTimer=null;
    if(valid(token)&&phase==='explain'&&explanation===lesson&&lesson.autoRewind&&!busy)run(retryAttempt);
  },3800);
}
function explanationView(mode){
  if(busy||phase!=='explain'||!explanation)return;
  pauseFailureRewind();
  if(mode==='response'){run(replayResponse);return;}
  if(mode==='survival'){run(replaySurvival);return;}
  explanation.mode=mode;explanation.focusBlack=null;
  setPosition(explanation.afterFen);renderUI();ensureBoardVisible();
}
async function replayResponse(){
  if(busy||!explanation||!explanation.reply)return;
  const e=explanation,token=newOperation();e.mode='response';
  setPosition(e.playedFen);renderUI();
  await wait(reduceMotion.matches?140:650);if(!valid(token))return;
  const result=await transitionMove(e.playedFen,e.reply,{duration:750},token);
  if(!result||!valid(token))return;
  endOperation(token);
}
async function replaySurvival(){
  if(busy||!explanation?.survival)return;
  const e=explanation,token=newOperation();e.mode='survival';
  setPosition(e.afterFen);renderUI();
  await wait(reduceMotion.matches?120:480);if(!valid(token))return;
  const result=await transitionMove(e.afterFen,e.survival.move,{duration:700},token);
  if(!result||!valid(token))return;
  endOperation(token);
}
async function retryAttempt(){
  if(busy||!explanation)return;
  pauseFailureRewind();
  const e=explanation,token=newOperation();e.mode='none';clearAnalysisMarks();renderUI();
  cue('TRY BROKEN','この手では詰ませられません','bad');
  const attempted=new Chess(e.playedFen).get(e.move.to);
  const echo=effectSprite(e.move.to,attempted,'attempt-defeated');
  const real=squareElement(e.move.to)?.querySelector(':scope > .piece');
  if(real&&engine().get(e.move.to)?.color==='w'&&engine().get(e.move.to)?.type===attempted.type)real.style.visibility='hidden';
  setPlaybackStage('shatter');
  try{await shatterSprite(echo,e.move.to,token,'failure');}
  finally{echo?.remove();if(real&&!valid(token))real.style.visibility='';}
  if(!valid(token))return;
  setPlaybackStage('hold');
  await wait(reduceMotion.matches?180:520);if(!valid(token))return;
  setPlaybackStage('rewind');cue('REWIND','元の局面でもう一度');
  if(e.survival&&viewFen===e.survival.fen){await rewindMove(e.afterFen,e.survival.move,e.survival.fen,token);if(!valid(token))return;}
  if(e.reply){await rewindMove(e.playedFen,e.reply,e.afterFen,token);if(!valid(token))return;}
  await rewindMove(e.beforeFen,e.move,e.playedFen,token);if(!valid(token))return;
  phase=e.returnPhase;explanation=null;
  setPlaybackStage(null);hideCue();setPosition(e.beforeFen);
  setFeedback(phase==='key'?'初手をもう一度考えましょう':'このシャドーにもう一度挑戦',hintsOn?'光っている白駒が、正解の手を持っています。':'白駒と移動先をタップして着手できます。');
  endOperation(token);paint();
}
async function openBranch(branch){
  if(busy||!branch||phase==='explain')return;
  primeAudio();
  if(phase==='mate'||phase==='complete'){
    const expectedSequence=sequence+(active?1:0);
    await returnToExplore();if(busy||sequence!==expectedSequence)return;
  }
  if(phase!=='explore')return;
  const token=newOperation();focusFrom=branch.from;explanation=null;
  phase='black';active=branch;completedMate=false;lastPlayedMate=null;
  saveProgress();renderUI();setPosition(postKeyFen);
  cue('SHADOW SELECTED','黒 …'+branch.san,'black');
  await wait(reduceMotion.matches?45:250);if(!valid(token))return;
  const result=await transitionMove(postKeyFen,branch.move,{duration:640},token);
  if(!result||!valid(token))return;
  await wait(reduceMotion.matches?70:250);if(!valid(token))return;
  phase='mate';hideCue();
  setFeedback('黒 '+branch.san+' のシャドーに挑戦',hintsOn?'光る白駒を選び、詰みの一手を探しましょう。ほかの候補は薄い点線で残しています。':'白の2手目で詰ませましょう。ほかの候補は薄い点線で残しています。');
  endOperation(token);paint();
}
function effectSprite(square,piece,className){
  if(!piece)return null;
  const host=squareElement(square);if(!host)return null;
  const a=host.getBoundingClientRect(),bounds=board.getBoundingClientRect();
  const sprite=document.createElement('span');sprite.className='move-sprite '+className;sprite.setAttribute('aria-hidden','true');
  Object.assign(sprite.style,{left:(a.left-bounds.left)+'px',top:(a.top-bounds.top)+'px',width:a.width+'px',height:a.height+'px'});
  sprite.append(makePiece(piece.type,piece.color));board.append(sprite);return sprite;
}
async function shatterSprite(sprite,square,token,tone='victory'){
  if(!sprite||!valid(token))return;
  sprite.classList.add('shatter-'+tone);
  if(reduceMotion.matches){sprite.style.opacity='.35';await wait(110);return;}
  await effectAnimation(sprite,[{filter:'brightness(1)'},{filter:'brightness(2.1)',transform:'scale(1.1)'}],150,token);
  if(!valid(token))return;
  const piece=sprite.querySelector(':scope > .piece');
  // Six clipped copies preserve the silhouette as the piece breaks apart.
  const tasks=[];
  for(let i=0;i<6;i++){
    const x=i%2,y=Math.floor(i/2),fragment=document.createElement('span');
    fragment.className='shatter-fragment';
    fragment.style.clipPath='polygon('+x*50+'% '+y*100/3+'%, '+(x+1)*50+'% '+y*100/3+'%, '+(x+1)*50+'% '+(y+1)*100/3+'%, '+x*50+'% '+(y+1)*100/3+'%)';
    fragment.append(piece.cloneNode(true));sprite.append(fragment);
    const dx=(x?1:-1)*(12+y*6),dy=(y-1)*19-6;
    tasks.push(effectAnimation(fragment,[{opacity:1,transform:'translate(0,0) rotate(0)'},{opacity:0,transform:'translate('+dx+'px,'+dy+'px) rotate('+((x?1:-1)*(18+y*8))+'deg) scale(.65)'}],490,token));
  }
  piece.style.visibility='hidden';burst(square,token);
  await Promise.all(tasks);
}
async function shadowDefeat(targets,winningMove,token){
  const sprites=[],hidden=[];
  const attackerPiece=engine().get(winningMove.to);
  const attacker=effectSprite(winningMove.to,attackerPiece,'victory-attacker');
  const realAttacker=squareElement(winningMove.to)?.querySelector(':scope > .piece');
  if(realAttacker)realAttacker.style.visibility='hidden';
  for(const branch of targets){
    board.querySelector('.ghost-residue[data-branch="'+branch.id+'"]')?.remove();
    const sprite=effectSprite(branch.to,{type:branch.move.piece,color:'b'},'shadow-defeated'+(branch.id!==active.id?' batch-shadow':''));
    if(sprite){sprite.dataset.branch=branch.id;sprites.push({sprite,branch});}
    const actual=squareElement(branch.to)?.querySelector(':scope > .piece');
    if(actual&&engine().get(branch.to)?.color==='b'){actual.style.visibility='hidden';hidden.push(actual);}
  }
  try{
    setPlaybackStage('impact');
    if(attacker){
      const a=squareElement(winningMove.to).getBoundingClientRect(),z=squareElement(active.to).getBoundingClientRect();
      const dx=z.left-a.left,dy=z.top-a.top,len=Math.hypot(dx,dy)||1;
      await effectAnimation(attacker,[{transform:'scale(1)'},{transform:'translate('+dx/len*11+'px,'+dy/len*11+'px) scale(1.18)',offset:.45},{transform:'scale(1)'}],340,token);
    }
    if(!valid(token))return;
    setPlaybackStage('shatter');sound('capture');
    await Promise.all(sprites.map(({sprite,branch})=>shatterSprite(sprite,branch.to,token)));
  }finally{
    attacker?.remove();if(realAttacker)realAttacker.style.visibility='';
    sprites.forEach(({sprite})=>sprite.remove());
    // Keep defeated pieces absent for the beat; rendering the rewind restores them.
    if(!valid(token))hidden.forEach(piece=>piece.style.visibility='');
  }
}
async function effectAnimation(element,keyframes,duration,token){
  if(reduceMotion.matches){await wait(90);return valid(token);}
  let animation;
  try{animation=element.animate(keyframes,{duration,easing:'ease-out',fill:'forwards'});animations.add(animation);await settleAnimation(animation,duration);}
  catch{await wait(duration);}
  finally{if(animation)animations.delete(animation);}
  return valid(token);
}
async function rewindBranch(token,{defeated=[]}={}){
  const branch=active;if(!branch)return;
  setPlaybackStage('rewind');cue('REWIND','シャドー選択へ戻ります');
  const afterBlack=branch.afterFen;
  if(completedMate){
    await rewindMove(afterBlack,lastPlayedMate||branch.mate,viewFen,token);if(!valid(token))return;
    await wait(reduceMotion.matches?30:110);if(!valid(token))return;
  }
  await rewindMove(postKeyFen,branch.move,afterBlack,token);if(!valid(token))return;
  phase='explore';active=null;completedMate=false;lastPlayedMate=null;explanation=null;mateProof=null;
  focusFrom=branch.from;
  hideCue();setPosition(postKeyFen);renderUI();
  const remaining=branches.filter(b=>b.from===branch.from&&!solved.has(b.id)).length;
  if(!remaining)focusFrom=null;
  const complete=solved.size===branches.length;
  phase=complete?'complete':'explore';setPlaybackStage(null);hideCue();
  if(complete){cue('ALL SHADOWS CLEARED','全 '+branches.length+' 手を攻略しました','key',2200);setFeedback('すべてのシャドーを攻略しました','黒の全応手に詰みを証明。盤面がクリアになりました。応手一覧から何度でも見直せます。','good');}
  else setFeedback(defeated.length?'シャドーを'+defeated.length+'体攻略 ✓':'次のシャドーを選びましょう',(defeated.length>1?'同じ一手で詰む候補をまとめて撃破。':'')+(remaining?'この黒駒の残り '+remaining+' 体。':'この黒駒の候補はすべて攻略済み。別の印付き黒駒を選びましょう。'),defeated.length?'good':'neutral');
  endOperation(token);paint();
}
async function returnToExplore(){
  if(busy||phase==='key'||phase==='explore')return;
  if(phase==='explain'){await retryAttempt();return;}
  if(!active){phase='explore';setPosition(postKeyFen);paint();saveProgress();return;}
  const token=newOperation();cue('REWIND','シャドー選択へ戻ります');
  await rewindBranch(token);
}
let lastPlayedMate=null;
async function playProofSweep(){
  if(busy||solved.size!==branches.length)return;
  if(phase==='mate'){
    const expectedSequence=sequence+(active?1:0);
    await returnToExplore();
    if(busy||sequence!==expectedSequence||phase!=='explore'||solved.size!==branches.length)return;
  }
  primeAudio();
  const token=newOperation();
  phase='review';renderUI();
  proofPlaying=true;
  $('skipProof').hidden=false;
  hideOverlay();
  hideCue();
  for(let i=0;i<branches.length;i++){
    if(!valid(token))return;
    const b=branches[i];
    cue('PROOF '+(i+1)+' / '+branches.length,'黒 …'+b.san,'black');
    const afterBlack=await transitionMove(postKeyFen,b.move,{duration:175,quiet:true},token);
    if(!afterBlack)return;
    const mate=b.mate;
    const afterMate=await transitionMove(afterBlack,mate,{duration:180,quiet:true},token);
    if(!afterMate)return;
    cue('CHECKMATE',mate.san+' ✓','key');
    await wait(reduceMotion.matches?250:125);
    if(!valid(token))return;
    await rewindMove(afterBlack,mate,afterMate,token,245);
    if(!valid(token))return;
    await rewindMove(postKeyFen,b.move,afterBlack,token,245);
  }
  if(!valid(token))return;
  proofPlaying=false;
  $('skipProof').hidden=true;
  phase='complete';active=null;completedMate=false;
  focusFrom=null;lastPlayedMate=null;hideCue();
  setPosition(postKeyFen);
  sound('mate');
  showOverlay('PROOF COMPLETE','黒の応手 '+branches.length+' 手すべてに詰みを確認','タップして応手を見直す →','complete');
  overlayAction=finishReview;
  setFeedback('PROOF COMPLETE','Keyに対する黒の全合法応手を一手ずつ検証できました。','good');
  endOperation(token);paint();
}
function hardReset(){
  ++sequence;
  cancelAnimations();cancelGesture();
  busy=false;gesture=null;selected=null;legal=[];hover=null;focusFrom=null;
  pauseFailureRewind();setPlaybackStage(null);
  solved.clear();active=null;completedMate=false;lastPlayedMate=null;explanation=null;mateProof=null;
  proofPlaying=false;$('skipProof').hidden=true;
  phase='key';viewFen=initialFen;listOpen=false;
  hideCue();hideOverlay();paint();
  setFeedback('王手とは限らない、最初の一手','黒がどう動いても、次に詰ませられる手を見つけましょう。');
  saveProgress();
}
function selectFrom(square){
  const piece=engine().get(square);
  if(!piece||piece.color!=='w')return false;
  selected=square;legal=legalFrom(square);hover=null;updateGuides();
  return true;
}
function startGesture(e){
  if(busy||!overlay.hidden||e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;
  primeAudio();
  if(phase==='explore'||phase==='complete'){
    if(e.target.closest('.ghost-target'))return;
    const square=e.target.closest('.square');
    if(square) setBlackFocus(square.dataset.square);
    return;
  }
  if(phase==='explain'){pauseFailureRewind();focusAnalysisPiece(e.target.closest('.square')?.dataset.square);renderUI();return;}
  if(phase!=='key'&&phase!=='mate')return;
  const square=e.target.closest('.square');
  if(!square||!board.contains(square))return;
  const sq=square.dataset.square;
  setKeyboardSquare(sq);
  const movable=engine().get(sq)?.color==='w';
  const possible=selected && targetMove(sq);
  if(!movable&&!possible){clearSelection();return;}
  e.preventDefault();
  if(movable)selectFrom(sq);
  gesture={id:e.pointerId,startX:e.clientX,startY:e.clientY,source:selected,direct:!movable&&!!possible,moved:false};
  try{board.setPointerCapture(e.pointerId);}catch{}
}
function moveGesture(e){
  if(!gesture||gesture.id!==e.pointerId||busy)return;
  e.preventDefault();
  if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>5)gesture.moved=true;
  const sq=squareAt(e.clientX,e.clientY);
  const next=sq&&targetMove(sq)?sq:null;
  if(next!==hover){hover=next;updateGuides();}
}
function endGesture(e){
  if(!gesture||gesture.id!==e.pointerId)return;
  e.preventDefault();
  const g=gesture;gesture=null;
  try{board.releasePointerCapture(e.pointerId);}catch{}
  if(busy)return;
  const sq=squareAt(e.clientX,e.clientY);
  const move=sq&&targetMove(sq);
  if(move && sq!==selected){
    clearSelection();
    run(()=>attemptWhite(move));
  }else if(g.moved && sq!==selected){
    clearSelection();
  }else{
    hover=null;updateGuides();
  }
}
board.addEventListener('pointerdown',startGesture);
board.addEventListener('pointermove',moveGesture);
board.addEventListener('pointerup',endGesture);
board.addEventListener('pointercancel',()=>{cancelGesture();clearSelection();});
board.addEventListener('lostpointercapture',()=>{if(gesture){cancelGesture();clearSelection();}});
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('dragstart',e=>e.preventDefault());
function focusAnalysisPiece(sq){
  if(!explanation||explanation.mode!=='black'||!sq||engine().get(sq)?.color!=='b')return;
  explanation.focusBlack=explanation.focusBlack===sq?null:sq;drawExplanation();renderUI();
}
function setKeyboardSquare(sq,focus=false){
  keyboardSquare=sq;
  board.querySelectorAll('.square').forEach(el=>{el.tabIndex=el.dataset.square===sq?0:-1;});
  if(focus)squareElement(sq)?.focus({preventScroll:true});
}
board.addEventListener('keydown',e=>{
  if(e.target.closest('.ghost-target'))return;
  if(phase==='explain'&&!busy){pauseFailureRewind();renderUI();}
  const sq=e.target.closest('.square')?.dataset.square || keyboardSquare;
  const order=rankFiles(),index=order.indexOf(sq);
  if(e.key==='Escape'){e.preventDefault();cancelGesture();clearSelection();return;}
  const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}[e.key];
  if(delta!==undefined){
    e.preventDefault();
    if((delta===-1&&index%8===0)||(delta===1&&index%8===7))return;
    const next=order[index+delta];if(next)setKeyboardSquare(next,true);
    return;
  }
  if(e.key==='Home'||e.key==='End'){
    e.preventDefault();setKeyboardSquare(order[Math.floor(index/8)*8+(e.key==='End'?7:0)],true);return;
  }
  if(e.key!=='Enter'&&e.key!==' ')return;
  e.preventDefault();
  if(busy||!overlay.hidden)return;
  if(phase==='explore'||phase==='complete'){
    const branchId=squareElement(sq)?.querySelector('.ghost-target')?.dataset.branch;
    if(branchId)run(()=>openBranch(branches.find(b=>b.id===branchId)));
    else setBlackFocus(sq);
    return;
  }
  if(phase==='explain'){pauseFailureRewind();focusAnalysisPiece(sq);renderUI();return;}
  if(phase!=='key'&&phase!=='mate')return;
  const move=selected&&targetMove(sq);
  if(move && sq!==selected){clearSelection();run(()=>attemptWhite(move));}
  else selectFrom(sq);
});
overlay.addEventListener('click',()=>{if(!busy&&overlayAction)overlayAction();});
backBtn.addEventListener('click',()=>{
  if(busy)return;
  if(phase==='complete'){finishReview();return;}
  run(returnToExplore);
});
showBranchesBtn.addEventListener('click',()=>{listOpen=!listOpen;renderUI();});
$('resetBtn').addEventListener('click',hardReset);
$('hintToggle').addEventListener('click',()=>{
  if(busy||!overlay.hidden)return;
  hintsOn=!hintsOn;savePreferences();updateGuides();renderUI();
});
$('strategyBtn').addEventListener('click',()=>{
  if(busy)return;
  setFeedback('考え方のヒント',problem.guidance?.[phase==='explore'||phase==='complete'?'defenses':phase]?.[0]||'黒駒が動いて空いたマスや、開いた利きに注目しましょう。');
});
$('responseViewBtn').addEventListener('click',()=>explanationView('response'));
$('coverageViewBtn').addEventListener('click',()=>explanationView('coverage'));
$('blackControlBtn').addEventListener('click',()=>explanationView('black'));
$('survivalViewBtn').addEventListener('click',()=>explanationView('survival'));
$('pauseExplanationBtn').addEventListener('click',()=>{if(!busy){pauseFailureRewind();renderUI();}});
$('retryBtn').addEventListener('click',()=>run(retryAttempt));
$('revealBtn').addEventListener('click',()=>{
  if(busy)return;
  if(phase==='key'){
    const m=engine().moves({verbose:true}).find(x=>x.from+x.to===problem.key.uci);
    run(()=>attemptWhite(m));
  }else if(phase==='mate'){
    run(()=>attemptWhite(active.mate));
  }else if(phase==='explore'){
    if(solved.size===branches.length)run(playProofSweep);
    else{
      const next=branches.find(b=>b.from===focusFrom&&!solved.has(b.id))||branches.find(b=>!solved.has(b.id));
      if(next)run(()=>openBranch(next));
    }
  }else run(playProofSweep);
});
$('flipBtn').addEventListener('click',()=>{
  if(busy)return;
  if(phase==='explain')pauseFailureRewind();
  cancelGesture();
  orientation=orientation==='white'?'black':'white';
  renderBoard();renderUI();savePreferences();
});
$('skipProof').addEventListener('click',()=>{
  if(!proofPlaying)return;
  ++sequence;cancelAnimations();cancelGesture();proofPlaying=false;busy=false;
  $('skipProof').hidden=true;
  phase='complete';active=null;completedMate=false;lastPlayedMate=null;focusFrom=null;mateProof=null;hideCue();
  setPosition(postKeyFen);
  showOverlay('PROOF COMPLETE','黒の応手 '+branches.length+' 手すべてに詰みを確認','タップして応手を見直す →','complete');
  overlayAction=finishReview;
  setFeedback('PROOF COMPLETE','全ての黒応手へのMateを確認できました。','good');
  paint();saveProgress();
});
function finishReview(){hideOverlay();phase='explore';focusFrom=null;paint();saveProgress();}
$('soundBtn').addEventListener('click',()=>{
  audioOn=!audioOn;
  primeAudio();renderUI();savePreferences();
});
window.addEventListener('blur',()=>{cancelGesture();clearSelection();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelGesture();clearSelection();if(busy)settleInterruptedOperation();else if(phase==='explain'){pauseFailureRewind();renderUI();}}});
window.addEventListener('pagehide',()=>{if(busy)settleInterruptedOperation();});
window.addEventListener('resize',()=>{
  cancelGesture();clearSelection();
  if(phase==='explain')requestAnimationFrame(drawExplanation);
});
window.__mateTwoDebug={
  state:()=>({phase,viewFen,mateProof:!!mateProof,solved:solved.size,solvedIds:[...solved],total:branches.length,active:active?.san,focusFrom,busy,orientation,hintsOn,playbackStage,explanation:explanation?{mode:explanation.mode,kind:explanation.description.kind,reply:explanation.reply?.san,from:explanation.reply?.from,to:explanation.reply?.to,returnPhase:explanation.returnPhase,survival:explanation.survival?.move.san,autoRewind:explanation.autoRewind}:null}),
  branches:()=>branches.map(b=>({id:b.id,san:b.san,mate:b.mate.san,mateFrom:b.mate.from,mateTo:b.mate.to,mates:b.mates.map(m=>m.from+m.to+(m.promotion||''))})),
  choose:(id)=>openBranch(branches.find(b=>b.id===id)),
  reset:hardReset
};
const resumed=restoreProgress();
paint();
setFeedback(resumed?'前回の続きから': '王手とは限らない、最初の一手',
  resumed?'検証済みの応手を復元しました。自分のペースで続きをどうぞ。':'黒がどう動いても、次に詰ませられる手を見つけましょう。');
saveProgress();
