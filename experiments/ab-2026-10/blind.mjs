// Shuffle finished pages into anonymous ids, then screenshot them all with identical settings.
// Usage: node experiments/ab-2026-10/blind.mjs jian forum
// Writes:  experiments/ab-2026-10/blind/<pid>/*.png   (what the judge sees)
//          experiments/ab-2026-10/mapping.json        (kept from the judge until scoring is done)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOOT = join(HERE, '../../skills/award-level-web-design/scripts/shoot.mjs');
const briefs = process.argv.slice(2);
if (!briefs.length) { console.error('Pass brief ids, e.g. jian forum'); process.exit(1); }

const pages = briefs.flatMap(b => ['A', 'B'].map(g => ({ brief: b, group: g, file: join(HERE, 'pages', `${g}-${b}.html`) })));
for (const p of pages) if (!existsSync(p.file)) { console.error('Missing ' + p.file); process.exit(1); }

// Fisher–Yates with crypto randomness so the order carries no hint of the group
for (let i = pages.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pages[i], pages[j]] = [pages[j], pages[i]]; }
const OUT = join(HERE, 'blind');
rmSync(OUT, { recursive: true, force: true });
const mapping = {};
pages.forEach((p, i) => {
  const pid = 'p' + String(i + 1).padStart(2, '0');
  mapping[pid] = { brief: p.brief, group: p.group };
  const dir = join(OUT, pid);
  mkdirSync(dir, { recursive: true });
  // screenshots only: the judge must not see audit results, which would leak which page was tuned against them
  const r = spawnSync(process.execPath, [SHOOT, p.file, '--review', '--widths', '375,1440', '--settle', '2000', '--out', dir], { encoding: 'utf8' });
  console.log(pid, r.status === 0 ? 'ok' : 'FAILED\n' + r.stderr);
});
writeFileSync(join(HERE, 'mapping.json'), JSON.stringify(mapping, null, 2));
console.log('mapping saved; do not show mapping.json to the judge');
