// Structural checks for the skill itself: the defects a diff does not show.
// A broken relative link, a script SKILL.md mentions that does not exist, or a
// plugin manifest pointing at the wrong folder all silently degrade the skill.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skill = join(root, 'skills/award-level-web-design');
const read = p => readFileSync(p, 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// 1. SKILL.md frontmatter: name matches the folder, description is present
const skillMd = read(join(skill, 'SKILL.md'));
const fm = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
ok(/^name:\s*award-level-web-design\s*$/m.test(fm), 'SKILL.md name must match its folder');
ok(/^description:\s*\S/m.test(fm), 'SKILL.md needs a description');

// 2. Every relative markdown link in the skill and README resolves to a file
const mdFiles = [join(skill, 'SKILL.md'), ...readdirSync(join(skill, 'references')).filter(f => f.endsWith('.md')).map(f => join(skill, 'references', f)), join(root, 'README.md')];
for (const file of mdFiles) {
  for (const [, target] of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = resolve(dirname(file), decodeURIComponent(target.split('#')[0]));
    ok(existsSync(path), `${file.slice(root.length + 1).replaceAll('\\', '/')} links to missing ${target}`);
  }
}

// 3. Every reference file is linked from somewhere in the skill, so none is orphaned
const allText = mdFiles.map(read).join('\n');
for (const f of readdirSync(join(skill, 'references'))) ok(allText.includes(f), `references/${f} is never linked`);

// 4. Every script SKILL.md tells the agent to run exists, and every shoot.mjs flag it documents is implemented
for (const [, s] of skillMd.matchAll(/scripts\/([\w.-]+\.(?:mjs|js))/g)) ok(existsSync(join(skill, 'scripts', s)), `SKILL.md mentions missing scripts/${s}`);
const shoot = read(join(skill, 'scripts/shoot.mjs'));
for (const [, flag] of skillMd.matchAll(/`--([a-z-]+)`/g)) ok(shoot.includes(`'${flag}'`), `SKILL.md documents --${flag} but shoot.mjs does not read it`);

// 5. The plugin manifest points at the skill folder
const market = JSON.parse(read(join(root, '.claude-plugin/marketplace.json')));
for (const p of market.plugins) for (const s of p.skills) ok(existsSync(join(root, s, 'SKILL.md')), `marketplace.json skill path ${s} has no SKILL.md`);

console.log(`PASS structure (${checks} checks)`);
