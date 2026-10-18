import { Chess } from './vendor/chess.js';
import { problems } from './data/problems.js';

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
    san:move.san, afterFen:next.fen(), mate:chosen,
    label:known?.label || move.san,
    note:known?.note || sameFamily?.note || '黒の移動で変わった利き・逃げ道を確かめましょう。',
    from:move.from, to:move.to
  };
});
const solved = new Set();
const blackOrigins = [...new Set(branches.map(branch=>branch.from))];
let phase = 'key';             // key | explore | black | mate | review | complete
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
let hintStep = 0;
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
let persistenceAvailable = true;

function readStorage(key){
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}
function writeStorage(key,value){
  try { localStorage.setItem(key,JSON.stringify(value)); }
  catch { persistenceAvailable=false; }
}
function savePreferences(){writeStorage(PREFERENCES_KEY,{audioOn,orientation});}
function saveProgress(){
  // Save a legal checkpoint, never an intermediate animation frame.
  const checkpoint=phase==='black'?'mate':phase==='complete'?'explore':phase;
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
function recoverOperation(error){
  console.error('Move operation failed',error);
  ++sequence;cancelAnimations();cancelGesture();busy=false;proofPlaying=false;
  $('skipProof').hidden=true;hideCue();hideOverlay();
  completedMate=false;lastPlayedMate=null;
  if(phase==='key'){viewFen=initialFen;active=null;}
  else if(active){phase='mate';viewFen=active.afterFen;}
  else{phase='explore';viewFen=postKeyFen;}
  selected=null;legal=[];paint();
  setFeedback('局面を戻しました','もう一度操作してください。検証済みの応手は保存されています。');
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
  const hintOrigin=phase==='key'?problem.key.uci.slice(0,2):phase==='mate'?active?.mate.from:phase==='explore'?branches.find(b=>!solved.has(b.id))?.from:null;
  board.querySelectorAll('.square').forEach(el=>{
    const sq=el.dataset.square;
    const possible=targetMove(sq);
    el.classList.toggle('selected',sq===selected);
    el.classList.toggle('legal',!!possible);
    el.classList.toggle('capture-target',!!possible?.captured);
    el.classList.toggle('hover-target',sq===hover && !!possible);
    el.classList.toggle('last',!!(active && phase==='mate' && (sq===active.to || sq===active.from)));
    el.classList.toggle('hint-origin',hintsOn && !busy && sq===hintOrigin);
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
    if(piece && piece.type==='k') el.classList.add('king-square');
    el.setAttribute('aria-label',sq+' '+(piece?(piece.color==='w'?'白':'黒')+NAME[piece.type]:'空きマス'));
    el.setAttribute('role','button');
    el.tabIndex=sq===keyboardSquare?0:-1;
    board.append(el);
  });
  updateGuides();
  if(phase==='explore') renderGhosts();
  else lines.replaceChildren();
  if(hadFocus)squareElement(keyboardSquare)?.focus({preventScroll:true});
}
function renderGhosts(){
  board.querySelectorAll('.ghost-target,.branch-origin-count').forEach(el=>el.remove());
  board.querySelectorAll('.square').forEach(el=>{
    el.classList.remove('branch-origin','branch-origin-active','branch-origin-done');
    el.setAttribute('role','button');
    el.setAttribute('aria-pressed','false');
    const piece=postKeyEngine.get(el.dataset.square);
    el.setAttribute('aria-label',el.dataset.square+' '+(piece?(piece.color==='w'?'白':'黒')+NAME[piece.type]:'空きマス'));
  });
  // Step one: mark only Black pieces which have at least one legal reply.
  // Step two: expand only the selected piece's legal target ghost squares.
  for(const from of blackOrigins){
    const square=squareElement(from);
    if(!square)continue;
    const options=branches.filter(b=>b.from===from);
    const done=options.filter(b=>solved.has(b.id)).length;
    square.classList.add('branch-origin');
    square.classList.toggle('branch-origin-active',focusFrom===from);
    square.classList.toggle('branch-origin-done',done===options.length);
    square.setAttribute('aria-label','黒'+NAME[postKeyEngine.get(from).type]+' '+from+' の防御 '+done+'/'+options.length+' 攻略済み');
    square.setAttribute('role','button');
    const counter=document.createElement('span');
    counter.className='branch-origin-count';
    counter.textContent=done+'/'+options.length;
    square.append(counter);
  }
  if(!focusFrom){
    lines.replaceChildren();
    return;
  }
  const options=branches.filter(b=>b.from===focusFrom);
  options.forEach(b=>{
    const host=squareElement(b.to);
    if(!host)return;
    const source=postKeyEngine.get(b.from);
    const button=document.createElement('button');
    button.type='button';
    button.className='ghost-target focused'+(solved.has(b.id)?' solved':'');
    button.dataset.branch=b.id;
    button.setAttribute('aria-label','黒 '+b.san+' を検証'+(solved.has(b.id)?' 攻略済み':''));
    button.title=b.san+(solved.has(b.id)?' ✓':'');
    button.append(makePiece(source.type,source.color));
    if(solved.has(b.id)){
      const mark=document.createElement('span');
      mark.className='ghost-check';mark.textContent='✓';button.append(mark);
    }
    button.addEventListener('click',event=>{
      event.stopPropagation();
      if(!busy)run(()=>openBranch(b));
    });
    // A destination contains a real button, so its square must not also be a button.
    host.setAttribute('role','group');
    host.removeAttribute('aria-pressed');
    host.setAttribute('aria-label',b.to+' 黒の応手 '+b.san);
    host.append(button);
  });
  requestAnimationFrame(drawArrows);
}
function drawArrows(){
  lines.replaceChildren();
  if(phase!=='explore' || !focusFrom)return;
  const bounds=board.getBoundingClientRect();
  if(!bounds.width)return;
  lines.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
  const svgNS='http://www.w3.org/2000/svg';
  const options=branches.filter(b=>b.from===focusFrom);
  options.forEach((b,i)=>{
    const a=squareElement(b.from)?.getBoundingClientRect();
    const z=squareElement(b.to)?.getBoundingClientRect();
    if(!a||!z)return;
    const x=a.left-bounds.left+a.width/2;
    const y=a.top-bounds.top+a.height/2;
    const xx=z.left-bounds.left+z.width/2;
    const yy=z.top-bounds.top+z.height/2;
    const dx=xx-x,dy=yy-y,len=Math.hypot(dx,dy)||1;
    const offset=((i%3)-1)*Math.min(8,len*.1);
    const cx=(x+xx)/2-dy/len*offset,cy=(y+yy)/2+dx/len*offset;
    const pad=Math.min(14,len*.22);
    const endX=xx-dx/len*pad,endY=yy-dy/len*pad;
    const path=document.createElementNS(svgNS,'path');
    path.setAttribute('d','M '+x+' '+y+' Q '+cx+' '+cy+' '+endX+' '+endY);
    path.classList.add('branch-arrow','focused');
    if(solved.has(b.id))path.classList.add('solved');
    lines.append(path);
  });
}
function setBlackFocus(from){
  if(busy || phase!=='explore' || !blackOrigins.includes(from))return;
  hideCue();hintStep=0;hintsOn=false;
  focusFrom=focusFrom===from?null:from;
  renderGhosts();
  renderUI();
  updateGuides();
  if(focusFrom){
    const options=branches.filter(b=>b.from===focusFrom);
    const completed=options.filter(b=>solved.has(b.id)).length;
    const piece=postKeyEngine.get(focusFrom);
    setFeedback('黒の '+NAME[piece.type]+' を検証',completed+' / '+options.length+' 手攻略済み。ゴーストを1つ選んで動きを確かめましょう。');
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
  document.body.dataset.phase=phase;
  document.body.dataset.busy=String(busy);
  board.setAttribute('aria-busy',String(busy));
  const total=branches.length;
  solvedCount.textContent=solved.size+' / '+total;
  $('branchCount').textContent='全'+total+'手';
  $('progressBar').style.width=(solved.size/total*100)+'%';
  $('progressTrack').setAttribute('aria-valuenow',String(solved.size));
  $('progressTrack').setAttribute('aria-valuemax',String(total));
  const step=phase==='key'?'key':phase==='explore'||phase==='black'?'explore':'mate';
  const stepNames=['key','explore','mate'];
  document.querySelectorAll('.phase-steps li').forEach(el=>{
    const current=el.dataset.step===step;
    if(current)el.setAttribute('aria-current','step');
    else el.removeAttribute('aria-current');
    el.classList.toggle('done',stepNames.indexOf(el.dataset.step)<stepNames.indexOf(step));
  });
  if(phase==='key'){
    phaseIndex.textContent='01';
    $('phaseLabel').textContent='FIND THE KEY';
    phaseTitle.textContent='白の初手を探しましょう';
    helpText.textContent='駒 → 移動先の順にタップ。スライドでも動かせます。';
  }else if(phase==='explore'){
    phaseIndex.textContent='02';
    $('phaseLabel').textContent='EXPLORE THE DEFENCES';
    phaseTitle.textContent='黒の応手を選びましょう';
    helpText.textContent=focusFrom
      ? '半透明の駒が移動先です。タップして応手を検証できます。'
      : '印のある黒駒をタップすると、移動先が開きます。';
  }else if(phase==='black'){
    phaseIndex.textContent='02';
    $('phaseLabel').textContent='BLACK TO MOVE';
    phaseTitle.textContent='黒の '+active.san+' を確認';
    helpText.textContent='黒の着手後、白の2手目を考えましょう。';
  }else if(phase==='mate'){
    phaseIndex.textContent='03';
    $('phaseLabel').textContent='FIND THE CHECKMATE';
    phaseTitle.textContent='白の2手目で詰ませましょう';
    helpText.textContent='黒の '+active.san+' への詰みを探します。「応手へ」で戻れます。';
  }else if(phase==='review'){
    phaseIndex.textContent='↻';
    $('phaseLabel').textContent='PROOF REVIEW';
    phaseTitle.textContent='すべての詰みを振り返る';
    helpText.textContent='黒の応手と白の詰みを順に再生しています。';
  }else{
    phaseIndex.textContent='✓';
    $('phaseLabel').textContent='PROOF COMPLETE';
    phaseTitle.textContent='すべての黒手を検証しました';
    helpText.textContent='すべての応手に詰みを確認。何度でも見直せます。';
  }
  backBtn.hidden=(phase==='key'||phase==='explore');
  showBranchesBtn.hidden=(phase==='key');
  showBranchesBtn.textContent=listOpen?'一覧を閉じる':'応手一覧';
  showBranchesBtn.setAttribute('aria-expanded',String(listOpen));
  $('soundBtn').setAttribute('aria-pressed',String(audioOn));
  $('soundBtn').setAttribute('aria-label','効果音 '+(audioOn?'オン':'オフ'));
  $('flipBtn').setAttribute('aria-pressed',String(orientation==='black'));
  $('hintToggle').setAttribute('aria-pressed',String(hintStep>0));
  const locked=busy||!overlay.hidden;
  backBtn.disabled=busy;
  showBranchesBtn.disabled=locked;
  $('flipBtn').disabled=busy;
  $('hintToggle').disabled=locked||!['key','mate','explore'].includes(phase);
  $('revealBtn').disabled=locked;
  $('revealBtn').textContent=phase==='key'?'初手を見る ↗':phase==='mate'?'詰みを見る ↗':phase==='complete'||solved.size===total?'全手順を再生 ↗':'次の応手へ ↗';
  if(locked)board.querySelectorAll('.ghost-target').forEach(el=>{el.disabled=true;});
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
      await animation.finished.catch(()=>{});
    }else{
      await animation.finished.catch(()=>{});
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
function newOperation(){
  sequence+=1;
  cancelGesture();
  // On short iPhone viewports, controls may sit below the board. Bring the
  // whole board back into view before measuring or animating the next move.
  const rect=wrap.getBoundingClientRect();
  const visibleTop=window.visualViewport?.offsetTop || 0;
  const visibleBottom=visibleTop+(window.visualViewport?.height || window.innerHeight);
  if(rect.top<visibleTop || rect.bottom>visibleBottom)wrap.scrollIntoView({block:'center',behavior:'auto'});
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
  renderUI();
  saveProgress();
}
async function attemptWhite(move){
  if(busy||!move||completedMate||!['key','mate'].includes(phase))return;
  primeAudio();
  const token=newOperation();
  const before=viewFen;
  const played=await transitionMove(before,move,{duration:445},token);
  if(!played||!valid(token))return;
  await wait(reduceMotion.matches?60:295);
  if(!valid(token))return;
  if(phase==='key'){
    if(move.from+move.to===problem.key.uci){
      phase='explore';
      active=null;completedMate=false;focusFrom=null;hintStep=0;hintsOn=false;
      setPosition(postKeyFen);
      cue('KEY FOUND ✓',problem.key.san+' · 黒駒を1つ選んで防御を読む','key',1450);
      setFeedback('KEY FOUND', 'まず印の付いた黒駒を選択し、その駒の防御を1手ずつ検証しましょう。','good');
      sound('mate');endOperation(token);paint();return;
    }
    const candidate=new Chess(played);
    const refutation=candidate.moves({verbose:true}).find(blackMove=>{
      const next=new Chess(candidate.fen());next.move(moveSpec(blackMove));
      return !next.moves({verbose:true}).some(reply=>{
        const test=new Chess(next.fen());test.move(moveSpec(reply));return test.isCheckmate();
      });
    });
    cue('REFUTATION','この初手は黒に破られます','bad');
    sound('error');
    let refuted=played;
    if(refutation){
      await wait(reduceMotion.matches?70:360);
      if(!valid(token))return;
      refuted=await transitionMove(played,refutation,{duration:450},token);
      if(!refuted)return;
      await wait(reduceMotion.matches?90:530);
      if(!valid(token))return;
      await rewindMove(played,refutation,refuted,token);
    }else await wait(600);
    if(!valid(token))return;
    await rewindMove(before,move,played,token);
    if(!valid(token))return;
    setFeedback('初手は反証されました',refutation?'黒の '+refutation.san+' が、この仮説を壊します。':'別のKeyを探しましょう。','bad');
    hideCue();endOperation(token);return;
  }
  if(phase==='mate'){
    const test=new Chess(played);
    if(test.isCheckmate()){
      completedMate=true;
      lastPlayedMate=move;
      solved.add(active.id);
      saveProgress();
      await wait(reduceMotion.matches?100:405);
      if(!valid(token))return;
      sound('mate');
      showOverlay('CHECKMATE',move.san+' · '+solved.size+' / '+branches.length+' の応手を検証',solved.size===branches.length?'タップして全手順を振り返る →':'タップして次の応手へ →','mate');
      overlayAction=()=>run(()=>solved.size===branches.length?playProofSweep():returnToExplore());
      setFeedback('CHECKMATE',active.san+' への詰みが成立しました。','good');
      endOperation(token);return;
    }
    const reply=test.moves({verbose:true})[0]||null;
    cue('NOT MATE','黒にはまだ応手が残っています','bad');
    sound('error');
    let refuted=played;
    if(reply){
      await wait(reduceMotion.matches?60:350);
      if(!valid(token))return;
      refuted=await transitionMove(played,reply,{duration:450},token);
      if(!refuted)return;
      await wait(reduceMotion.matches?70:495);
      if(!valid(token))return;
      await rewindMove(played,reply,refuted,token);
    }else await wait(400);
    if(!valid(token))return;
    await rewindMove(before,move,played,token);
    if(!valid(token))return;
    setFeedback('まだCheckmateではありません','黒王の逃げ道と、黒の取り返し・合駒を確認しましょう。','bad');
    hideCue();endOperation(token);
  }
}
async function openBranch(branch){
  if(busy||!branch)return;
  primeAudio();
  if(phase==='mate' || phase==='complete'){
    const expectedSequence=sequence+(active?1:0);
    await returnToExplore();
    if(busy||sequence!==expectedSequence)return;
  }
  if(phase!=='explore')return;
  const token=newOperation();
  focusFrom=branch.from;
  // Keep White input closed until the Black move physically lands.
  phase='black';active=branch;completedMate=false;lastPlayedMate=null;
  hintStep=0;hintsOn=false;saveProgress();renderUI();
  setPosition(postKeyFen);
  cue('BLACK DEFENCE','…'+branch.san,'black');
  await wait(reduceMotion.matches?45:300);
  if(!valid(token))return;
  const result=await transitionMove(postKeyFen,branch.move,{duration:640},token);
  if(!result||!valid(token))return;
  await wait(reduceMotion.matches?70:400);
  if(!valid(token))return;
  phase='mate';active=branch;completedMate=false;hintStep=0;
  hideCue();
  setFeedback('黒の '+branch.san,'この防御に対して白の2手目でCheckmateを探します。');
  endOperation(token);paint();
}
async function returnToExplore(){
  if(busy)return;
  if(phase==='explore')return;
  if(phase==='key')return;
  const branch=active;
  if(!branch){
    phase='explore';setPosition(postKeyFen);paint();saveProgress();return;
  }
  const token=newOperation();
  cue('REWIND','Key後の分岐点へ戻る','neutral');
  const afterBlack=branch.afterFen;
  if(completedMate){
    // A sound #2 may have more than one mating move; undo the exact one just played.
    const played=lastPlayedMate || branch.mate;
    await rewindMove(afterBlack,played,viewFen,token);
    if(!valid(token))return;
    await wait(120);
  }
  await rewindMove(postKeyFen,branch.move,afterBlack,token);
  if(!valid(token))return;
  await wait(reduceMotion.matches?65:315);
  if(!valid(token))return;
  phase='explore';active=null;completedMate=false;lastPlayedMate=null;hintStep=0;hintsOn=false;
  // Preserve the selected Black piece until all of its replies are solved.
  // This makes the problem feel like clearing one opponent piece at a time.
  const inGroup=branches.filter(b=>b.from===branch.from);
  const groupDone=inGroup.every(b=>solved.has(b.id));
  focusFrom=groupDone?null:branch.from;
  hideCue();
  const left=inGroup.filter(b=>!solved.has(b.id)).length;
  setFeedback(groupDone?'この黒駒の防御をすべて攻略 ✓':'同じ黒駒の次の応手へ',
    groupDone?'別の印付き黒駒をタップして続けましょう。':'残り '+left+' 手。ゴーストを選ぶか、別の黒駒へ切り替えられます。',
    groupDone?'good':'neutral');
  endOperation(token);paint();
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
  solved.clear();active=null;completedMate=false;lastPlayedMate=null;
  proofPlaying=false;$('skipProof').hidden=true;
  hintStep=0;hintsOn=false;phase='key';viewFen=initialFen;listOpen=false;
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
  if(phase==='explore'){
    if(e.target.closest('.ghost-target'))return;
    const square=e.target.closest('.square');
    if(square) setBlackFocus(square.dataset.square);
    return;
  }
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
function setKeyboardSquare(sq,focus=false){
  keyboardSquare=sq;
  board.querySelectorAll('.square').forEach(el=>{el.tabIndex=el.dataset.square===sq?0:-1;});
  if(focus)squareElement(sq)?.focus({preventScroll:true});
}
board.addEventListener('keydown',e=>{
  if(e.target.closest('.ghost-target'))return;
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
  if(phase==='explore'){
    const branchId=squareElement(sq)?.querySelector('.ghost-target')?.dataset.branch;
    if(branchId)run(()=>openBranch(branches.find(b=>b.id===branchId)));
    else setBlackFocus(sq);
    return;
  }
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
  if(busy||!overlay.hidden||!['key','mate','explore'].includes(phase))return;
  hintStep=(hintStep+1)%3;
  if(hintStep===1){
    setFeedback('考え方のヒント',(problem.guidance?.[phase==='explore'?'defenses':phase]?.[0]||'動いた駒が空けたマスに注目しましょう。'));
  }else if(hintStep===2){
    setFeedback('注目する駒を表示','盤面の淡い輪郭を手掛かりに考えましょう。');
  }else setFeedback('ヒントを閉じました','いまの局面を自由に観察しましょう。');
  hintsOn=hintStep===2;
  updateGuides();renderUI();
});
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
  cancelGesture();
  orientation=orientation==='white'?'black':'white';
  renderBoard();renderUI();savePreferences();
});
$('skipProof').addEventListener('click',()=>{
  if(!proofPlaying)return;
  ++sequence;cancelAnimations();cancelGesture();proofPlaying=false;busy=false;
  $('skipProof').hidden=true;
  phase='complete';active=null;completedMate=false;lastPlayedMate=null;focusFrom=null;hideCue();
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
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelGesture();clearSelection();}});
window.addEventListener('resize',()=>{
  cancelGesture();clearSelection();
  if(phase==='explore')requestAnimationFrame(drawArrows);
});
window.__mateTwoDebug={
  state:()=>({phase,viewFen,solved:solved.size,total:branches.length,active:active?.san,focusFrom,busy,orientation}),
  branches:()=>branches.map(b=>({id:b.id,san:b.san,mate:b.mate.san,mateFrom:b.mate.from,mateTo:b.mate.to})),
  choose:(id)=>openBranch(branches.find(b=>b.id===id)),
  reset:hardReset
};
hintsOn=false;
const resumed=restoreProgress();
paint();
setFeedback(resumed?'前回の続きから': '王手とは限らない、最初の一手',
  resumed?'検証済みの応手を復元しました。自分のペースで続きをどうぞ。':'黒がどう動いても、次に詰ませられる手を見つけましょう。');
saveProgress();
