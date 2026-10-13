import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {serve} from './server.mjs';

const require = createRequire(import.meta.url);
const site = await serve();
const browser = await chromium.launch({channel:'chrome', headless:true});
const interactionsOnly = process.argv.includes('--interactions-only');
const pages = interactionsOnly ? [] : ['index.html','examples/qimu-coffee.html','examples/jian-studio.html','examples/echo-app.html'];
const report = interactionsOnly
  ? JSON.parse(await readFile('verification/browser.json','utf8'))
  : {pages:[], motion:[], images:[], metadata:[]};
report.motion=[];report.images=[];
report.pages=report.pages.filter(r=>!r.state);
const auditSource = await readFile('skills/award-level-web-design/scripts/audit.js','utf8');
await mkdir('verification', {recursive:true});

async function scan(page) {
  const audit = await page.evaluate(auditSource);
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const axe = await page.evaluate(async () => (await axe.run()).violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.map(n => ({target:n.target, summary:n.failureSummary}))})));
  return {audit, axe};
}
async function leaveControls(page) {
  await page.mouse.move(0,0);
  await page.evaluate(() => document.activeElement?.blur());
}

try {
  for (const file of pages) {
    const page = await browser.newPage();
    const errors = [], failed = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {if(r.status() >= 400) failed.push({url:r.url(),status:r.status()})});
    page.on('requestfailed', r => failed.push({url:r.url(),error:r.failure()?.errorText}));
    await page.route('**/*', route => {
      if(new URL(route.request().url()).origin !== site.url) {external.push(route.request().url());return route.abort()}
      return route.continue();
    });
    for (const width of [375,768,1280,1920]) {
      await page.setViewportSize({width,height:900});
      await page.goto(`${site.url}/${file}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1700);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1), false, file+' overflow');
      if (width <= 1024) {
        await page.locator('.menu-toggle').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('dialog').evaluate(el => el.open), true);
        assert.equal(await page.locator('dialog').evaluate(el => Math.round(el.getBoundingClientRect().height)), 900);
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.tagName), 'A');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.className), 'menu-close');
        const menuAxe = (await scan(page)).axe;
        assert.deepEqual(menuAxe, [], `${file} ${width} menu accessibility`);
        await page.screenshot({path:`verification/${file.split('/').at(-1)}-${width}-menu.png`});
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.className), 'menu-toggle');
        const links = await page.locator('dialog a[href^="#"]').evaluateAll(els => els.map(e => e.getAttribute('href')));
        const sections = await page.locator('main section[id]').evaluateAll(els => els.map(e => '#'+e.id));
        for (const section of sections) assert(links.includes(section), `${file}: menu must reach ${section}`);
        for (const hash of links) {
          await page.locator('.menu-toggle').click();
          await page.locator(`dialog a[href="${hash}"]`).click();
          await page.waitForTimeout(80);
          assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
          assert.equal(await page.evaluate(() => location.hash), hash);
          assert.equal(await page.evaluate(() => '#'+document.activeElement.id), hash, 'Focus follows the selected section');
        }
        await page.locator('.menu-toggle').click();
        await page.setViewportSize({width:1280,height:900});
        await page.waitForTimeout(80);
        assert.equal(await page.locator('dialog').evaluate(el => el.open), false, 'Menu closes at desktop breakpoint');
        assert.notEqual(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
        await page.setViewportSize({width,height:900});
      }
      await page.evaluate(async () => {
        for(let y=0;y<document.documentElement.scrollHeight;y+=700){scrollTo(0,y);await new Promise(r=>setTimeout(r,40))}
        scrollTo(0,0);
      });
      await page.waitForTimeout(1500);
      if(file==='examples/jian-studio.html') {
        await page.mouse.move(width-2,898);
        await page.waitForTimeout(400);
        const label=await page.locator('#ct').boundingBox();
        assert(label.x>=0 && label.x+label.width<=width && label.y+label.height<=900,'Coordinate label stays inside the viewport');
      }
      const result = await scan(page);
      report.pages.push({file,width,...result});
      await page.screenshot({path:`verification/${file.split('/').at(-1)}-${width}.png`});
      console.log(file,width,'audit',result.audit.errors,'axe',result.axe.length);
      assert.equal(result.audit.errors, 0, `${file} ${width} visual audit`);
      assert.deepEqual(result.axe, [], `${file} ${width} accessibility`);
    }
    const metadata = await page.evaluate(() => {
      const meta = key => document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content;
      return {title:meta('og:title'),url:meta('og:url'),image:meta('og:image'),width:meta('og:image:width'),height:meta('og:image:height'),alt:meta('og:image:alt'),twitter:meta('twitter:card'),twitterImage:meta('twitter:image'),icon:document.querySelector('link[rel="icon"]')?.href,canonical:document.querySelector('link[rel="canonical"]')?.href};
    });
    assert(metadata.title && metadata.alt && metadata.icon);
    assert.equal(metadata.url,metadata.canonical);
    assert.equal(metadata.twitter,'summary_large_image');
    assert.equal(metadata.image,metadata.twitterImage);
    assert.equal(metadata.width,'1200');assert.equal(metadata.height,'630');
    assert.equal((await page.request.get(metadata.icon)).status(),200);
    report.metadata.push({file,...metadata});
    assert.deepEqual(errors, [], file+' JavaScript errors');
    assert.deepEqual(failed, [], file+' failed resources');
    assert.deepEqual(external, [], file+' must work without third-party resources');
    await page.close();
  }

  // Test clocks while their content remains on screen; blurring must not scroll to the header.
  for (const setup of [
    {file:'index.html',root:'.card',interaction:'.card',button:'#score-toggle',delay:4000,snapshot:()=>document.querySelector('.rounds [aria-pressed=true]').dataset.r},
    {file:'examples/echo-app.html',root:'.rec',interaction:'.rec',button:'#rec-toggle',delay:1400,snapshot:()=>[document.querySelector('#typed').textContent,document.querySelector('#timer').textContent]},
    {file:'examples/echo-app.html',root:'.demo',interaction:'.demo',button:'#tabs-toggle',delay:5400,snapshot:()=>document.querySelector('.tab[aria-selected=true]').id},
    {file:'examples/echo-app.html',root:'#topo',interaction:'.topo-controls',button:'#topo-toggle',delay:1000,snapshot:()=>document.querySelector('#topo').toDataURL()},
  ]) {
    const page = await browser.newPage({viewport:{width:1280,height:1000}});
    await page.goto(`${site.url}/${setup.file}`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator(setup.interaction).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800);
    await page.clock.install();
    const snapshot = () => page.evaluate(setup.snapshot);
    const frozen = async reason => {const before=await snapshot();await page.clock.runFor(6500);assert.deepEqual(await snapshot(),before,reason)};
    await page.locator(setup.button).focus();
    await page.keyboard.press('Enter');
    await leaveControls(page);
    await frozen(setup.button+' explicit keyboard pause');
    await page.locator(setup.button).click();
    await leaveControls(page);
    const before = await snapshot();await page.clock.runFor(setup.delay);
    assert.notDeepEqual(await snapshot(),before,setup.button+' resume must advance');
    await page.locator(setup.interaction).hover();await frozen('Hover pauses '+setup.button);
    await leaveControls(page);
    await page.locator(setup.button).focus();await frozen('Focus pauses '+setup.button);
    await leaveControls(page);
    // A synthetic visibility event tests cancellation/resumption independently of headless tab policy.
    await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
    assert.equal(await page.locator(setup.root).getAttribute('data-motion-paused'),'true');
    await frozen('Hidden page pauses '+setup.button);
    await page.evaluate(() => {delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
    const resumed = await snapshot();await page.clock.runFor(setup.delay);
    assert.notDeepEqual(await snapshot(),resumed,'Visibility restoration resumes '+setup.button);
    await page.clock.resume();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(selector=>document.querySelector(selector).getAttribute('aria-pressed')==='true',setup.button,{timeout:3000});
    await frozen('Reduced motion pauses '+setup.button);
    report.motion.push({button:setup.button,keyboardPause:true,resume:true,hover:true,focus:true,visibility:'synthetic visibilitychange',reducedMotion:true});
    console.log('PASS motion',setup.button);
    await page.close();
  }
  const tabsPage = await browser.newPage({reducedMotion:'reduce'});
  await tabsPage.goto(site.url+'/examples/echo-app.html');
  await tabsPage.locator('#t0').focus();await tabsPage.keyboard.press('End');
  assert.equal(await tabsPage.locator('#t2').getAttribute('aria-selected'),'true');
  await tabsPage.keyboard.press('ArrowRight');assert.equal(await tabsPage.locator('#t0').getAttribute('aria-selected'),'true');
  assert.equal(await tabsPage.locator('#rec-toggle').getAttribute('aria-pressed'),'true');
  for(const id of ['t0','t1','t2']) {
    await tabsPage.locator('#'+id).click();
    const result=await scan(tabsPage);
    assert.deepEqual(result.axe,[],id+' panel accessibility');
    report.pages.push({file:'examples/echo-app.html',state:id,width:1280,...result});
  }
  await tabsPage.close();

  for(const [width,dpr] of [[375,2],[768,2],[1280,1],[1920,1],[1920,2]]) {
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:dpr});
    await page.goto(site.url+'/index.html');
    await page.locator('#work').scrollIntoViewIfNeeded();
    await page.locator('.works img').evaluateAll(async images=>{for(const img of images){img.scrollIntoView();await img.decode()}});
    const images=await page.locator('.works img').evaluateAll(imgs=>imgs.map(i=>({url:i.currentSrc,width:i.naturalWidth,loading:i.loading})));
    let bytes=0;
    for(const image of images){assert(image.width>0);assert.equal(image.loading,'lazy');assert(image.url.endsWith('.webp'));image.bytes=(await stat('.'+new URL(image.url).pathname)).size;bytes+=image.bytes}
    assert(bytes<300000,'Gallery image budget');
    report.images.push({width,dpr,bytes,images});
    await page.close();
  }
  const png=await readFile('og-preview.png');
  assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  console.log('PASS responsive images, share metadata, no external resources');
} finally {
  await writeFile('verification/browser.json',JSON.stringify(report,null,2));
  await browser.close();await site.close();
}
