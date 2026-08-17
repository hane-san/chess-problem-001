const board = document.querySelector('#board');
const feedback = document.querySelector('#feedback');
const phaseTitle = document.querySelector('#phaseTitle');
const phaseIndex = document.querySelector('.phase-index');
const revealBtn = document.querySelector('#revealBtn');

const PIECE_CLASS = {
  '♔':'k','♚':'k',
  '♕':'q','♛':'q',
  '♖':'r','♜':'r',
  '♗':'b','♝':'b',
  '♘':'n','♞':'n',
  '♙':'p','♟':'p'
};

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

function phaseCopy(){
  const phase=document.body.dataset.phase || 'key';
  const copy={
    key:['01','① 初手（Key）を探す'],
    defenses:['02','② 防御（Defence）を検証する'],
    mate:['03','③ 詰み（Mate）を見つける']
  }[phase] || ['01','① 初手（Key）を探す'];

  if(phaseIndex && phaseIndex.textContent!==copy[0]) phaseIndex.textContent=copy[0];
  if(phaseTitle && phaseTitle.textContent!==copy[1]) phaseTitle.textContent=copy[1];

  if(revealBtn){
    if(phase==='defenses'){
      revealBtn.disabled=true;
      revealBtn.innerHTML='防御を選んで検証 <span>↓</span>';
    }else{
      revealBtn.disabled=false;
      revealBtn.innerHTML='答えを見る <span>→</span>';
    }
  }
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
  else if(nextTitle==='Not mate.') nextTitle='まだMateではありません';
  else if(nextTitle==='Choose a defence.') nextTitle='黒の防御を選んで検証します';
  else if(nextTitle==='Proof complete.') nextTitle='すべての変化を検証しました！';
  else {
    const keyMatch=nextTitle.match(/^(.+) — key found\.$/);
    const mateMatch=nextTitle.match(/^(.+) — mate\.$/);
    const revealMatch=nextTitle.match(/^(.+) — revealed\.$/);
    if(keyMatch) nextTitle=`${keyMatch[1]}：Keyです`;
    else if(mateMatch) nextTitle=`${mateMatch[1]}：Mateです`;
    else if(revealMatch) nextTitle=`${revealMatch[1]}：答え`;
  }

  if(nextText==='まずは黒王の周囲を見る。') nextText='ヒントONなら、動かす駒だけが光っています。まずはその駒の行き先を考えてみましょう。';
  else if(nextText==='黒にこの手を壊す応手があります。') nextText='黒に、この初手を成立させない防御があります。';
  else if(nextText==='この黒手のあと、白は次の1手で詰ませられません。') nextText='この防御のあと、白は2手目でMateできません。だからこの初手はKeyではありません。';
  else if(nextText==='黒がこう応じられるので、まだmateではありません。') nextText='黒にこの応手が残るため、まだMateではありません。';
  else if(nextText==='この黒の防御に対して、白の2手目で詰ませる。') nextText='この防御に対する白のMateを探します。';
  else if(nextText==='すべての代表防御にmateを確認しました。keyを「当てた」のではなく、構造を証明できています。') nextText='黒の各防御変化に対して白の2手目のMateを確認できました。これで#2の解答が完成です。';

  if(title.textContent!==nextTitle) title.textContent=nextTitle;
  if(text.textContent!==nextText) text.textContent=nextText;
}

normalizePieces();
phaseCopy();
localizeFeedback();

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
