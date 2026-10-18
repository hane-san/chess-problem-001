import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { problems } from './data/problems.js';

/* MATE / TWO 2.0 — one rules authority, one gesture controller, one animation queue.
   The board is always rendered from a legal chess.js FEN, never from decorative DOM state. */
const problem = problems[0];
const PIECES = {k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
const NAME = {k:'King',q:'Queen',r:'Rook',b:'Bishop',n:'Knight',p:'Pawn'};
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
let phase = 'key';             // key | explore | mate | complete
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
let audioOn = true;
let audioContext = null;
let overlayAction = null;
let lastFeedback = '';

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
  lastFeedback=title;
  feedback.className='feedback '+kind;
  feedback.querySelector('strong').textContent=title;
  feedback.querySelector('span').textContent=detail;
  feedback.querySelector('.feedback-icon').textContent=kind==='good'?'✓':kind==='bad'?'×':'◇';
}
function cue(title,detail='',kind='neutral',duration=0){
  const el=$('boardCue');
  el.innerHTML='';
  const main=document.createElement('strong');main.textContent=title;
  const sub=document.createElement('span');sub.textContent=detail;
  el.append(main,sub);
  el.className='board-cue visible '+kind;
  if(duration) {
    const thisCue=title;
    setTimeout(()=>{if(el.querySelector('strong')?.textContent===thisCue)el.classList.remove('visible');},duration);
  }
}
function hideCue(){$('boardCue').classList.remove('visible');}
function hideOverlay(){overlay.classList.remove('visible');overlayAction=null;}
function showOverlay(title,detail,action,kind='mate'){
  $('resultTitle').textContent=title;
  $('resultDetail').textContent=detail;
  $('resultAction').textContent=action;
  overlay.className='result-overlay visible '+kind;
}
function resetOverlayButtons(){hideOverlay();hideCue();}
function squareElement(sq){return board.querySelector('[data-square="'+sq+'"]');}
function rankFiles(){
  const ranks = orientation==='white'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const files = orientation==='white'?'abcdefgh':'hgfedcba';
  return ranks.flatMap(rank=>[...files].map(file=>file+rank));
}
function updateGuides(){
  board.querySelectorAll('.square').forEach(el=>{
    const sq=el.dataset.square;
    const possible=targetMove(sq);
    el.classList.toggle('selected',sq===selected);
    el.classList.toggle('legal',!!possible);
    el.classList.toggle('hover-target',sq===hover && !!possible);
    el.classList.toggle('last',!!(active && phase==='mate' && (sq===active.to || sq===active.from)));
    el.classList.toggle('hint-origin',hintsOn && hintStep>0 && phase!=='explore' && sq===(phase==='key'?problem.key.uci.slice(0,2):active?.mate.from));
  });
}
function makePiece(type,color){
  const code=color==='w'?type.toUpperCase():type;
  const el=document.createElement('span');
  el.className='piece piece-'+type+' '+(color==='w'?'white':'black');
  el.textContent=PIECES[code];
  return el;
}
function renderBoard(){
  const position=engine();
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
    if(piece && piece.color==='w') {
      el.setAttribute('aria-label',NAME[piece.type]+' '+sq);
      el.setAttribute('role','button');
      el.tabIndex=0;
    }
    board.append(el);
  });
  updateGuides();
  if(phase==='explore') renderGhosts();
  else lines.replaceChildren();
}
function renderGhosts(){
  board.querySelectorAll('.ghost-target').forEach(el=>el.remove());
  const sameDest={};
  branches.forEach(b=>{(sameDest[b.to] ||= []).push(b);});
  branches.forEach(b=>{
    const host=squareElement(b.to);
    if(!host)return;
    const group=sameDest[b.to];
    const position=group.indexOf(b);
    const source=postKeyEngine.get(b.from);
    const button=document.createElement('button');
    button.type='button';
    button.className='ghost-target'+(solved.has(b.id)?' solved':'')+(focusFrom && b.from!==focusFrom?' muted':'')+(focusFrom===b.from?' focused':'');
    button.dataset.branch=b.id;
    button.setAttribute('aria-label','黒 '+b.san+' を検証'+(solved.has(b.id)?' 攻略済み':''));
    button.title=b.san+(solved.has(b.id)?' ✓':'');
    if(group.length>1)button.style.setProperty('--ghost-shift',((position-(group.length-1)/2)*24)+'%');
    button.append(makePiece(source.type,source.color));
    if(solved.has(b.id)){
      const mark=document.createElement('span');mark.className='ghost-check';mark.textContent='✓';button.append(mark);
    }
    button.addEventListener('click',(event)=>{
      event.stopPropagation();
      if(!busy)openBranch(b);
    });
    host.append(button);
  });
  requestAnimationFrame(drawArrows);
}
function drawArrows(){
  lines.replaceChildren();
  if(phase!=='explore')return;
  const bounds=board.getBoundingClientRect();
  if(!bounds.width)return;
  lines.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
  const svgNS='http://www.w3.org/2000/svg';
  branches.forEach((b,i)=>{
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
    path.classList.add('branch-arrow');
    if(solved.has(b.id))path.classList.add('solved');
    if(focusFrom){path.classList.add(focusFrom===b.from?'focused':'muted');}
    lines.append(path);
  });
}
function renderTray(){
  branchTray.replaceChildren();
  branchTray.classList.toggle('open',listOpen && (phase==='explore'||phase==='mate'||phase==='complete'));
  branches.forEach(b=>{
    const button=document.createElement('button');
    button.className='branch-chip'+(solved.has(b.id)?' done':'')+(active?.id===b.id?' active':'');
    button.textContent=(solved.has(b.id)?'✓ ':'')+'…'+b.san;
    button.disabled=busy;
    button.addEventListener('click',()=>{if(!busy)openBranch(b);});
    branchTray.append(button);
  });
}
function renderUI(){
  document.body.dataset.phase=phase;
  const total=branches.length;
  solvedCount.textContent=solved.size+' / '+total;
  $('branchCount').textContent=total+' LEGAL REPLIES';
  $('progressBar').style.width=(solved.size/total*100)+'%';
  if(phase==='key'){
    phaseIndex.textContent='01';
    phaseTitle.textContent='白の初手 ― Key を探す';
    helpText.textContent='白駒をタップ。表示された合法マスに指を滑らせて離すと着手します。';
  }else if(phase==='explore'){
    phaseIndex.textContent='02';
    phaseTitle.textContent='黒の防御を選んで検証する';
    helpText.textContent='黒のゴーストをタップ。黒駒をタップすると、その駒の分岐だけを強調できます。';
  }else if(phase==='mate'){
    phaseIndex.textContent='03';
    phaseTitle.textContent='白の2手目で Checkmate';
    helpText.textContent='…'+active.san+' への応手を探します。いつでも分岐点へ戻れます。';
  }else{
    phaseIndex.textContent='✓';
    phaseTitle.textContent='すべての黒手を検証しました';
    helpText.textContent='すべての合法応手にCheckmateを確認。何度でも変化を見直せます。';
  }
  backBtn.hidden=(phase==='key'||phase==='explore');
  showBranchesBtn.hidden=(phase==='key');
  showBranchesBtn.textContent=listOpen?'一覧を閉じる':'手順一覧';
  $('soundBtn').setAttribute('aria-pressed',String(audioOn));
  $('soundBtn').textContent=audioOn?'♪':'♪̸';
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
  const ms=reduceMotion.matches?65:duration;
  const dx=b.left-a.left,dy=b.top-a.top;
  try{
    const animation=sprite.animate([
      {transform:'translate3d(0,0,0) scale(1)',offset:0},
      {transform:'translate3d('+(dx*.52)+'px,'+(dy*.52)+'px,0) scale(1.09)',offset:.52},
      {transform:'translate3d('+dx+'px,'+dy+'px,0) scale(1)',offset:1}
    ],{duration:ms,easing:'cubic-bezier(.24,.75,.22,1)',fill:'forwards'});
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
async function rewindMove(beforeFen,move,afterFen,token=sequence){
  setPosition(afterFen);
  await animatedMove(move.to,move.from,beforeFen,{reverse:true,duration:240,quiet:true},token);
}
function newOperation(){
  sequence+=1;
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
}
async function attemptWhite(move){
  if(busy||!move)return;
  primeAudio();
  const token=newOperation();
  const before=viewFen;
  const played=await transitionMove(before,move,{duration:265},token);
  if(!played||!valid(token))return;
  await wait(190);
  if(!valid(token))return;
  if(phase==='key'){
    if(move.from+move.to===problem.key.uci){
      phase='explore';
      active=null;completedMate=false;focusFrom=null;
      setPosition(postKeyFen);
      cue('KEY FOUND ✓',problem.key.san+' · 黒のすべての応手を検証','key',1100);
      setFeedback('KEY FOUND', 'ここから黒のゴーストを選び、どの手にもMateがあるか確かめます。','good');
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
      await wait(240);
      if(!valid(token))return;
      refuted=await transitionMove(played,refutation,{duration:280},token);
      if(!refuted)return;
      await wait(450);
      if(!valid(token))return;
      await rewindMove(played,refutation,refuted,token);
    }else await wait(600);
    if(!valid(token))return;
    await rewindMove(before,move,played,token);
    setFeedback('初手は反証されました',refutation?'黒の '+refutation.san+' が、この仮説を壊します。':'別のKeyを探しましょう。','bad');
    hideCue();endOperation(token);return;
  }
  if(phase==='mate'){
    const test=new Chess(played);
    if(test.isCheckmate()){
      completedMate=true;
      lastPlayedMate=move;
      solved.add(active.id);
      await wait(240);
      if(!valid(token))return;
      sound('mate');
      showOverlay('CHECKMATE',move.san+' · '+solved.size+' / '+branches.length+' の応手を攻略',solved.size===branches.length?'TAP · PROOF REVIEW':'TAP · VARIATIONS','mate');
      overlayAction=()=>solved.size===branches.length?playProofSweep():returnToExplore();
      setFeedback('CHECKMATE',active.san+' への詰みが成立しました。','good');
      endOperation(token);return;
    }
    const reply=test.moves({verbose:true})[0]||null;
    cue('NOT MATE','黒にはまだ応手が残っています','bad');
    sound('error');
    let refuted=played;
    if(reply){
      await wait(230);
      if(!valid(token))return;
      refuted=await transitionMove(played,reply,{duration:280},token);
      if(!refuted)return;
      await wait(370);
      if(!valid(token))return;
      await rewindMove(played,reply,refuted,token);
    }else await wait(400);
    if(!valid(token))return;
    await rewindMove(before,move,played,token);
    setFeedback('まだCheckmateではありません','黒王の逃げ道と、黒の取り返し・合駒を確認しましょう。','bad');
    hideCue();endOperation(token);
  }
}
async function openBranch(branch){
  if(busy)return;
  primeAudio();
  if(phase==='mate' || phase==='complete'){
    await returnToExplore();
    if(busy)return;
  }
  if(phase!=='explore')return;
  const token=newOperation();
  focusFrom=branch.from;
  // Keep White input closed until the Black move physically lands.
  phase='black';active=branch;completedMate=false;lastPlayedMate=null;
  setPosition(postKeyFen);
  cue('BLACK DEFENCE','…'+branch.san,'black');
  await wait(reduceMotion.matches?35:160);
  if(!valid(token))return;
  const result=await transitionMove(postKeyFen,branch.move,{duration:425},token);
  if(!result||!valid(token))return;
  await wait(reduceMotion.matches?50:280);
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
    phase='explore';setPosition(postKeyFen);paint();return;
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
  await wait(reduceMotion.matches?40:185);
  if(!valid(token))return;
  phase='explore';active=null;completedMate=false;lastPlayedMate=null;focusFrom=null;
  hideCue();
  setFeedback('次の黒手を選びましょう','攻略済みも再選択できます。好きな順序で考えて大丈夫です。');
  endOperation(token);paint();
}
let lastPlayedMate=null;
async function playProofSweep(){
  if(busy)return;
  if(phase==='mate'){
    await returnToExplore();
    if(busy)return;
  }
  primeAudio();
  const token=newOperation();
  hideOverlay();
  hideCue();
  for(let i=0;i<branches.length;i++){
    if(!valid(token))return;
    const b=branches[i];
    cue('PROOF '+(i+1)+' / '+branches.length,'黒 …'+b.san,'black');
    const afterBlack=await transitionMove(postKeyFen,b.move,{duration:175,quiet:true},token);
    if(!afterBlack)return;
    const mating=new Chess(afterBlack);
    const mate=mating.moves({verbose:true}).find(m=>{
      const c=new Chess(afterBlack);c.move(moveSpec(m));return c.isCheckmate();
    });
    if(!mate)return;
    const afterMate=await transitionMove(afterBlack,mate,{duration:180,quiet:true},token);
    if(!afterMate)return;
    cue('CHECKMATE',mate.san+' ✓','key');
    await wait(reduceMotion.matches?25:125);
    if(!valid(token))return;
    await rewindMove(afterBlack,mate,afterMate,token);
    if(!valid(token))return;
    await rewindMove(postKeyFen,b.move,afterBlack,token);
  }
  if(!valid(token))return;
  phase='complete';active=null;completedMate=false;
  setPosition(postKeyFen);
  sound('mate');
  showOverlay('PROOF COMPLETE','黒の合法応手 '+branches.length+' 手すべてにMateを確認','TAP · REVIEW VARIATIONS','complete');
  overlayAction=()=>{hideOverlay();phase='explore';paint();};
  setFeedback('PROOF COMPLETE','Keyに対する黒の全合法応手を一手ずつ検証できました。','good');
  endOperation(token);paint();
}
function hardReset(){
  ++sequence;
  busy=false;gesture=null;selected=null;legal=[];hover=null;focusFrom=null;
  solved.clear();active=null;completedMate=false;lastPlayedMate=null;
  hintStep=0;phase='key';viewFen=initialFen;listOpen=false;
  hideCue();hideOverlay();paint();
  setFeedback('白のKeyを探しましょう','白駒をタップして合法手を確認し、指を滑らせて移動します。');
}
function selectFrom(square){
  const piece=engine().get(square);
  if(!piece||piece.color!=='w')return false;
  selected=square;legal=legalFrom(square);hover=null;updateGuides();
  return true;
}
function startGesture(e){
  if(busy||phase==='complete')return;
  primeAudio();
  if(phase==='explore'){
    if(e.target.closest('.ghost-target'))return;
    const square=e.target.closest('.square');
    const sq=square?.dataset.square;
    if(sq && postKeyEngine.get(sq)?.color==='b'){
      focusFrom=focusFrom===sq?null:sq;
      renderGhosts();
      setFeedback(focusFrom?'この黒駒の防御':'黒のすべての応手',focusFrom?'強調されたゴーストから選べます。':'自由に選んで攻略しましょう。');
    }
    return;
  }
  if(phase!=='key'&&phase!=='mate')return;
  const square=e.target.closest('.square');
  if(!square||!board.contains(square))return;
  const sq=square.dataset.square;
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
    attemptWhite(move);
  }else if(g.moved && sq!==selected){
    clearSelection();
  }else{
    hover=null;updateGuides();
  }
}
board.addEventListener('pointerdown',startGesture);
board.addEventListener('pointermove',moveGesture);
board.addEventListener('pointerup',endGesture);
board.addEventListener('pointercancel',()=>{gesture=null;hover=null;updateGuides();});
board.addEventListener('contextmenu',e=>e.preventDefault());
board.addEventListener('dragstart',e=>e.preventDefault());
board.addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const sq=e.target.closest('.square')?.dataset.square;
  if(!sq||busy)return;
  e.preventDefault();
  const move=selected&&targetMove(sq);
  if(move && sq!==selected){clearSelection();attemptWhite(move);}
  else selectFrom(sq);
});
overlay.addEventListener('click',()=>{if(!busy&&overlayAction)overlayAction();});
overlay.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!busy){e.preventDefault();overlayAction?.();}});
backBtn.addEventListener('click',()=>{
  if(busy)return;
  if(phase==='complete'){phase='explore';hideOverlay();paint();return;}
  returnToExplore();
});
showBranchesBtn.addEventListener('click',()=>{listOpen=!listOpen;renderUI();});
$('resetBtn').addEventListener('click',hardReset);
$('hintToggle').addEventListener('click',()=>{
  hintStep=(hintStep+1)%3;
  if(hintStep===1){
    setFeedback('考え方のヒント',(problem.guidance?.[phase]?.[0]||'動いた駒が空けたマスに注目しましょう。'));
  }else if(hintStep===2){
    setFeedback('注目する駒を表示','盤面の淡い輪郭を手掛かりに考えましょう。');
  }else setFeedback('ヒントを閉じました','いまの局面を自由に観察しましょう。');
  hintsOn=hintStep===2;
  updateGuides();
});
$('revealBtn').addEventListener('click',()=>{
  if(busy)return;
  if(phase==='key'){
    const m=engine().moves({verbose:true}).find(x=>x.from+x.to===problem.key.uci);
    attemptWhite(m);
  }else if(phase==='mate'){
    const c=engine();
    const m=c.moves({verbose:true}).find(move=>{const f=new Chess(c.fen());f.move(moveSpec(move));return f.isCheckmate();});
    if(m)attemptWhite(m);
  }else if(phase==='explore'){
    setFeedback('黒のゴーストを選択','任意の移動候補を選んでから答えを確認できます。');
  }else playProofSweep();
});
$('flipBtn').addEventListener('click',()=>{
  if(busy)return;
  orientation=orientation==='white'?'black':'white';
  renderBoard();
});
$('soundBtn').addEventListener('click',()=>{
  audioOn=!audioOn;
  primeAudio();renderUI();
});
window.addEventListener('resize',()=>{if(phase==='explore')requestAnimationFrame(drawArrows);});
window.__mateTwoDebug={
  state:()=>({phase,viewFen,solved:solved.size,total:branches.length,active:active?.san,busy}),
  branches:()=>branches.map(b=>({id:b.id,san:b.san,mate:b.mate.san})),
  choose:(id)=>openBranch(branches.find(b=>b.id===id)),
  reset:hardReset
};
hintsOn=false;
setPosition(initialFen);
paint();
setFeedback('白のKeyを探しましょう','白駒をタップすると合法手が広がります。スライドでもタップでも着手できます。');