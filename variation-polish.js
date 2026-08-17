const board = document.querySelector('#board');
const boardWrap = document.querySelector('.board-wrap');
const defenseGrid = document.querySelector('#defenseGrid');
const defenseCount = document.querySelector('#defenseCount');

let seenDone = new Set();
let resultTimer = null;
let impactTimer = null;
let proofQueued = false;

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

function showResult(progress,{final=false}={}){
  if(resultTimer){clearTimeout(resultTimer);resultTimer=null;}
  result.classList.toggle('complete',final);

  if(final){
    result.innerHTML='<strong>PROOF COMPLETE.</strong><span>どの防御にも白のMateが成立</span>';
  }else if(progress.total>0 && progress.solved===progress.total){
    result.innerHTML='<strong>ALL DEFENCES ✓</strong><span>最後に、8本の変化を順番に再生します</span>';
  }else{
    result.innerHTML=`<strong>MATE ✓</strong><span>この防御を攻略 · ${progress.solved} / ${progress.total}</span>`;
  }

  requestAnimationFrame(()=>result.classList.add('is-visible'));
  const duration=final?2300:(progress.solved===progress.total?1050:1150);
  resultTimer=setTimeout(()=>result.classList.remove('is-visible'),duration);
}

function celebrateVariation(newLabel){
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

    showResult(progress);
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
    return;
  }

  const added=[...current].filter(label=>!seenDone.has(label));
  seenDone=current;
  if(added.length) celebrateVariation(added[added.length-1]);
}

window.addEventListener('cp-proof-sweep-finished',()=>{
  showResult(parseProgress(),{final:true});
});

if(defenseGrid){
  new MutationObserver(syncSolvedVariations).observe(defenseGrid,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  syncSolvedVariations();
}
