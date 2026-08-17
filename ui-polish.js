import { problems } from './data/problems.js';

const problem = problems[0];
const board = document.querySelector('#board');
const feedback = document.querySelector('#feedback');
const phaseTitle = document.querySelector('#phaseTitle');
const phaseText = document.querySelector('#phaseText');
const phaseIndex = document.querySelector('.phase-index');
const revealBtn = document.querySelector('#revealBtn');
const defenseSectionTitle = document.querySelector('#defenseSection .section-title span');
const problemIntro = document.querySelector('.problem-head p');

const PIECE_CLASS = {
  '♔':'k','♚':'k',
  '♕':'q','♛':'q',
  '♖':'r','♜':'r',
  '♗':'b','♝':'b',
  '♘':'n','♞':'n',
  '♙':'p','♟':'p'
};

let guidePhase = null;
const guideIndex = { key:0, defenses:0, mate:0 };

function normalizePieces(){
  board?.querySelectorAll('.square').forEach(square=>square.classList.remove('king-square'));
  board?.querySelectorAll('.piece').forEach(piece=>{
    const type=PIECE_CLASS[piece.textContent?.trim()];
    if(!type) return;
    ['k','q','r','b','n','p'].forEach(t=>piece.classList.remove(`piece-${t}`));
    piece.classList.add(`piece-${type}`);
    if(type==='k') piece.closest('.square')?.classList.add('king-square');
  });
}

function currentPhase(){
  return document.body.dataset.phase || 'key';
}

function renderThinkingHint(){
  if(!phaseText) return;
  const phase=currentPhase();
  const hints=problem.guidance?.[phase] || [];

  if(guidePhase!==phase){
    guidePhase=phase;
    guideIndex[phase]=0;
  }

  if(!hints.length){
    phaseText.textContent='';
    phaseText.classList.add('is-hidden');
    phaseText.setAttribute('aria-hidden','true');
    return;
  }

  const index=Math.min(guideIndex[phase] || 0,hints.length-1);
  phaseText.classList.remove('is-hidden');
  phaseText.removeAttribute('aria-hidden');
  phaseText.classList.toggle('single-guide',hints.length===1);
  phaseText.textContent=`考え方 ${index+1}/${hints.length}｜${hints[index]}${hints.length>1?'  ›':''}`;
  phaseText.setAttribute('role',hints.length>1?'button':'note');
  phaseText.setAttribute('tabindex',hints.length>1?'0':'-1');
  phaseText.setAttribute('aria-label',hints.length>1?`考え方ヒント ${index+1}/${hints.length}。タップで次のヒント`:`考え方ヒント`);
}

function nextThinkingHint(){
  const phase=currentPhase();
  const hints=problem.guidance?.[phase] || [];
  if(hints.length<=1) return;
  guideIndex[phase]=((guideIndex[phase] || 0)+1)%hints.length;
  renderThinkingHint();
}

function phaseCopy(){
  const phase=currentPhase();
  const copy={
    key:['01','① 初手（Key）を探す'],
    defenses:['02','② 防御変化（Variation）を検証する'],
    mate:['03','③ 2手目でCheckmateする']
  }[phase] || ['01','① 初手（Key）を探す'];

  if(phaseIndex && phaseIndex.textContent!==copy[0]) phaseIndex.textContent=copy[0];
  if(phaseTitle && phaseTitle.textContent!==copy[1]) phaseTitle.textContent=copy[1];

  if(revealBtn){
    if(phase==='defenses'){
      revealBtn.disabled=true;
      revealBtn.innerHTML='防御変化を選ぶ <span>↓</span>';
    }else{
      revealBtn.disabled=false;
      revealBtn.innerHTML='答えを見る <span>→</span>';
    }
  }

  renderThinkingHint();
}

function staticCopy(){
  if(defenseSectionTitle) defenseSectionTitle.textContent='黒の防御変化 · VARIATIONS';
  if(problemIntro) problemIntro.textContent='Keyを決め、黒の防御変化を1本ずつ検証し、どの変化にも白の2手目のCheckmateがあることを示します。同じ応手になる防御は代表変化にまとめています。';
}

function localizeFeedback(){
  if(!feedback) return;
  const title=feedback.querySelector('strong');
  const text=feedback.querySelector('span');
  if(!title || !text) return;

  let nextTitle=title.textContent;
  let nextText=text.textContent;

  if(nextTitle==='Quietly inspect the position.') nextTitle='まず、白のKeyを探します。';
  else if(nextTitle==='Not the key.') nextTitle='その手はKeyではありません';
  else if(nextTitle==='Not mate.') nextTitle='まだCheckmateではありません';
  else if(nextTitle==='Choose a defence.') nextTitle='黒の防御変化を選んで検証します';
  else if(nextTitle==='Proof complete.') nextTitle='すべての変化を検証しました！';
  else {
    const keyMatch=nextTitle.match(/^(.+) — key found\.$/);
    const mateMatch=nextTitle.match(/^(.+) — mate\.$/);
    const revealMatch=nextTitle.match(/^(.+) — revealed\.$/);
    if(keyMatch) nextTitle=`${keyMatch[1]}：Keyです`;
    else if(mateMatch) nextTitle=`${mateMatch[1]}：Checkmate`;
    else if(revealMatch) nextTitle=`${revealMatch[1]}：答え`;
  }

  if(nextText==='まずは黒王の周囲を見る。') nextText='盤面の仕組みを観察して、Keyを探します。';
  else if(nextText==='黒にこの手を壊す応手があります。') nextText='黒に、この初手を成立させない防御があります。';
  else if(nextText==='この黒手のあと、白は次の1手で詰ませられません。') nextText='この防御のあと、白は2手目でCheckmateできません。だからこの初手はKeyではありません。';
  else if(nextText==='黒がこう応じられるので、まだmateではありません。') nextText='黒にこの応手が残るため、まだCheckmateではありません。';
  else if(nextText==='この黒の防御に対して、白の2手目で詰ませる。') nextText='この防御変化に対する白のCheckmateを探します。';
  else if(nextText==='すべての代表防御にmateを確認しました。keyを「当てた」のではなく、構造を証明できています。') nextText='代表変化として整理した黒の防御群すべてに、白の2手目のCheckmateを確認できました。これで#2の解答が完成です。';

  if(title.textContent!==nextTitle) title.textContent=nextTitle;
  if(text.textContent!==nextText) text.textContent=nextText;
}

normalizePieces();
staticCopy();
phaseCopy();
localizeFeedback();

if(phaseText){
  phaseText.addEventListener('click',nextThinkingHint);
  phaseText.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      nextThinkingHint();
    }
  });
}

if(board){
  new MutationObserver(()=>normalizePieces()).observe(board,{childList:true,subtree:true});
}

new MutationObserver(()=>phaseCopy()).observe(document.body,{attributes:true,attributeFilter:['data-phase']});

if(phaseTitle){
  new MutationObserver(()=>phaseCopy()).observe(phaseTitle,{childList:true,characterData:true,subtree:true});
}

if(feedback){
  new MutationObserver(()=>localizeFeedback()).observe(feedback,{childList:true,characterData:true,subtree:true});
}
