import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:160,height:160},deviceScaleFactor:1});
  await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45 0 0 0 0 .38 0 0 0 0 .3 0 0 0 .22 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`);
  await page.screenshot({path:'assets/paper-grain.png',omitBackground:true});
  console.log('Baked the existing SVG paper texture to a 160px tile');
} finally {await browser.close()}
