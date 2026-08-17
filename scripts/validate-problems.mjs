import { Chess } from 'chess.js';
import { problems } from '../data/problems.js';

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function spec(move){
  const out={from:move.from,to:move.to};
  if(move.promotion) out.promotion=move.promotion;
  return out;
}

function uci(move){
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function findMoveByUci(chess, moveUci){
  return chess.moves({verbose:true}).find(move=>uci(move)===moveUci) || null;
}

function mateInOneMoves(chess){
  return chess.moves({verbose:true}).filter(move=>{
    const next=new Chess(chess.fen());
    next.move(spec(move));
    return next.isCheckmate();
  });
}

function isSoundTwoMoveKey(fen, keyUci){
  const afterKey=new Chess(fen);
  const key=findMoveByUci(afterKey,keyUci);
  if(!key) return false;
  afterKey.move(spec(key));

  // A #2 key must lead to Black play; an immediate mate/stalemate is not the intended two-move solution.
  if(afterKey.isGameOver()) return false;
  const replies=afterKey.moves({verbose:true});
  if(!replies.length) return false;

  return replies.every(reply=>{
    const afterDefence=new Chess(afterKey.fen());
    afterDefence.move(spec(reply));
    return mateInOneMoves(afterDefence).length>0;
  });
}

function normalizeSan(text=''){
  return text
    .replace(/^\.\.\./,'')
    .replace(/[!?]+$/g,'')
    .trim();
}

for(const problem of problems){
  const label=problem.id || problem.fen;
  assert(problem.stipulation==='#2', `${label}: validator currently expects #2`);

  const initial=new Chess(problem.fen);
  const legalFirstMoves=initial.moves({verbose:true});
  assert(legalFirstMoves.length>0, `${label}: no legal White moves`);

  const key=findMoveByUci(initial,problem.key.uci);
  assert(key, `${label}: declared key ${problem.key.uci} is illegal`);
  assert(isSoundTwoMoveKey(problem.fen,problem.key.uci), `${label}: declared key does not force mate on White's second move against every legal Black reply`);

  // Sound orthodox directmate: no second first move should also satisfy the #2 stipulation (cook).
  const workingKeys=legalFirstMoves
    .map(uci)
    .filter(candidate=>isSoundTwoMoveKey(problem.fen,candidate));
  assert(
    workingKeys.length===1 && workingKeys[0]===problem.key.uci,
    `${label}: expected unique key ${problem.key.uci}; working keys: ${workingKeys.join(', ') || 'none'}`
  );

  const afterKey=new Chess(problem.fen);
  afterKey.move(spec(findMoveByUci(afterKey,problem.key.uci)));

  // Every UI Variation is a real legal representative defence and its stored reply is actual checkmate.
  for(const variation of problem.defenses || []){
    const black=findMoveByUci(afterKey,variation.black);
    assert(black, `${label}/${variation.id}: representative defence ${variation.black} is illegal after the key`);

    const afterDefence=new Chess(afterKey.fen());
    afterDefence.move(spec(black));
    const mate=findMoveByUci(afterDefence,variation.mate);
    assert(mate, `${label}/${variation.id}: stored mate ${variation.mate} is illegal`);

    const finalPosition=new Chess(afterDefence.fen());
    finalPosition.move(spec(mate));
    assert(finalPosition.isCheckmate(), `${label}/${variation.id}: ${variation.mateSan || variation.mate} is not checkmate`);
  }

  // Tries should be legal and their stated refutation should genuinely destroy mate-in-1 on move two.
  for(const trial of problem.tries || []){
    const afterTry=new Chess(problem.fen);
    const tryMove=findMoveByUci(afterTry,trial.uci);
    assert(tryMove, `${label}: try ${trial.uci} is illegal`);
    afterTry.move(spec(tryMove));

    const wanted=normalizeSan(trial.refutation);
    const refutation=afterTry.moves({verbose:true}).find(move=>normalizeSan(move.san)===wanted);
    assert(refutation, `${label}: stated refutation ${trial.refutation} is not legal after ${trial.san || trial.uci}`);

    const refuted=new Chess(afterTry.fen());
    refuted.move(spec(refutation));
    assert(mateInOneMoves(refuted).length===0, `${label}: ${trial.refutation} does not actually refute ${trial.san || trial.uci}`);
  }

  const blackReplies=afterKey.moves({verbose:true});
  console.log(`✓ ${label}: unique key ${problem.key.san}; ${blackReplies.length} legal Black replies all admit mate-in-1; ${problem.defenses?.length || 0} UI variations verified.`);
}
