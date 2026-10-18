import { test as base, expect } from '@playwright/test';

const test = base.extend({
  app: async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // The app must work without any third-party request at runtime.
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const tap = locator => testInfo.project.use.hasTouch ? locator.tap() : locator.click();
    const sq = square => page.locator(`.square[data-square="${square}"]`);
    const phase = async (expected, timeout = 8_000) => {
      await expect.poll(() => page.evaluate(() => window.__mateTwoDebug?.state().phase), { timeout }).toBe(expected);
      await expect.poll(() => page.evaluate(() => window.__mateTwoDebug?.state().busy)).toBe(false);
    };
    await page.goto('/');
    await expect(page.locator('.square')).toHaveCount(64);
    await use({ tap, sq, phase });
    expect(errors).toEqual([]);
  },
});

async function key(page, app) {
  await app.tap(app.sq('g2'));
  await expect(app.sq('h2')).toHaveClass(/legal/);
  await app.tap(app.sq('h2'));
  await app.phase('explore');
}
async function solve(page, app, branch) {
  const focus = await page.evaluate(() => window.__mateTwoDebug.state().focusFrom);
  if (focus !== branch.id.slice(0, 2)) await app.tap(app.sq(branch.id.slice(0, 2)));
  await app.tap(page.locator(`.ghost-target[data-branch="${branch.id}"]`));
  await app.phase('mate');
  await app.tap(app.sq(branch.mateFrom));
  await expect(app.sq(branch.mateTo)).toHaveClass(/legal/);
  await app.tap(app.sq(branch.mateTo));
  await expect(page.locator('#resultOverlay')).toBeVisible();
  await expect(page.locator('#resultTitle')).toHaveText('CHECKMATE');
}

test('all 13 legal defences, capture restoration, proof skip and reload', async ({ page, app }) => {
  const boardBefore = await page.locator('#board').boundingBox();
  await key(page, app);
  await expect(page.locator('.ghost-target')).toHaveCount(0);
  const branches = await page.evaluate(() => window.__mateTwoDebug.branches());
  expect(branches).toHaveLength(13);
  for (let i = 0; i < branches.length; i++) {
    await solve(page, app, branches[i]);
    await expect(page.locator('#progressTrack')).toHaveAttribute('aria-valuenow', String(i + 1));
    await app.tap(page.locator('#resultOverlay'));
    if (i < branches.length - 1) await app.phase('explore');
  }
  await expect(page.locator('#skipProof')).toBeVisible();
  await app.tap(page.locator('#skipProof'));
  await app.phase('complete');
  await expect(page.locator('#resultTitle')).toHaveText('PROOF COMPLETE');
  await expect(page.locator('#boardCue')).not.toHaveClass(/visible/);
  await app.tap(page.locator('#resultOverlay'));
  await app.phase('explore');
  await expect(page.locator('.ghost-target')).toHaveCount(0);
  await expect(page.locator('.branch-origin-done')).toHaveCount(3);
  const boardAfter = await page.locator('#board').boundingBox();
  expect(boardAfter.width).toBeCloseTo(boardBefore.width, 0);
  expect(boardAfter.height).toBeCloseTo(boardBefore.height, 0);
  await page.reload();
  await app.phase('explore');
  await expect(page.locator('#solvedCount')).toHaveText('13 / 13');
  await expect(app.sq('f3').locator('.piece.white')).toHaveCount(1);
  await expect(app.sq('d3').locator('.piece.black')).toHaveCount(1);
  // Also let the full review finish naturally, exercising its final cleanup.
  await app.tap(page.locator('#revealBtn'));
  await app.phase('complete', 30_000);
  await expect(page.locator('#skipProof')).toBeHidden();
  await expect(page.locator('#boardCue')).not.toHaveClass(/visible/);
  await app.tap(page.locator('#resultOverlay'));
  await app.phase('explore');
  await expect(page.locator('.ghost-target')).toHaveCount(0);
});

test('incorrect key and incorrect mate restore the exact legal position', async ({ page, app }) => {
  const initial = await page.evaluate(() => window.__mateTwoDebug.state().viewFen);
  await app.tap(app.sq('g2'));
  await app.tap(app.sq('g3'));
  await expect(page.locator('#feedback')).toHaveClass(/bad/);
  await app.phase('key');
  expect(await page.evaluate(() => window.__mateTwoDebug.state().viewFen)).toBe(initial);
  await key(page, app);
  await app.tap(app.sq('d3'));
  await app.tap(page.locator('.ghost-target[data-branch="d3d2"]'));
  await app.phase('mate');
  const afterBlack = await page.evaluate(() => window.__mateTwoDebug.state().viewFen);
  // Kh1 is legal while in check, but does not mate.
  await app.tap(app.sq('h2'));
  await expect(app.sq('h1')).toHaveClass(/legal/);
  await app.tap(app.sq('h1'));
  await expect(page.locator('#feedback')).toHaveClass(/bad/);
  await app.phase('mate');
  expect(await page.evaluate(() => window.__mateTwoDebug.state().viewFen)).toBe(afterBlack);
  await expect(page.locator('#solvedCount')).toHaveText('0 / 13');
});

test('progress, active branch, orientation and mute preference survive reload', async ({ page, app }) => {
  await key(page, app);
  const branch = await page.evaluate(() => window.__mateTwoDebug.branches().find(b => b.id === 'd3f3'));
  await solve(page, app, branch);
  await app.tap(page.locator('#resultOverlay'));
  await app.phase('explore');
  await app.tap(page.locator('#revealBtn'));
  await app.phase('mate');
  const fen = await page.evaluate(() => window.__mateTwoDebug.state().viewFen);
  await app.tap(page.locator('#flipBtn'));
  await app.tap(page.locator('#soundBtn'));
  await page.reload();
  await app.phase('mate');
  expect(await page.evaluate(() => window.__mateTwoDebug.state().viewFen)).toBe(fen);
  await expect(page.locator('#solvedCount')).toHaveText('1 / 13');
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#saveStatus')).toHaveText('進み具合を自動保存');
});

test('reset cancels an in-flight move and its delayed feedback', async ({ page, app }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const initial = await page.evaluate(() => window.__mateTwoDebug.state().viewFen);
  await app.tap(app.sq('g2'));
  await app.tap(app.sq('g3'));
  await expect.poll(() => page.evaluate(() => window.__mateTwoDebug.state().busy)).toBe(true);
  await app.tap(page.locator('#resetBtn'));
  await app.phase('key');
  // Let the cancelled operation's original continuation pass its final await.
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => window.__mateTwoDebug.state().viewFen)).toBe(initial);
  await expect(page.locator('#feedback strong')).toHaveText('王手とは限らない、最初の一手');
  await expect(page.locator('.move-sprite')).toHaveCount(0);
  await expect(page.locator('#resultOverlay')).toBeHidden();
  await page.reload();
  await app.phase('key');
});

test('reset during black defence and subsequent rapid input leaves a usable board', async ({ page, app }) => {
  await key(page, app);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await app.tap(app.sq('d3'));
  await app.tap(page.locator('.ghost-target[data-branch="d3f3"]'));
  await expect.poll(() => page.evaluate(() => window.__mateTwoDebug.state().phase)).toBe('black');
  await expect(page.locator('#flipBtn')).toBeDisabled();
  await expect(page.locator('#hintToggle')).toBeDisabled();
  await app.tap(page.locator('#resetBtn'));
  await page.waitForTimeout(1600);
  await app.phase('key');
  await expect(app.sq('g2').locator('.piece.white')).toHaveCount(1);
  await expect(app.sq('f3').locator('.piece.white')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await key(page, app);
});

test('storage unavailable or malformed never prevents solving', async ({ page, app }) => {
  await page.evaluate(() => localStorage.setItem('mate-two:progress:cp-0001', '{invalid'));
  await page.reload();
  await app.phase('key');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage denied'); };
    Storage.prototype.setItem = () => { throw new Error('storage denied'); };
  });
  await page.reload();
  await app.phase('key');
  await expect(page.locator('#saveStatus')).toContainText('保存できません');
  await key(page, app);
});

test('reset during proof review prevents a late completion screen', async ({ page, app }) => {
  // Load a completed saved checkpoint, then exercise replay through the public UI.
  await page.evaluate(() => {
    const key='mate-two:progress:cp-0001';
    const saved=JSON.parse(localStorage.getItem(key));
    saved.phase='explore';saved.solved=window.__mateTwoDebug.branches().map(b=>b.id);
    localStorage.setItem(key,JSON.stringify(saved));
  });
  await page.reload();
  await app.phase('explore');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await app.tap(page.locator('#revealBtn'));
  await expect(page.locator('#skipProof')).toBeVisible();
  await app.tap(page.locator('#resetBtn'));
  await page.waitForTimeout(1400);
  await app.phase('key');
  await expect(page.locator('#resultOverlay')).toBeHidden();
  await expect(page.locator('#skipProof')).toBeHidden();
  await expect(page.locator('#solvedCount')).toHaveText('0 / 13');
});

test('failed startup gives a retry action that reloads the board', async ({ page, app }) => {
  await page.route('**/vendor/chess.js', route=>route.abort());
  await page.reload();
  await expect(page.locator('#startupError')).toBeVisible();
  await page.unroute('**/vendor/chess.js');
  await app.tap(page.locator('#startupError button'));
  await expect(page.locator('.square')).toHaveCount(64);
  await expect(page.locator('#startupError')).toBeHidden();
});

test('hints, pointer cancellation and keyboard selection do not create accidental moves', async ({ page, app }) => {
  await app.tap(page.locator('#hintToggle'));
  await expect(page.locator('#hintToggle')).toHaveAttribute('aria-pressed', 'true');
  await app.tap(page.locator('#hintToggle'));
  await expect(app.sq('g2')).toHaveClass(/hint-origin/);
  await app.tap(app.sq('g2'));
  await page.locator('#board').dispatchEvent('pointercancel', { pointerId: 1 });
  await expect(page.locator('.selected')).toHaveCount(0);
  await app.sq('g2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect(app.sq('h2')).toBeFocused();
  await page.keyboard.press('Enter');
  await app.phase('explore');
  await app.sq('d3').focus();
  await page.keyboard.press('Enter');
  const ghost = page.locator('.ghost-target[data-branch="d3d2"]');
  await ghost.focus();
  await page.keyboard.press('Enter');
  await app.phase('mate');
});

test('iPhone widths, landscape and text enlargement stay readable and reachable', async ({ page, app }) => {
  for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[1440,1000]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.locator('#board').boundingBox();
    expect(Math.abs(box.width-box.height)).toBeLessThan(1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    for (const id of ['hintToggle','revealBtn','resetBtn','soundBtn','flipBtn']) {
      const target = page.locator('#'+id);
      await target.scrollIntoViewIfNeeded();
      const rect = await target.boundingBox();
      expect(rect.height, id+' tap target').toBeGreaterThanOrEqual(44);
      await expect(target).toBeInViewport();
    }
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addStyleTag({ content: 'body { font-size: 150%; } .feedback strong,.feedback span,#helpText,.lab-controls button,.phase-card h2 { font-size: 150%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await app.tap(page.locator('#hintToggle'));
  await expect(page.locator('#feedback')).toBeInViewport();
});

test('controls bring the full board back into view on short iPhone screens', async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await app.tap(page.locator('#revealBtn'));
  await app.phase('explore');
  const box=await page.locator('#board').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(664);
  await app.tap(app.sq('d3'));
  await app.tap(page.locator('.ghost-target[data-branch="d3f3"]'));
  await app.phase('mate');
  const after=await page.locator('#board').boundingBox();
  expect(after.y).toBeGreaterThanOrEqual(0);
  expect(after.y+after.height).toBeLessThanOrEqual(664);
});
