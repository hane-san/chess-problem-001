import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../../vendor/chess.js';
import {kingCoverage,controlMap,controlRays,describeFailure,chooseDefence,keyRefutation,matingMoves,spec,whiteSurvival,shadowsDefeatedBy,moveId} from '../../tactics.js';
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
test('wrong key retains its authored refutation; a forcing black check still has a legal white escape',()=>{
  const c=new Chess(problems[0].fen);c.move('Kg3');const refutation=keyRefutation(c,'...Re3!');assert.equal(refutation.san,'Re3');c.move(spec(refutation));assert.deepEqual(matingMoves(c),[]);
  const d=new Chess(problems[0].fen);d.move('Kh2');d.move('Rd4');d.move('Rb6');const reply=chooseDefence(d);assert.equal(reply.san,'Rh4+');const played=d.fen();d.move(spec(reply));
  const data=describeFailure(played,reply,d.fen(),'mate');assert.equal(data.kind,'not-mate');assert(data.coverage.escapes.length>0);assert(!data.coverage.checkmate);
  const response=whiteSurvival(d);assert.equal(response.wasCheck,true);assert.equal(response.move.san,'Kg3');
  d.move(spec(response.move));assert.equal(d.fen(),response.fen);assert.deepEqual(d.attackers('g3','b'),[]);assert.equal(matingMoves(d).length,0);
});
test('batch clearance requires the exact move and an actual checkmate in every alternative position',()=>{
  const c=new Chess(problems[0].fen);c.move('Kh2');
  const branches=c.moves({verbose:true}).map(move=>{const next=new Chess(c.fen());next.move(spec(move));return {id:moveId(move),afterFen:next.fen()};});
  assert.deepEqual(shadowsDefeatedBy(branches,{from:'c2',to:'c3'}).map(b=>b.id).sort(),['d3d1','d3d5','d3d6','d3d7','d3d8']);
  assert.deepEqual(shadowsDefeatedBy(branches,{from:'f3',to:'d2'}).map(b=>b.id).sort(),['d3d2','d3e3']);
  assert.equal(shadowsDefeatedBy(branches,{from:'c2',to:'b3'}).length,2);
  assert.deepEqual(shadowsDefeatedBy(branches,{from:'b5',to:'c5'}),[]); // Same piece type is insufficient.
  assert.deepEqual(shadowsDefeatedBy(branches,{from:'c2',to:'c3',promotion:'q'}),[]);
});
test('survival never invents a reply to checkmate, and defence prioritizes an available mating move',()=>{
  const c=new Chess();c.move('f3');c.move('e5');c.move('g4');const reply=chooseDefence(c);assert.equal(reply.san,'Qh4#');c.move(spec(reply));assert.equal(whiteSurvival(c),null);
  const stalemate=new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');assert.equal(whiteSurvival(stalemate),null);
});
test('control rays stop at real occupied blockers and knight attacks retain jump semantics',()=>{
  const c=new Chess(problems[0].fen);const map=controlMap(c,'b','d3');assert(map.some(s=>s.square==='f3'));assert(!map.some(s=>s.square==='g3'));
  const rays=controlRays(c,'b','d3');assert(rays.some(r=>r.to==='f3'));assert(!rays.some(r=>r.to==='g3'));
  assert(controlRays(c,'b','b2').every(r=>r.knight));
});
