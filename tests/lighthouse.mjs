import lighthouse from 'lighthouse';
import {launch} from 'chrome-launcher';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {serve} from './server.mjs';

const site = await serve();
const chrome = await launch({chromeFlags: ['--headless=new', '--no-first-run']});
const requested = process.argv.slice(2);
const allPages = ['index.html', 'examples/qimu-coffee.html', 'examples/jian-studio.html', 'examples/echo-app.html'];
const pages = requested.length ? allPages.filter(file => requested.includes(file)) : allPages;
const previous = requested.length ? JSON.parse(await readFile('verification/lighthouse/summary.json','utf8').catch(()=>'[]')) : [];
const summary = previous.filter(r => !pages.includes(r.file));
await mkdir('verification/lighthouse', {recursive: true});
try {
  for (const file of pages) {
    const {lhr, report} = await lighthouse(`${site.url}/${file}`, {
      port: chrome.port,
      output: 'html',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    const scores = Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)]));
    const result = {file, scores, lighthouseVersion: lhr.lighthouseVersion, fetchTime: lhr.fetchTime,
      environment: lhr.environment, config: lhr.configSettings,
      metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time', 'speed-index'].map(key => [key, lhr.audits[key].numericValue])),
      findings: Object.values(lhr.audits).filter(a => a.score !== null && a.score < 1).map(a => ({id: a.id, score: a.score, title: a.title, displayValue: a.displayValue, details: a.details}))};
    summary.push(result);
    await writeFile(`verification/lighthouse/${file.split('/').at(-1)}`, report);
    await writeFile('verification/lighthouse/summary.json', JSON.stringify(summary, null, 2));
    console.log(file, JSON.stringify(scores), JSON.stringify(result.metrics));
  }
  if (summary.some(r => Object.values(r.scores).some(score => score < 95))) process.exitCode = 1;
} finally {
  await chrome.kill();
  await site.close();
}
