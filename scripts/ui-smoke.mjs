import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const server = spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
const requireState = async (page,phase,timeout=5000)=>{
  await page.waitForFunction(expected=>window.__mateTwoDebug?.state().phase===expected,phase,{timeout});
};
async function tapSquare(page,sq){
  await page.locator('.square[data-square="'+sq+'"]').click({force:true});
}
async function assert(condition,reason){if(!condition)throw Error(reason);}
try{
  await sleep(900);
  browser = await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle',timeout:30000});
  await page.waitForFunction(()=>window.__mateTwoDebug?.state().total===13,{timeout:15000});
  await assert(await page.locator('.square').count()===64,'Not 64 squares');
  const boxBefore=await page.locator('#board').boundingBox();

  // A short tap reveals the FE-like full legal destinations, without a hold delay.
  await tapSquare(page,'g2');
  await assert(await page.locator('.square[data-square="h2"].legal').count()===1,'Tap did not reveal h2');
  await tapSquare(page,'h2');
  await requireState(page,'explore');
  await assert(await page.locator('.square[data-square="h2"] .piece.white').count()===1,'Key King vanished');
  await assert(await page.locator('.square[data-square="g2"] .piece').count()===0,'Key did not leave g2');
  await assert(await page.locator('.ghost-target').count()===13,'13 ghost replies not displayed');

  // Defence and mate: click the ghost, play the white knight mate, then rewind.
  await page.locator('.ghost-target[data-branch="d3d2"]').click({force:true});
  await requireState(page,'mate');
  await assert(await page.locator('.square[data-square="d2"] .piece.black').count()===1,'Rook defence missing');
  await tapSquare(page,'f3');
  await assert(await page.locator('.square[data-square="d2"].legal').count()===1,'Second move guide missing');
  await tapSquare(page,'d2');
  await page.locator('.result-overlay.visible').waitFor({timeout:5000});
  await assert((await page.locator('#resultTitle').innerText())==='CHECKMATE','Checkmate overlay missing');
  await page.locator('#resultOverlay').click({force:true});
  await requireState(page,'explore');
  await assert(await page.locator('.square[data-square="f3"] .piece.white').count()===1,'Knight was not restored on branch rewind');
  await assert(await page.locator('.square[data-square="d3"] .piece.black').count()===1,'Rook was not restored on branch rewind');
  await assert(await page.locator('.ghost-target').count()===13,'Ghosts did not return after rewind');

  // Capture branch: black rook captures White knight; Queen mates on e4.
  await page.locator('.ghost-target[data-branch="d3f3"]').click({force:true});
  await requireState(page,'mate');
  await assert(await page.locator('.square[data-square="f3"] .piece.black').count()===1,'Capture defence not applied');
  await tapSquare(page,'c2');
  await assert(await page.locator('.square[data-square="e4"].legal').count()===1,'Queen legal move missing');
  await tapSquare(page,'e4');
  await page.locator('.result-overlay.visible').waitFor({timeout:5000});
  await assert((await page.locator('#resultTitle').innerText())==='CHECKMATE','Qe4 checkmate missing');
  await page.locator('#resultOverlay').click({force:true});
  await requireState(page,'explore');
  await assert(await page.locator('.square[data-square="f3"] .piece.white').count()===1,'Captured knight not restored');
  await assert(await page.locator('.square[data-square="d3"] .piece.black').count()===1,'Capturing rook not restored');
  // Exhaustive UI path: every legally generated Black reply must be solvable
  // through the board, not merely present in the data validator.
  const remaining=await page.evaluate(()=>window.__mateTwoDebug.branches()
    .filter(b=>b.id!=='d3d2' && b.id!=='d3f3'));
  for(let i=0;i<remaining.length;i++){
    const branch=remaining[i];
    await page.locator('.ghost-target[data-branch="'+branch.id+'"]').click({force:true});
    await requireState(page,'mate');
    await tapSquare(page,branch.mateFrom);
    await assert(await page.locator('.square[data-square="'+branch.mateTo+'"].legal').count()===1,
      branch.san+' mating destination not legal');
    await tapSquare(page,branch.mateTo);
    await page.locator('.result-overlay.visible').waitFor({timeout:5000});
    await assert((await page.locator('#resultTitle').innerText())==='CHECKMATE',
      branch.san+' did not checkmate');
    await page.locator('#resultOverlay').click({force:true});
    if(i<remaining.length-1)await requireState(page,'explore');
    else{
      await page.locator('#skipProof').waitFor({state:'visible',timeout:8000});
      await page.locator('#skipProof').click({force:true});
      await requireState(page,'complete');
      await assert(await page.locator('#resultTitle').innerText()==='PROOF COMPLETE','Final proof missing');
      await assert((await page.evaluate(()=>window.__mateTwoDebug.state())).solved===13,
        'Did not verify all 13 Black replies');
    }
  }
  await page.locator('#resultOverlay').click({force:true});
  await requireState(page,'explore');
  await assert(await page.locator('.ghost-target.solved').count()===13,'All solved ghost markers missing');
  const boxAfter=await page.locator('#board').boundingBox();
  await assert(Math.abs(boxBefore.width-boxAfter.width)<2 && Math.abs(boxBefore.height-boxAfter.height)<2,'Board size jumped during interactions');
  await assert(!errors.length,'Browser exceptions: '+errors.join(' | '));

  // Wrong Key: show counterexample then undo both moves, without hiding a piece.
  await page.locator('#resetBtn').click();
  await requireState(page,'key');
  await tapSquare(page,'g2');
  await tapSquare(page,'g3');
  // Wait for the *entire* counterexample animation + reverse, not the first frame.
  await page.waitForFunction(()=>window.__mateTwoDebug?.state().busy,null,{timeout:2500});
  await page.waitForFunction(()=>!window.__mateTwoDebug?.state().busy,null,{timeout:9000});
  await assert(await page.locator('.square[data-square="g2"] .piece.white').count()===1,'Wrong-Key rewind lost the king');
  await assert(!errors.length,'Browser exceptions after wrong move: '+errors.join(' | '));

  console.log('✓ Browser smoke: Key / all 13 Black branches / capture / rewind / proof completion & skip / board stability / wrong-Key restore');
}finally{
  await browser?.close();
  server.kill();
}