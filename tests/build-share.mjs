import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {serve} from './server.mjs';
const site = await serve();
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.goto(site.url);
  const svg = await readFile('og-preview.svg','utf8');
  await page.setContent(`<html lang="zh-CN"><head><link rel="stylesheet" href="${site.url}/assets/fonts.css"><style>body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'og-preview.png'});
  console.log('Generated og-preview.png (1200 × 630)');
} finally {
  await browser.close();
  await site.close();
}
