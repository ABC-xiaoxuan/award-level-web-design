import {chromium} from 'playwright';
import {serve} from './server.mjs';
const site=await serve();
const browser=await chromium.launch({channel:'chrome',headless:true});
const examples=[
  {file:'qimu-coffee',hero:'01-qimu-desktop-hero',mobile:'04-qimu-mobile-hero',sections:[['#beans','02-qimu-desktop-beans'],['#process','03-qimu-desktop-process']]},
  {file:'jian-studio',hero:'05-jian-desktop-hero',mobile:'07-jian-mobile-hero',sections:[['#work','06-jian-desktop-work']]},
  {file:'echo-app',hero:'08-echo-desktop-hero',mobile:'10-echo-mobile-hero',sections:[['#how','09-echo-desktop-demo']]},
];
try{
  for(const example of examples){
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    await page.goto(`${site.url}/examples/${example.file}.html`);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(3500);
    await page.screenshot({path:`examples/screenshots/${example.hero}.png`});
    for(const [selector,name] of example.sections){
      await page.locator(selector).evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY-96));
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(1800);
      await page.screenshot({path:`examples/screenshots/${name}.png`});
    }
    await page.setViewportSize({width:375,height:844});
    await page.goto(`${site.url}/examples/${example.file}.html`);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(3500);
    await page.screenshot({path:`examples/screenshots/${example.mobile}.png`});
    await page.close();
    console.log('Updated previews:',example.file);
  }
}finally{await browser.close();await site.close()}
