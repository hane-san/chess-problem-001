import { Chess } from './vendor/chess.js';

export const SQUARES = Array.from({length:8},(_,rank)=>[...'abcdefgh'].map(file=>file+(rank+1))).flat();
export const spec = move => ({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
export const opposite = color => color==='w'?'b':'w';
export function kingSquare(position,color){return SQUARES.find(square=>position.get(square)?.type==='k'&&position.get(square).color===color);}
export function matingMoves(position){
  return position.moves({verbose:true}).filter(move=>{
    const next=new Chess(position.fen());next.move(spec(move));return next.isCheckmate();
  });
}
function forTurn(position,color){
  if(position.turn()===color)return new Chess(position.fen());
  const fen=position.fen().split(' ');fen[1]=color;fen[3]='-';
  return new Chess(fen.join(' '));
}
export function kingCoverage(position,color){
  const king=kingSquare(position,color),enemy=opposite(color);
  if(!king)throw new Error('Missing king for coverage');
  const turn=forTurn(position,color);
  const escapes=turn.moves({square:king,verbose:true}).filter(m=>Math.abs(m.to.charCodeAt(0)-king.charCodeAt(0))<=1&&Math.abs(Number(m.to[1])-Number(king[1]))<=1).map(m=>m.to);
  const cells=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    if(!dx&&!dy)continue;
    const file=king.charCodeAt(0)+dx,rank=Number(king[1])+dy;
    if(file<97||file>104||rank<1||rank>8)continue;
    const square=String.fromCharCode(file)+rank;
    const occupant=position.get(square);
    if(occupant?.color===color){cells.push({square,kind:'occupied',attackers:[],piece:occupant.type});continue;}
    // The king vacating its square can uncover a rook/bishop/queen line.
    // Evaluate the destination in that hypothetical position, not the original attack map.
    const test=new Chess(position.fen());test.remove(king);
    if(occupant?.type!=='k')test.remove(square);
    test.put({type:'k',color},square);
    const attackers=occupant?.type==='k'?[square]:test.attackers(square,enemy);
    cells.push({square,kind:escapes.includes(square)?'escape':'controlled',attackers});
  }
  return {king,color,escapes,cells,checkers:position.attackers(king,enemy),inCheck:turn.isCheck(),checkmate:turn.isCheckmate(),stalemate:turn.isStalemate()};
}
export function controlMap(position,color,source=null){
  return SQUARES.map(square=>({square,attackers:position.attackers(square,color).filter(from=>!source||from===source)})).filter(cell=>cell.attackers.length);
}
export function controlRays(position,color,source=null){
  const map=controlMap(position,color,source),groups=new Map();
  for(const cell of map)for(const from of cell.attackers){
    const piece=position.get(from);
    const dx=cell.square.charCodeAt(0)-from.charCodeAt(0),dy=Number(cell.square[1])-Number(from[1]);
    const direction=['r','b','q'].includes(piece.type)?Math.sign(dx)+','+Math.sign(dy):cell.square;
    const key=from+':'+direction,old=groups.get(key);
    if(!old||Math.hypot(dx,dy)>old.distance)groups.set(key,{from,to:cell.square,color,distance:Math.hypot(dx,dy),kind:'control',knight:piece.type==='n'});
  }
  return [...groups.values()];
}
export function chooseDefence(position){
  const options=position.moves({verbose:true});
  return options.map(move=>{
    const next=new Chess(position.fen());next.move(spec(move));
    const score=(next.isCheckmate()?1000:0)+(move.captured?80:0)+(move.piece==='k'?100:0)+(next.isCheck()?20:0);
    return {move,score};
  }).sort((a,b)=>b.score-a.score)[0]?.move || null;
}
export function keyRefutation(position,preferredSan=''){
  const refutes=move=>{
    const next=new Chess(position.fen());next.move(spec(move));return matingMoves(next).length===0;
  };
  const moves=position.moves({verbose:true});
  const preferred=moves.find(move=>move.san===preferredSan.replace(/^\.\.\./,'').replace(/[!?]+$/,''));
  if(preferred&&refutes(preferred))return preferred;
  return moves.find(refutes)||null;
}
export function describeFailure(playedFen,reply,afterFen,returnPhase){
  const before=new Chess(playedFen),after=new Chess(afterFen);
  const whiteMated=after.turn()==='w'&&after.isCheckmate();
  const coverage=kingCoverage(after,whiteMated?'w':'b');
  const prefix=reply?'黒の '+reply.san+'。':'';
  if(whiteMated)return {title:'白王がチェックメイトされます',detail:prefix+'赤い矢印が王手と周囲への利き。白に合法な応手が残っていません。',coverage,kind:'white-mated'};
  if(before.isStalemate())return {title:'王手ではなく、ステイルメイトです',detail:'黒は動けませんが王手も受けていません。詰みではなく引き分けになります。',coverage,kind:'stalemate'};
  if(returnPhase==='key')return {title:'この初手には黒の反証があります',detail:prefix+'この後、白の一手で詰ませる手がありません。青いマスは黒王の逃げ先、緑の矢印は白の利きです。',coverage,kind:'key-refuted'};
  const reason=reply?.piece==='k'?'黒王が '+reply.from+' → '+reply.to+' に逃げられます。':reply?.captured?'黒は '+reply.to+' の白駒を取れます。':reply&&before.isCheck()?'黒は王手を遮る・受ける手を残しています。':'白の着手が詰みになっていません。';
  return {title:reply?.piece==='k'?'黒王に逃げ道が残っています':reply?.captured?'黒に取り返す手があります':'黒に合法な応手が残っています',detail:prefix+reason+' 利きと逃げ道を盤上で確認しましょう。',coverage,kind:'not-mate'};
}
