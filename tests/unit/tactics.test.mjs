import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../../vendor/chess.js';
import {kingCoverage,controlMap,controlRays,describeFailure,chooseDefence,keyRefutation,matingMoves,spec} from '../../tactics.js';
import {problems} from '../../data/problems.js';

test('all 13 actual mates have no king escape; every coverage arrow names a real attacker',()=>{
  const key=new Chess(problems[0].fen);key.move('Kh2');
  const replies=key.moves({verbose:true});assert.equal(replies.length,13);
  for(const reply of replies){
    const after=new Chess(key.fen());after.move(spec(reply));
    for(const mate of matingMoves(after)){
      const final=new Chess(after.fen());final.move(spec(mate));const coverage=kingCoverage(final,'b');
      assert.equal(coverage.checkmate,true);assert.deepEqual(coverage.escapes,[]);assert(coverage.checkers.length>0);
      assert(coverage.cells.every(c=>c.kind==='occupied'||c.attackers.length>0));
    }
  }
});
test('Fool’s mate is classified as white checkmate, with black queen h4 checking e1',()=>{
  const c=new Chess();c.move('f3');c.move('e5');c.move('g4');const before=c.fen();const reply=c.moves({verbose:true}).find(m=>m.san==='Qh4#');c.move(spec(reply));
  const data=describeFailure(before,reply,c.fen(),'mate');
  assert.equal(data.kind,'white-mated');assert.equal(data.coverage.king,'e1');assert(data.coverage.checkers.includes('h4'));assert.deepEqual(data.coverage.escapes,[]);
});
test('coverage accounts for lines revealed when a king vacates its original square',()=>{
  const c=new Chess('8/8/8/8/8/8/8/R2k3K b - - 0 1');
  const data=kingCoverage(c,'b');const e1=data.cells.find(s=>s.square==='e1');
  assert.equal(e1.kind,'controlled');assert(e1.attackers.includes('a1'));assert(!data.escapes.includes('e1'));
});
test('wrong key Kg3 has the authored Re3 refutation, and wrong second move allows a real black escape',()=>{
  const c=new Chess(problems[0].fen);c.move('Kg3');const refutation=keyRefutation(c,'...Re3!');assert.equal(refutation.san,'Re3');c.move(spec(refutation));assert.deepEqual(matingMoves(c),[]);
  const d=new Chess(problems[0].fen);d.move('Kh2');d.move('Rd4');d.move('Rb6');const reply=chooseDefence(d);assert.equal(reply.piece,'k');const played=d.fen();d.move(spec(reply));
  const data=describeFailure(played,reply,d.fen(),'mate');assert.equal(data.kind,'not-mate');assert(data.coverage.escapes.length>0);assert(!data.coverage.checkmate);
});
test('control rays stop at real occupied blockers and knight attacks retain jump semantics',()=>{
  const c=new Chess(problems[0].fen);const map=controlMap(c,'b','d3');assert(map.some(s=>s.square==='f3'));assert(!map.some(s=>s.square==='g3'));
  const rays=controlRays(c,'b','d3');assert(rays.some(r=>r.to==='f3'));assert(!rays.some(r=>r.to==='g3'));
  assert(controlRays(c,'b','b2').every(r=>r.knight));
});
