// Run with the bundled Node. --whale selects the installed versioned browser.
// Each run uses an isolated temporary profile and removes it after exit.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/shiny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), artifacts = path.join(root, 'artifacts');
const results = [], errors = [];
const useWhale = process.argv.includes('--whale');
const whaleApplication = 'C:/Program Files/Naver/Naver Whale/Application';
const whaleVersion = useWhale && fs.existsSync(whaleApplication) ? fs.readdirSync(whaleApplication).filter(name => /^\d+(?:\.\d+)+$/.test(name)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).find(name=>fs.existsSync(path.join(whaleApplication,name,'whale.exe'))) : null;
const browserOptions = useWhale ? { executablePath: process.env.WHALE_EXECUTABLE || path.join(whaleApplication,whaleVersion || '', 'whale.exe') } : { channel: 'msedge' };
let server, browser, context, profile;
const metrics = page => page.locator('video').first().evaluate(video => ({ width: video.getBoundingClientRect().width, scale: getComputedStyle(video).scale, translate: getComputedStyle(video).translate, paused: video.paused, time: video.currentTime }));
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...browserOptions, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  if (useWhale) {
    await page.goto('data:text/html,<html><body style="height:1600px">Whale raw wheel probe</body></html>');
    await page.evaluate(()=>{window.rawInputs=[];for(const type of ['keydown','keyup','wheel'])window.addEventListener(type,e=>rawInputs.push({type,code:e.code,alt:e.altKey,dy:e.deltaY}),{capture:true,passive:true})});
    await page.mouse.move(100,100);await page.keyboard.down('AltLeft');await page.mouse.wheel(0,-120);await page.waitForTimeout(80);await page.keyboard.up('AltLeft');
    const raw=await page.evaluate(()=>rawInputs);assert.ok(raw.some(e=>e.type==='keydown'&&e.alt));assert.ok(raw.some(e=>e.type==='wheel'));
    results.push({rawWhaleInputs:raw});
  }
  await page.goto(base + '/tests/media-zoom-harness.html');
  await page.waitForFunction(() => ['pass','fail'].includes(document.body.dataset.result));
  const harness = JSON.parse(await page.locator('#result').textContent());
  assert.equal(await page.locator('body').getAttribute('data-result'), 'pass', JSON.stringify(harness)); results.push({ harness });
  await page.screenshot({ path: path.join(artifacts, 'media-zoom-0.10.31.png') });
  for (const name of ['fs-player','fs-video']) {
    await page.locator('#' + name).click(); await page.waitForFunction(() => !!document.fullscreenElement);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => ({ fullscreen: document.fullscreenElement.tagName, scale: getComputedStyle(document.querySelector('video')).scale,
      width: document.querySelector('video').getBoundingClientRect().width, viewport: innerWidth, popover: document.querySelector('#media-zoom-controls').matches(':popover-open') }));
    assert.equal(info.scale, '2'); assert.ok(info.popover); assert.ok(Math.abs(info.width - info.viewport * 2) < 2, JSON.stringify(info));
    await page.screenshot({path:path.join(artifacts,`media-zoom-${name}-0.10.31.png`)});
    if (name === 'fs-video') {
      const button = await page.locator('#media-zoom-controls #right').boundingBox();
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    } else await page.locator('#media-zoom-controls #right').click();
    assert.ok((await metrics(page)).translate.startsWith('-')); results.push({ fullscreen: info });
    if (name === 'fs-video') {
      const drag = await page.locator('#media-zoom-controls #drag').boundingBox();
      await page.mouse.click(drag.x + drag.width / 2, drag.y + drag.height / 2);
      const prior = (await metrics(page)).translate;
      await page.mouse.move(400,400); await page.mouse.down(); await page.mouse.move(500,450,{steps:6}); await page.mouse.up();
      assert.notEqual((await metrics(page)).translate, prior);
      const slider = await page.locator('#media-zoom-controls #scale').boundingBox();
      await page.mouse.click(slider.x + slider.width * .5, slider.y + slider.height / 2);
      assert.equal((await metrics(page)).scale, '3');
      results.push({ nativeFullscreenDragAndSlider: true });
      await page.keyboard.press('Alt+0');
    }
    await page.evaluate(() => document.exitFullscreen());
  }
  console.log(harness.results.length + ' browser assertions and both fullscreen pointer paths passed (' + (useWhale ? 'Whale' : 'Edge') + ')');
  for (const fixture of ['player-view-controls-harness.html','player-view-controls-harness.html?soop','free-chat-harness.html','free-chat-harness.html?soop','free-chat-harness.html?legacy','free-chat-harness.html?soop&legacy','vod-chat-harness.html']) {
    await page.goto(base + '/tests/' + fixture);
    await page.waitForFunction(() => ['pass','fail'].includes(document.body.dataset.result));
    const text = await page.locator('#result').textContent();
    assert.equal(await page.locator('body').getAttribute('data-result'), 'pass', fixture + ': ' + text);
    const parsed = JSON.parse(text); results.push({ fixture, checks: (parsed.results || parsed).length });
  }
  await browser.close(); browser = null;
  profile = fs.mkdtempSync(path.join(artifacts, 'media-zoom-profile-'));
  context = await chromium.launchPersistentContext(profile, { ...browserOptions, headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), '0.10.31');
  const live = await context.newPage(); live.on('pageerror', error => errors.push(error.message));
  await live.goto(base + '/tests/media-zoom-fixture.html');
  await live.locator('#media-zoom-menu').waitFor();
  await live.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > 0);
  const before = await metrics(live), uiBefore = await live.locator('#native').boundingBox();
  await live.keyboard.press('Alt+Equal'); await live.waitForTimeout(60);
  assert.equal((await metrics(live)).scale, '1.25'); assert.equal((await live.locator('#native').boundingBox()).width, uiBefore.width);
  await live.keyboard.press('Alt+0'); await live.mouse.move(300,150); await live.keyboard.down('Alt');
  await live.mouse.wheel(0,-120); await live.waitForTimeout(100); assert.equal((await metrics(live)).scale,'1.1');
  await live.mouse.wheel(-120,0); await live.waitForTimeout(100); assert.equal((await metrics(live)).scale,'1.2');
  await live.mouse.move(1000,600); await live.mouse.wheel(0,-120); await live.waitForTimeout(100); assert.equal((await metrics(live)).scale,'1.3');
  await live.keyboard.up('Alt'); results.push({ trustedVerticalAndHorizontalWheel: true, wheelOutsideVideo:true });
  await live.keyboard.down('AltLeft');await live.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await live.mouse.move(300,150);await live.mouse.wheel(0,-120);await live.waitForTimeout(100);assert.equal((await metrics(live)).scale,'1.4');
  await live.keyboard.up('AltLeft');results.push({modifierRecoveryOnPointerReentry:true});
  await live.keyboard.press('Alt+0'); await live.keyboard.press('Alt+Equal');
  await live.keyboard.press('Alt+ArrowRight'); assert.ok((await metrics(live)).translate.startsWith('-'));
  const handle = live.locator('#media-zoom-controls');
  await live.locator('#media-zoom-menu').click();
  await handle.getByRole('button', { name: '화면 끌어서 이동' }).click();
  await live.mouse.move(300, 220); await live.mouse.down(); await live.mouse.move(400, 260, { steps: 8 }); await live.mouse.up();
  assert.notEqual((await metrics(live)).translate, '0px'); assert.equal((await metrics(live)).paused, false);
  await live.locator('#media-zoom-menu').click();
  await live.keyboard.press('Alt+0'); assert.equal((await metrics(live)).scale, 'none');
  await live.getByPlaceholder('입력 제외 확인').focus(); await live.keyboard.press('Alt+Equal'); assert.equal((await metrics(live)).scale, 'none');
  results.push({ unpacked: true, playbackUnaffected: (await metrics(live)).time > before.time });
  // Run the real extension popup page. An action popup's active tab is its
  // owning browser tab; a normal extension-page tab would select itself.
  // Bind that one API result to the fixture while keeping real IPC/routing.
  await live.goto(base + '/tests/media-zoom-fixture.html?iframe');
  await live.frameLocator('iframe').locator('#media-zoom-menu').waitFor();
  await live.bringToFront();
  const fixtureTab = await worker.evaluate(async () => (await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
  const popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  await popup.addInitScript(tabId => { chrome.tabs.query = async () => [{ id: tabId }]; }, fixtureTab);
  await popup.goto(`chrome-extension://${worker.url().split('/')[2]}/popup.html`);
  await popup.locator('#video-zoom [role=status]').filter({ hasText: '영상만 확대' }).waitFor();
  await popup.locator('#video-zoom').getByRole('button', { name: '영상 확대', exact: true }).click();
  await popup.locator('#video-zoom output').filter({ hasText: '125%' }).waitFor();
  await live.frameLocator('iframe').locator('video').evaluate(video => { if (getComputedStyle(video).scale !== '1.25') throw Error('iframe did not zoom'); });
  assert.equal((await metrics(live)).scale, 'none');
  await popup.locator('#video-zoom').getByRole('button', { name: '영상 오른쪽 보기' }).click();
  await popup.locator('#video-zoom output').filter({ hasText: '125%' }).waitFor();
  const translated = await live.frameLocator('iframe').locator('video').evaluate(video => getComputedStyle(video).translate);
  assert.ok(translated.startsWith('-'));
  await popup.locator('#video-zoom').getByRole('button', { name: '원래대로' }).click();
  await popup.locator('#video-zoom output').filter({ hasText: '100%' }).waitFor();
  results.push({ popupPage: true, owningTabBindingSimulated: true, crossOriginIframe: true });
  await popup.screenshot({ path: path.join(artifacts, 'media-zoom-popup-0.10.31.png') });
  await live.bringToFront();await live.locator('h1').click();
  const frameBox=await live.locator('iframe').boundingBox();
  await live.keyboard.down('AltLeft');await live.mouse.move(frameBox.x+100,frameBox.y+150);await live.mouse.wheel(0,-120);await live.waitForTimeout(100);
  assert.equal(await live.frameLocator('iframe').locator('video').evaluate(v=>getComputedStyle(v).scale),'1.1');
  await live.keyboard.up('AltLeft');await live.mouse.wheel(0,-120);await live.waitForTimeout(100);
  assert.equal(await live.frameLocator('iframe').locator('video').evaluate(v=>getComputedStyle(v).scale),'1.1');
  results.push({modifierStateAcrossFrames:true,releaseAcrossFrames:true});
  if (process.argv.includes('--public')) {
    const broadcast = await context.newPage(); broadcast.on('pageerror', error => errors.push(error.message));
    await broadcast.bringToFront();
    await broadcast.goto('https://chzzk.naver.com/video/15964028', { waitUntil: 'domcontentloaded' });
    await broadcast.locator('video.webplayer-internal-video').first().waitFor({state:'visible',timeout:45000});
    await broadcast.waitForFunction(() => { const video=document.querySelector('video.webplayer-internal-video'); return video?.readyState>=2&&!video.paused&&!document.querySelector('.pzp-pc--adbreak'); }, null, {timeout:45000});
    const videoBox = await broadcast.locator('video.webplayer-internal-video').first().boundingBox();
    await broadcast.locator('video.webplayer-internal-video').first().hover({position:{x:120,y:120}});
    await broadcast.locator('video.webplayer-internal-video').first().hover({position:{x:140,y:140}});
    await broadcast.locator('#media-zoom-menu').waitFor();
    const native = broadcast.locator('video.webplayer-internal-video').first();
    const before = await native.boundingBox();
    await broadcast.keyboard.press('Alt+Equal');
    await broadcast.waitForTimeout(120);
    const after = await native.boundingBox();
    assert.ok(Math.abs(after.width - before.width * 1.25) < 2, JSON.stringify({before,after}));
    await broadcast.keyboard.press('Alt+ArrowRight');
    const translation = await native.evaluate(video => getComputedStyle(video).translate); assert.ok(translation.startsWith('-'));
    await broadcast.screenshot({path:path.join(artifacts,'media-zoom-public-0.10.31.png')});
    await broadcast.keyboard.press('Alt+0');
    assert.ok(Math.abs((await native.boundingBox()).width - before.width) < 2);
    await broadcast.mouse.move(videoBox.x+100,videoBox.y+100); await broadcast.keyboard.down('Alt');
    await broadcast.mouse.wheel(0,-120); await broadcast.waitForTimeout(100); assert.equal(await native.evaluate(v=>getComputedStyle(v).scale),'1.1');
    await broadcast.mouse.move(1100,800); await broadcast.mouse.wheel(-120,0); await broadcast.waitForTimeout(100); assert.equal(await native.evaluate(v=>getComputedStyle(v).scale),'1.2');
    await broadcast.keyboard.up('Alt'); await broadcast.keyboard.press('Alt+0');
    await native.hover({position:{x:120,y:120}}); await native.hover({position:{x:140,y:140}});
    await broadcast.locator('#media-zoom-menu').click().catch(async error => {
      console.log('public menu diagnostic',JSON.stringify(await broadcast.locator('#media-zoom-menu').evaluate(button=>({focused:document.hasFocus(),root:button.closest('.pzp')?.className,ancestors:[button,...(()=>{const a=[];for(let n=button.parentElement;n;n=n.parentElement)a.push(n);return a})()].map(n=>({tag:n.tagName,class:n.className,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity}))}))));
      await broadcast.screenshot({path:path.join(artifacts,'media-zoom-public-menu-failure-0.10.31.png')}); throw error;
    });
    await broadcast.locator('#media-zoom-controls #panel').waitFor();
    await broadcast.screenshot({path:path.join(artifacts,'media-zoom-public-menu-0.10.31.png')});
    const panelBox=await broadcast.locator('#media-zoom-controls #panel').boundingBox();
    for(let i=0;i<6;i++){await broadcast.mouse.move(panelBox.x+30+i*3,panelBox.y+20);await broadcast.waitForTimeout(350)}
    assert.equal(await broadcast.locator('#media-zoom-controls #panel').isVisible(),true,'moving over the open panel must retain native controls');
    await broadcast.mouse.move(20,850);
    await broadcast.waitForFunction(()=>document.querySelector('#media-zoom-controls').shadowRoot.querySelector('#panel').hidden);
    results.push({ publicChzzkVod: true, actualMainPlaying:true, loggedIn: false, beforeWidth:before.width, zoomedWidth:after.width, translation, trustedWheelInsideAndOutside:true, nativeHideWithPointerOutside:true });
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(path.join(artifacts, 'media-zoom-0.10.31.json'), JSON.stringify({ engine: useWhale ? 'Whale' : 'Edge', results, errors }, null, 2));
  console.log(JSON.stringify({ checks: harness.results.length, results: results.filter(item => !item.harness), errors }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await context?.close(); server?.close();
  if (profile) {
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) !== artifacts || !path.basename(resolved).startsWith('media-zoom-profile-')) throw Error('Unsafe profile cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
