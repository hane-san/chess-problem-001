import { test as base, expect } from '@playwright/test';

const test=base.extend({
  app: async({page},use,testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Move operation failed'))errors.push(m.text());});
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    const tap=locator=>testInfo.project.use.hasTouch?locator.tap():locator.click();
    const sq=square=>page.locator(`.square[data-square="${square}"]`);
    const state=()=>page.evaluate(()=>window.__mateTwoDebug?.state());
    const phase=async(expected,timeout=10000)=>{
      await expect.poll(async()=>{const s=await state();return !s?'loading':!s.busy?s.phase:'busy';},{timeout}).toBe(expected);
    };
    await page.goto('/');await expect(page.locator('.square')).toHaveCount(64);
    await use({tap,sq,state,phase});expect(errors).toEqual([]);
  }
});
async function key(page,app){
  await app.tap(app.sq('g2'));await expect(app.sq('h2')).toHaveClass(/legal/);
  await app.tap(app.sq('h2'));await app.phase('explore');
}
async function open(page,app,id){
  if((await app.state()).solvedIds.includes(id)){
    if(!await page.locator('#branchTray').evaluate(el=>el.classList.contains('open')))await app.tap(page.locator('#showBranchesBtn'));
    await app.tap(page.locator(`.branch-chip[data-branch="${id}"]`));await app.phase('mate');return;
  }
  if((await app.state()).focusFrom!==id.slice(0,2))await app.tap(app.sq(id.slice(0,2)));
  await app.tap(page.locator(`.shadow-choice[data-branch="${id}"]`));await app.phase('mate');
}
async function solve(page,app,branch,last=false){
  await open(page,app,branch.id);
  await app.tap(app.sq(branch.mateFrom));await expect(app.sq(branch.mateTo)).toHaveClass(/legal/);
  await app.tap(app.sq(branch.mateTo));await app.phase(last?'complete':'explore');
}
async function wrongMate(page,app){
  await key(page,app);await open(page,app,'d3d4');
  const before=(await app.state()).viewFen;
  await app.tap(app.sq('b5'));await app.tap(app.sq('b6'));await app.phase('explain');
  await app.tap(page.locator('#pauseExplanationBtn'));
  return before;
}
async function seedCompleted(page,app){
  await page.evaluate(()=>{
    const k='mate-two:progress:cp-0001',saved=JSON.parse(localStorage.getItem(k));
    saved.phase='explore';saved.active=null;saved.solved=window.__mateTwoDebug.branches().map(b=>b.id);
    localStorage.setItem(k,JSON.stringify(saved));
  });
  await page.reload();await app.phase('explore');
}

test('shadow choice has no arrows; selected black piece materializes with only faint, inert remaining shadows',async({page,app})=>{
  await key(page,app);await expect(page.locator('.ghost-target')).toHaveCount(0);
  await app.tap(app.sq('d3'));await expect(page.locator('.shadow-choice')).toHaveCount(9);
  await expect(page.locator('#branchLines path')).toHaveCount(0);
  await app.tap(app.sq('d3'));await expect(page.locator('.shadow-choice')).toHaveCount(0);
  await app.tap(app.sq('b2'));await expect(page.locator('.shadow-choice')).toHaveCount(2);
  await app.tap(app.sq('d3'));await expect(page.locator('.shadow-choice')).toHaveCount(9);
  await open(page,app,'d3d2');
  await expect(app.sq('d2').locator(':scope > .piece.black')).toHaveCount(1);
  await expect(page.locator('.shadow-choice')).toHaveCount(0);
  await expect(page.locator('.ghost-residue')).toHaveCount(8);
  await expect(page.locator('.ghost-residue').first()).toHaveCSS('pointer-events','none');
  await expect(page.locator('#branchLines path')).toHaveCount(0);
  await expect(app.sq('f3')).toHaveClass(/hint-origin/);
  await expect(app.sq('c2')).not.toHaveClass(/hint-origin/);
});

test('all 13 defences auto-rewind, clear exactly matching shadows, restore captures and leave a clean completed board',async({page,app})=>{
  test.setTimeout(100_000); // 13 distinct mate explanations take longer in mobile WebKit.
  const board=await page.locator('#board').boundingBox();await key(page,app);
  const branches=await page.evaluate(()=>window.__mateTwoDebug.branches());expect(branches).toHaveLength(13);
  const cleared=new Set();
  for(const b of branches){
    branches.filter(other=>other.mates.includes(b.mateFrom+b.mateTo)).forEach(other=>cleared.add(other.id));
    await solve(page,app,b,cleared.size===13);
    await expect(page.locator('#progressTrack')).toHaveAttribute('aria-valuenow',String(cleared.size));
    expect(new Set((await app.state()).solvedIds)).toEqual(cleared);
    await expect(page.locator(`.shadow-choice[data-branch="${b.id}"]`)).toHaveCount(0);
    await expect(app.sq('f3').locator(':scope > .piece.white')).toHaveCount(1);
    await expect(app.sq('d3').locator(':scope > .piece.black')).toHaveCount(1);
    await expect(page.locator('#resultOverlay')).toBeHidden();
    await expect(page.locator('.analysis-arrow')).toHaveCount(0);
  }
  await expect(page.locator('.ghost-target')).toHaveCount(0);
  await expect(page.locator('.branch-origin-done')).toHaveCount(3);
  const after=await page.locator('#board').boundingBox();expect(after.width).toBeCloseTo(board.width,0);expect(after.height).toBeCloseTo(board.height,0);
  await page.reload();await app.phase('explore');await expect(page.locator('#solvedCount')).toHaveText('13 / 13');
  await app.tap(app.sq('d3'));await expect(page.locator('.shadow-choice')).toHaveCount(0);
  await app.tap(page.locator('#showBranchesBtn'));await app.tap(page.locator('.branch-chip').filter({hasText:'Rd2+'}));await app.phase('mate');
  await app.tap(page.locator('#revealBtn'));await app.phase('complete');await expect(page.locator('#solvedCount')).toHaveText('13 / 13');
});

test('one exact knight move clears two shadows; a different queen move clears only its matching shadow',async({page,app})=>{
  await key(page,app);const branches=await page.evaluate(()=>window.__mateTwoDebug.branches());
  await solve(page,app,branches.find(b=>b.id==='d3d2'));await expect(page.locator('.shadow-choice')).toHaveCount(7);
  expect((await app.state()).solvedIds.sort()).toEqual(['d3d2','d3e3']);
  await solve(page,app,branches.find(b=>b.id==='d3f3'));await expect(page.locator('.shadow-choice')).toHaveCount(6);
  await expect(page.locator('.shadow-choice[data-branch="d3d2"],.shadow-choice[data-branch="d3f3"]')).toHaveCount(0);
  await expect(app.sq('f3').locator(':scope > .piece.white')).toHaveCount(1);
});

test('wrong mate shows a black check and a safe white escape, with pausable diagrams and exact retry',async({page,app})=>{
  const before=await wrongMate(page,app);
  expect((await app.state()).explanation).toMatchObject({mode:'survival',kind:'not-mate',reply:'Rh4+',from:'d4',to:'h4',survival:'Kg3',autoRewind:false});
  await expect(page.locator('#explanationDetail')).toContainText('黒 Rh4+ → 白 Kg3');
  await expect(page.locator('.analysis-arrow.survival')).toHaveAttribute('data-from','h2');
  await expect(page.locator('.analysis-arrow.survival')).toHaveAttribute('data-to','g3');
  await expect(app.sq('g3').locator(':scope > .piece.white')).toBeVisible();
  await app.tap(page.locator('#coverageViewBtn'));
  await expect(page.locator('.analysis-escape')).not.toHaveCount(0);
  await expect(page.locator('#explanationPanel')).toBeVisible();
  await expect(page.locator('#solvedCount')).toHaveText('0 / 13');
  await page.waitForTimeout(4000);await app.phase('explain'); // Pausing cancels automatic rewind.
  await app.tap(page.locator('#responseViewBtn'));await app.phase('explain');
  await expect(page.locator('.analysis-arrow.response')).toHaveAttribute('data-from','d4');
  await expect(page.locator('.analysis-arrow.response')).toHaveAttribute('data-to','h4');
  await app.tap(page.locator('#blackControlBtn'));
  await expect(page.locator('.analysis-black')).not.toHaveCount(0);
  await expect(page.locator('.analysis-arrow.black-control')).not.toHaveCount(0);
  await app.tap(app.sq('h4'));
  const origins=await page.locator('.analysis-arrow').evaluateAll(nodes=>nodes.map(n=>n.dataset.from));expect(new Set(origins)).toEqual(new Set(['h4']));
  const path=await page.locator('.analysis-arrow').first().getAttribute('d');
  await app.tap(page.locator('#flipBtn'));await expect(page.locator('.analysis-arrow').first()).not.toHaveAttribute('d',path);
  await app.tap(page.locator('#flipBtn'));
  await app.tap(app.sq('h4'));await app.tap(page.locator('#survivalViewBtn'));await app.phase('explain');
  await app.tap(page.locator('#retryBtn'));await app.phase('mate');
  expect((await app.state()).viewFen).toBe(before);await expect(page.locator('.analysis-arrow')).toHaveCount(0);
  await expect(page.locator('#boardLegend')).toBeHidden();await expect(page.locator('.ghost-residue')).toHaveCount(8);
  await expect(app.sq('f3')).toHaveClass(/hint-origin/);
});

test('wrong key uses its true refutation and reload resumes a clean legal checkpoint',async({page,app})=>{
  const initial=(await app.state()).viewFen;await app.tap(app.sq('g2'));await app.tap(app.sq('g3'));await app.phase('explain');
  await app.tap(page.locator('#pauseExplanationBtn'));
  expect((await app.state()).explanation).toMatchObject({kind:'key-refuted',reply:'Re3',from:'d3',to:'e3',returnPhase:'key'});
  await expect(page.locator('#feedback strong')).toHaveText('この初手には黒の反証があります');
  await app.tap(page.locator('#retryBtn'));await app.phase('key');expect((await app.state()).viewFen).toBe(initial);
  await app.tap(app.sq('g2'));await app.tap(app.sq('g3'));await app.phase('explain');
  await page.reload();await app.phase('key');expect((await app.state()).viewFen).toBe(initial);await expect(page.locator('.analysis-arrow')).toHaveCount(0);
});

test('winning-piece hints default on, turn off and persist across branch changes, retries, reset and reload',async({page,app})=>{
  await expect(page.locator('#hintToggle')).toHaveAttribute('aria-pressed','true');await expect(app.sq('g2')).toHaveClass(/hint-origin/);
  await app.tap(page.locator('#hintToggle'));await expect(page.locator('.hint-origin')).toHaveCount(0);
  await key(page,app);await open(page,app,'d3d2');await expect(page.locator('.hint-origin')).toHaveCount(0);
  await app.tap(page.locator('#hintToggle'));await expect(app.sq('f3')).toHaveClass(/hint-origin/);
  await app.tap(page.locator('#hintToggle'));await page.reload();await app.phase('mate');await expect(page.locator('.hint-origin')).toHaveCount(0);
  await expect(page.locator('#hintToggle')).toHaveAttribute('aria-pressed','false');
  await app.tap(page.locator('#resetBtn'));await app.phase('key');await expect(page.locator('.hint-origin')).toHaveCount(0);
  await app.tap(page.locator('#hintToggle'));await page.reload();await expect(app.sq('g2')).toHaveClass(/hint-origin/);
});

test('save and restore keep cleared shadows, active branch, orientation and audio preferences',async({page,app})=>{
  await key(page,app);const b=await page.evaluate(()=>window.__mateTwoDebug.branches().find(b=>b.id==='d3f3'));await solve(page,app,b);
  await open(page,app,'d3d4');const fen=(await app.state()).viewFen;
  await app.tap(page.locator('#flipBtn'));await app.tap(page.locator('#soundBtn'));await page.reload();await app.phase('mate');
  expect((await app.state()).viewFen).toBe(fen);await expect(page.locator('#solvedCount')).toHaveText('1 / 13');
  await expect(page.locator('.square').first()).toHaveAttribute('data-square','h1');await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.ghost-residue[data-branch="d3f3"]')).toHaveCount(0);
  await expect(page.locator('.ghost-residue')).toHaveCount(7);
});

test('reset cancels a move, a black reply, a failure replay and victory removal without delayed mutations',async({page,app})=>{
  const initial=(await app.state()).viewFen;
  await page.emulateMedia({reducedMotion:'no-preference'});await app.tap(page.locator('#revealBtn'));
  await expect.poll(async()=>(await app.state()).busy).toBe(true);await app.tap(page.locator('#resetBtn'));await page.waitForTimeout(800);await app.phase('key');expect((await app.state()).viewFen).toBe(initial);
  await page.emulateMedia({reducedMotion:'reduce'});await key(page,app);await app.tap(app.sq('d3'));
  await page.emulateMedia({reducedMotion:'no-preference'});await app.tap(page.locator('.shadow-choice[data-branch="d3d2"]'));
  await expect.poll(async()=>(await app.state()).phase).toBe('black');await app.tap(page.locator('#resetBtn'));await page.waitForTimeout(1000);await app.phase('key');
  await page.emulateMedia({reducedMotion:'reduce'});await wrongMate(page,app);
  await page.emulateMedia({reducedMotion:'no-preference'});await app.tap(page.locator('#responseViewBtn'));await app.tap(page.locator('#resetBtn'));await page.waitForTimeout(1400);await app.phase('key');
  await page.emulateMedia({reducedMotion:'reduce'});await key(page,app);await open(page,app,'d3d2');
  await app.tap(app.sq('f3'));await app.tap(app.sq('d2'));await expect.poll(async()=>(await app.state()).phase).toBe('victory');
  await app.tap(page.locator('#resetBtn'));await page.waitForTimeout(700);await app.phase('key');
  await expect(page.locator('.move-sprite,.ghost-target,.analysis-arrow')).toHaveCount(0);await expect(page.locator('#explanationPanel')).toBeHidden();await expect(page.locator('#solvedCount')).toHaveText('0 / 13');
});

test('optional proof review completes, skips and cancels cleanly after all shadows are gone',async({page,app})=>{
  await seedCompleted(page,app);await app.tap(page.locator('#revealBtn'));await expect(page.locator('#skipProof')).toBeVisible();
  await app.tap(page.locator('#skipProof'));await app.phase('complete');await expect(page.locator('#resultTitle')).toHaveText('PROOF COMPLETE');
  await app.tap(page.locator('#resultOverlay'));await app.phase('explore');await expect(page.locator('.shadow-choice')).toHaveCount(0);
  await app.tap(page.locator('#revealBtn'));await app.phase('complete',30000);await app.tap(page.locator('#resultOverlay'));
  await app.tap(page.locator('#revealBtn'));await expect(page.locator('#skipProof')).toBeVisible();await app.tap(page.locator('#resetBtn'));
  await page.waitForTimeout(400);await app.phase('key');await expect(page.locator('#resultOverlay')).toBeHidden();
});

test('keyboard and pointer cancellation preserve selection and reach shadow buttons',async({page,app})=>{
  await app.tap(app.sq('g2'));await page.locator('#board').dispatchEvent('pointercancel',{pointerId:1});await expect(page.locator('.selected')).toHaveCount(0);
  await app.sq('g2').focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await expect(app.sq('h2')).toBeFocused();await page.keyboard.press('Enter');await app.phase('explore');
  await app.sq('d3').focus();await page.keyboard.press('Enter');await page.locator('.shadow-choice[data-branch="d3d2"]').focus();await page.keyboard.press('Enter');await app.phase('mate');
});

test('storage unavailable or malformed still permits solving and failures still permit retry',async({page,app})=>{
  await page.evaluate(()=>localStorage.setItem('mate-two:progress:cp-0001','{invalid'));await page.reload();await app.phase('key');
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('denied');};Storage.prototype.setItem=()=>{throw Error('denied');};});await page.reload();
  await expect(page.locator('#saveStatus')).toContainText('保存できません');await wrongMate(page,app);await app.tap(page.locator('#retryBtn'));await app.phase('mate');
});

test('startup failure offers a retry which restores the board',async({page,app})=>{
  await page.route('**/tactics.js*',r=>r.abort());await page.reload();await expect(page.locator('#startupError')).toBeVisible();
  await page.unroute('**/tactics.js*');await app.tap(page.locator('#startupError button'));await expect(page.locator('.square')).toHaveCount(64);await expect(page.locator('#startupError')).toBeHidden();
});

test('full-motion victory animates the attacker and shadow defeat, then leaves no sprites or disabled candidates',async({page,app})=>{
  await key(page,app);await open(page,app,'d3d2');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await app.tap(app.sq('f3'));await app.tap(app.sq('d2'));
  await expect(page.locator('.shadow-defeated')).toHaveCount(2);
  await expect(page.locator('.victory-attacker')).toBeVisible();
  await app.phase('explore');await expect(page.locator('.move-sprite,.shadow-defeated')).toHaveCount(0);
  await expect(page.locator('.shadow-choice')).toHaveCount(7);
  await expect(page.locator('.shadow-choice').first()).toBeEnabled();
  await expect(app.sq('f3').locator(':scope > .piece.white')).toBeVisible();
});

test('five matching shadows shatter together before a beat and rewind; progress survives reload during the beat',async({page,app})=>{
  await key(page,app);await open(page,app,'d3d5');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await app.tap(app.sq('c2'));await app.tap(app.sq('c3'));
  await expect(page.locator('.shadow-defeated')).toHaveCount(5);
  const ids=await page.locator('.shadow-defeated').evaluateAll(nodes=>nodes.map(n=>n.dataset.branch).sort());
  expect(ids).toEqual(['d3d1','d3d5','d3d6','d3d7','d3d8']);
  await expect(page.locator('.shatter-fragment')).toHaveCount(30);
  const beat=await page.waitForFunction(()=>{
    const s=window.__mateTwoDebug.state();if(s.playbackStage!=='hold')return false;
    return {phase:s.phase,solved:s.solved,queen:getComputedStyle(document.querySelector('[data-square="c3"] > .piece.white')).visibility,rook:getComputedStyle(document.querySelector('[data-square="d5"] > .piece.black')).visibility};
  });
  expect(await beat.jsonValue()).toEqual({phase:'victory',solved:5,queen:'visible',rook:'hidden'});
  await page.reload();await app.phase('explore');
  await expect(page.locator('#solvedCount')).toHaveText('5 / 13');
  await expect(app.sq('c2').locator(':scope > .piece.white')).toBeVisible();
  await expect(page.locator('.shadow-choice')).toHaveCount(4);
  await expect(page.locator('.move-sprite,.shatter-fragment')).toHaveCount(0);
});

test('failure automatically breaks the unsuccessful move, pauses, then rewinds every demonstrated move exactly',async({page,app})=>{
  await key(page,app);await open(page,app,'d3d4');const before=(await app.state()).viewFen;
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Observe the short hold before the operation starts. Polling *after* the
  // 6 fracture pieces appear can miss the entire short-lived beat on WebKit.
  await page.evaluate(()=>{
    window.__failureStages=[];
    const snapshot=()=>{
      const stage=document.body.dataset.playback;
      const rook=document.querySelector('[data-square="b6"] > .piece.white');
      window.__failureStages.push({stage,rook:rook?getComputedStyle(rook).visibility:null});
    };
    const observer=new MutationObserver(snapshot);
    observer.observe(document.body,{attributes:true,attributeFilter:['data-playback']});
    window.__stopFailureObserver=()=>observer.disconnect();
  });
  await app.tap(app.sq('b5'));await app.tap(app.sq('b6'));await app.phase('explain');
  expect((await app.state()).explanation).toMatchObject({survival:'Kg3',autoRewind:true});
  await app.phase('mate',25000);
  const stages=await page.evaluate(()=>{window.__stopFailureObserver?.();return window.__failureStages;});
  expect(stages.some(x=>x.stage==='shatter')).toBe(true);
  expect(stages.some(x=>x.stage==='hold'&&x.rook==='hidden')).toBe(true);
  expect((await app.state()).viewFen).toBe(before);
  await expect(page.locator('.move-sprite,.shatter-fragment,.analysis-arrow')).toHaveCount(0);
  await expect(page.locator('#solvedCount')).toHaveText('0 / 13');
});

test('reset cancels both a scheduled failure rewind and a fracture already in progress',async({page,app})=>{
  const initial=(await app.state()).viewFen;
  await key(page,app);await open(page,app,'d3d4');
  await app.tap(app.sq('b5'));await app.tap(app.sq('b6'));await app.phase('explain');
  expect((await app.state()).explanation.autoRewind).toBe(true);
  await app.tap(page.locator('#resetBtn'));await page.waitForTimeout(4100);await app.phase('key');
  expect((await app.state()).viewFen).toBe(initial);
  await wrongMate(page,app);await page.emulateMedia({reducedMotion:'no-preference'});
  await app.tap(page.locator('#retryBtn'));
  await expect(page.locator('.attempt-defeated .shatter-fragment')).toHaveCount(6);
  await app.tap(page.locator('#resetBtn'));await page.waitForTimeout(1700);await app.phase('key');
  expect((await app.state()).viewFen).toBe(initial);
  await expect(page.locator('.move-sprite,.shatter-fragment,.analysis-arrow')).toHaveCount(0);
  await expect(page.locator('#solvedCount')).toHaveText('0 / 13');
});

test('iPhone widths, landscape and enlarged text keep board square and controls reachable, including the visual lesson',async({page,app})=>{
  for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[1440,1000]]){
    await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const box=await page.locator('#board').boundingBox();expect(Math.abs(box.width-box.height)).toBeLessThan(1);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    for(const id of ['hintToggle','revealBtn','resetBtn','soundBtn','flipBtn']){const b=page.locator('#'+id);await b.scrollIntoViewIfNeeded();expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);}
  }
  await page.setViewportSize({width:390,height:664});await wrongMate(page,app);
  await app.tap(page.locator('#blackControlBtn'));const board=await page.locator('#board').boundingBox();expect(board.y).toBeGreaterThanOrEqual(0);expect(board.y+board.height).toBeLessThanOrEqual(664);
  await page.setViewportSize({width:320,height:568});await page.addStyleTag({content:'.feedback strong,.feedback span,#helpText,.lab-controls button,.phase-card h2,#explanationDetail,.explanation-tabs button {font-size:20px;}'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await app.tap(page.locator('#retryBtn'));await app.phase('mate');
});


test('White and Black kings are unmistakable throughout play; checkmate visibly explains every escape',async({page,app})=>{
  await expect(app.sq('g2')).toHaveClass(/king-white/);
  await expect(app.sq('g2').locator('.king-identity')).toHaveText('白王');
  await expect(app.sq('c4')).toHaveClass(/king-black/);
  await expect(app.sq('c4').locator('.king-identity')).toHaveText('黒王');
  await key(page,app);
  await expect(app.sq('h2').locator('.king-identity')).toHaveText('白王');
  await open(page,app,'d3d2');
  await app.tap(app.sq('f3'));await app.tap(app.sq('d2'));
  // Capture the short-lived real mate diagram atomically; the game
  // intentionally proceeds to the shatter animation after its reading beat.
  const proof=await page.waitForFunction(()=>{
    const s=window.__mateTwoDebug?.state();
    if(!s?.mateProof)return false;
    const legend=document.querySelector('#boardLegend')?.textContent||'';
    const checks=document.querySelectorAll('.showing-mate-proof .analysis-arrow.check').length;
    if(!checks || !legend.includes('黒の合法応手 0'))return false;
    return {legend,checks,escapes:document.querySelectorAll('.analysis-escape').length,
      king:document.querySelector('[data-square="c4"] .king-identity')?.textContent};
  },null,{timeout:8000});
  const diagram=await proof.jsonValue();
  expect(diagram.checks).toBeGreaterThan(0);
  expect(diagram.escapes).toBe(0);
  expect(diagram.king).toBe('黒王');
  await app.phase('explore',15000);
  await expect(page.locator('.analysis-arrow')).toHaveCount(0);
  await expect(page.locator('.king-identity')).toHaveCount(2);
});

test('suspended Safari-style move animation finishes under watchdog instead of freezing input',async({page,app})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{
    const original=Element.prototype.animate;
    let first=true;
    Element.prototype.animate=function(...args){
      const animation=original.apply(this,args);
      if(first&&this.classList?.contains('move-sprite')){
        first=false;animation.pause();
      }
      return animation;
    };
  });
  await app.tap(app.sq('g2'));await app.tap(app.sq('h2'));
  await app.phase('explore',10000);
  expect((await app.state()).busy).toBe(false);
  await expect(page.locator('.move-sprite')).toHaveCount(0);
  await expect(app.sq('h2').locator(':scope > .piece.white')).toBeVisible();
});


test('music and effects are independent, persistent and the score schedules seamlessly without file restarts',async({page,app})=>{
  const initial=await app.state();
  expect(initial.musicOn).toBe(false);
  expect(initial.audioOn).toBe(true);
  await expect(page.locator('#musicBtn')).toHaveAttribute('aria-pressed','false');
  await app.tap(page.locator('#musicBtn'));
  await expect(page.locator('#musicBtn')).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>(await app.state()).soundStatus.ready,{timeout:8000}).toBe(true);
  await expect.poll(async()=>(await app.state()).soundStatus.scheduler).toBe(true);
  await app.tap(page.locator('#soundBtn'));
  const after=await app.state();expect(after.audioOn).toBe(false);expect(after.musicOn).toBe(true);
  await app.tap(page.locator('#musicBtn'));
  await expect.poll(async()=>(await app.state()).soundStatus.scheduler).toBe(false);
  await app.tap(page.locator('#soundBtn'));
  await page.reload();
  await app.phase('key');
  const restored=await app.state();expect(restored.audioOn).toBe(true);expect(restored.musicOn).toBe(false);
});

test('return action and phase banner distinguish replay from a stuck board and restore correct checkpoint',async({page,app})=>{
  await expect(page.locator('#returnBtn')).toBeHidden();
  await key(page,app);
  await app.tap(app.sq('d3'));
  await expect(page.locator('#returnBtn')).toBeVisible();
  await expect(page.locator('#returnBtn')).toContainText('駒選択');
  await app.tap(page.locator('#returnBtn'));
  await expect(page.locator('.shadow-choice')).toHaveCount(0);
  await open(page,app,'d3d2');
  await expect(page.locator('#returnBtn')).toBeVisible();
  await expect(page.locator('#actionStatus')).toContainText('いつでも戻れます');
  await app.tap(page.locator('#returnBtn'));
  await app.phase('explore');
  await open(page,app,'d3d2');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await app.tap(app.sq('f3'));await app.tap(app.sq('d2'));
  await expect.poll(async()=>({state:await app.state(),status:await page.locator('#actionStatus').innerText()}),
    {timeout:10000}).toMatchObject({state:{phase:'victory',busy:true}});
  await expect(page.locator('#returnBtn')).toBeVisible();
  await app.tap(page.locator('#returnBtn'));
  await app.phase('explore');
  expect((await app.state()).busy).toBe(false);
  await expect(page.locator('.move-sprite,.shatter-fragment')).toHaveCount(0);
});


test('sound-check proves a real WebAudio waveform, and music can start after a single iPhone gesture',async({page,app})=>{
  await page.locator('#audioTestBtn').click();
  await expect(page.locator('#audioStatus')).toContainText('確認音を再生しました');
  await expect.poll(async()=>(await app.state()).soundStatus.ready,{timeout:8000}).toBe(true);
  // The analyser sees sound at the output bus, not just a changed ON button.
  await expect.poll(async()=>(await app.state()).soundStatus.signal,{timeout:3000,intervals:[30,60,100,150]}).toBeGreaterThan(.001);
  await app.tap(page.locator('#musicBtn'));
  await expect.poll(async()=>(await app.state()).soundStatus.scheduler,{timeout:6000}).toBe(true);
  await expect.poll(async()=>(await app.state()).soundStatus.scheduled,{timeout:6000}).toBeGreaterThan(3);
  await expect(page.locator('#audioStatus')).toContainText('BGM再生中');
});

test('move readability: a move traces its true source and destination and mate reveals checks then escapes',async({page,app})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await app.tap(app.sq('g2'));await app.tap(app.sq('h2'));
  await expect.poll(async()=>(await app.state()).motion?.from,{timeout:4000}).toBe('g2');
  await expect(page.locator('#motionLines .motion-arrow')).toHaveCount(1);
  await expect(page.locator('#motionMove')).toHaveText('g2 → h2');
  await app.phase('explore',11000);
  await open(page,app,'d3d2');
  await expect(page.locator('#motionLines')).toHaveCount(1);
  await app.tap(app.sq('f3'));await app.tap(app.sq('d2'));
  await expect.poll(async()=>(await app.state()).mateProofStep,{timeout:11000}).toBe('check');
  await expect(page.locator('#boardLegend')).toContainText('① 王手');
  await expect.poll(async()=>(await app.state()).mateProofStep,{timeout:11000}).toBe('coverage');
  await expect(page.locator('#boardLegend')).toContainText('② 逃げ道');
  await app.phase('explore',18000);
  await expect(page.locator('#motionLines .motion-arrow')).toHaveCount(0);
  await expect(page.locator('#motionCaption')).toBeHidden();
});
