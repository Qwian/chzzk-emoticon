// Reload the actual unpacked extension, then change the emulated monitor.
// Only owned fixture pages are used; no live chat is typed or sent.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/shiny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), artifacts = path.join(root, 'artifacts');
const whaleRoot = 'C:/Program Files/Naver/Naver Whale/Application';
const whaleVersion = fs.readdirSync(whaleRoot).filter(name => /^\d+(?:\.\d+)+$/.test(name)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).find(name=>fs.existsSync(path.join(whaleRoot,name,'whale.exe')));
let context, profile;
const errors = [], results = [];
function cleanProfile() {
  if(!profile)return;
  const resolved=path.resolve(profile);
  if(path.dirname(resolved)!==artifacts||!path.basename(resolved).startsWith('free-chat-invalidation-profile-'))throw Error('Unsafe cleanup path');
  fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});profile=null;
}
(async () => {
  let version;
  for (const platform of ['chzzk','soop']) {
  profile = fs.mkdtempSync(path.join(artifacts, 'free-chat-invalidation-profile-'));
  context = await chromium.launchPersistentContext(profile, { executablePath:path.join(whaleRoot,whaleVersion,'whale.exe'),headless:true,
    viewport:{width:1280,height:900},args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`] });
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  version=await worker.evaluate(()=>chrome.runtime.getManifest().version);
  assert.equal(version,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version);
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const url=platform==='chzzk'?'https://chzzk.naver.com/live/00000000000000000000000000000000':'https://play.sooplive.com/freechat-fixture/1';
    const chat='<div contenteditable="true">작성 중 문장</div>';
    const markup=platform==='chzzk'?`<section><main class="_is_large_test"><div id="live_player_layout"><div class="pzp-pc__bottom"></div></div></main><aside id="aside-chatting">${chat}</aside></section>`:
      `<div id="webplayer" class="chat_open"><div id="webplayer_contents"><div id="player_area"><div id="player"><div class="player_ctrlBox"></div></div></div><aside class="wrapping side"><div id="chatting_area">${chat}</div></aside></div></div>`;
    await page.route(url,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><title>Free chat invalidation fixture</title><style>body{margin:0}section,#webplayer,#webplayer_contents{display:flex;width:100%;height:900px}main,#player_area{flex:1}aside{width:340px}#live_player_layout,#player{height:900px}</style><body class="screen_mode">${markup}`}));
    await page.goto(url);await page.locator('#ctfc-toggle').waitFor();
    await page.evaluate(()=>{window.fixtureEditor=document.querySelector('[contenteditable]')});
    const before=await page.evaluate(()=>screen.width);
    // runtime.reload invalidates the page's real chrome.storage API. Trigger
    // the monitor save only after the old service worker has closed.
    const closed=new Promise(resolve=>worker.once('close',resolve));
    await worker.evaluate(()=>chrome.runtime.reload()).catch(error=>{
      if(!/closed|destroyed/i.test(error.message))throw error;
    });
    await closed;
    const session=await context.newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false,screenWidth:before+640,screenHeight:1080});
    await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
    await page.waitForFunction(()=>!document.querySelector('#ctfc-style,#ctfc-toggle,.ctfc-toolbar'),null,{timeout:10000});
    assert.equal(await page.evaluate(()=>document.querySelector('[contenteditable]')===window.fixtureEditor),true);
    assert.equal(await page.locator('[contenteditable]').textContent(),'작성 중 문장');
    assert.deepEqual(errors,[]);
    results.push({platform,realExtensionReload:true,monitorChanged:true,controlsRemoved:true,editorPreserved:true});
    await page.close();
    // Some command-line unpacked installations are unloaded by runtime.reload;
    // each platform starts with its own fresh isolated installation.
    await context.close();context=null;cleanProfile();
  }
  fs.writeFileSync(path.join(artifacts,`free-chat-invalidation-${version}.json`),JSON.stringify({version,results,errors},null,2));
  console.log(JSON.stringify({version,results,errors}));
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
  await context?.close();
  cleanProfile();
});
