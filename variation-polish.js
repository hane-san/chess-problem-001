const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const defenseGrid = document.querySelector('#defenseGrid');
const defenseCount = document.querySelector('#defenseCount');

let seenDone = new Set();
let resultTimer = null;
let impactTimer = null;
let proofQueued = false;
let awaitingNext = false;
let advancing = false;
let pendingSolvedLabel = null;
let pendingMateDetail = null;

const result = document.createElement('div');
result.className = 'variation-result';
result.setAttribute('aria-live','polite');
boardWrap?.append(result);

function doneLabels(){
  return new Set([...defenseGrid.querySelectorAll('.defense-chip.done')].map(button=>button.textContent.trim()));
}

function parseProgress(){
  const match=(defenseCount?.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
  return match ? {solved:Number(match[1]),total:Number(match[2])} : {solved:0,total:0};
}

function findBlackKingSquare(){
  const king=[...board.querySelectorAll('.piece.black')].find(piece=>piece.textContent.trim()==='♚');
  return king?.closest('.square') || null;
}

function nextDefenseButton(){
  return [...defenseGrid.querySelectorAll('.defense-chip')]
    .find(button=>!button.classList.contains('done')&&!button.disabled) || null;
}

function closeResult(){
  awaitingNext=false;
  advancing=false;
  result.classList.remove('is-visible','next-ready');
  boardWrap?.classList.remove('awaiting-next');
}

function showResult(progress,{final=false,mateSan=''}={}){
  if(resultTimer){clearTimeout(resultTimer);resultTimer=null;}
  awaitingNext=false;
  advancing=false;
  result.classList.toggle('complete',final);
  result.classList.remove('next-ready');
  boardWrap?.classList.remove('awaiting-next');

  if(final){
    result.innerHTML='<strong>PROOF COMPLETE.</strong><span>どの防御変化にも白のMateが成立</span>';
  }else if(progress.total>0 && progress.solved===progress.total){
    result.innerHTML='<strong>ALL VARIATIONS ✓</strong><span>最後に、防御変化を順番に再生して証明を見直します</span>';
  }else{
    awaitingNext=true;
    result.classList.add('next-ready');
    boardWrap?.classList.add('awaiting-next');
    const move = mateSan ? `${mateSan} · ` : '';
    result.innerHTML=`<strong>CHECKMATE</strong><span>${move}この変化を攻略 · ${progress.solved} / ${progress.total}</span><em>TAP → NEXT DEFENCE</em>`;
  }

  requestAnimationFrame(()=>result.classList.add('is-visible'));

  if(final){
    resultTimer=setTimeout(()=>result.classList.remove('is-visible'),2600);
  }else if(progress.solved===progress.total){
    resultTimer=setTimeout(()=>result.classList.remove('is-visible'),1050);
  }
}

async function advanceToNext(){
  if(!awaitingNext||advancing) return;
  const next=nextDefenseButton();
  if(!next) return;
  advancing=true;
  awaitingNext=false;
  boardWrap?.classList.remove('awaiting-next');
  result.classList.remove('next-ready');
  result.innerHTML='<strong>BRANCH RESET</strong><span>Key後の分岐点へ戻して、次の防御変化を見ます</span>';
  await new Promise(resolve=>setTimeout(resolve,260));
  result.classList.remove('is-visible');
  advancing=false;
  requestAnimationFrame(()=>next.click());
}

function celebrateVariation(newLabel,{mateSan=''}={}){
  requestAnimationFrame(()=>{
    const progress=parseProgress();
    const complete=progress.total>0 && progress.solved===progress.total;
    const blackKing=findBlackKingSquare();
    if(blackKing){
      blackKing.classList.remove('mate-impact');
      void blackKing.offsetWidth;
      blackKing.classList.add('mate-impact');
      if(impactTimer) clearTimeout(impactTimer);
      impactTimer=setTimeout(()=>blackKing.classList.remove('mate-impact'),1100);
    }

    const solvedButton=[...defenseGrid.querySelectorAll('.defense-chip.done')]
      .find(button=>button.textContent.trim()===newLabel);
    if(solvedButton){
      solvedButton.classList.remove('just-solved');
      void solvedButton.offsetWidth;
      solvedButton.classList.add('just-solved');
      setTimeout(()=>solvedButton.classList.remove('just-solved'),850);
    }

    showResult(progress,{mateSan});
    if(navigator.vibrate) navigator.vibrate(complete?[18,40,24]:18);

    if(complete && !proofQueued){
      proofQueued=true;
      setTimeout(()=>{
        result.classList.remove('is-visible');
        window.dispatchEvent(new CustomEvent('cp-proof-sweep'));
      },1080);
    }
  });
}

function syncSolvedVariations(){
  if(!defenseGrid) return;
  const current=doneLabels();

  if(current.size < seenDone.size){
    seenDone=current;
    proofQueued=false;
    pendingSolvedLabel=null;
    pendingMateDetail=null;
    closeResult();
    return;
  }

  const added=[...current].filter(label=>!seenDone.has(label));
  seenDone=current;
  if(!added.length) return;

  const newest=added[added.length-1];
  if(document.body.classList.contains('mate-settling')){
    pendingSolvedLabel=newest;
    return;
  }
  celebrateVariation(newest,pendingMateDetail || {});
  pendingMateDetail=null;
}

result.addEventListener('pointerup',event=>{
  if(!awaitingNext) return;
  event.preventDefault();
  advanceToNext();
});

document.addEventListener('pointerdown',event=>{
  if(event.target.closest?.('.defense-chip')) closeResult();
},true);

window.addEventListener('cp-mate-settled',event=>{
  pendingMateDetail=event.detail || {};
  if(pendingSolvedLabel){
    const label=pendingSolvedLabel;
    pendingSolvedLabel=null;
    celebrateVariation(label,pendingMateDetail);
    pendingMateDetail=null;
  }
});

window.addEventListener('cp-proof-sweep-finished',()=>{
  showResult(parseProgress(),{final:true});
});

if(defenseGrid){
  new MutationObserver(syncSolvedVariations).observe(defenseGrid,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  syncSolvedVariations();
}
