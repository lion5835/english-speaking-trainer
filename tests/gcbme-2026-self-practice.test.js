'use strict';
// Checks for gcbme-2026-self-practice/ (run from repo root: node tests/gcbme-2026-self-practice.test.js)
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dir = path.join(root, 'gcbme-2026-self-practice');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const A = require(path.join(dir, 'analyze.js'));
const D = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const M = JSON.parse(fs.readFileSync(path.join(dir, 'audio', 'manifest.json'), 'utf8'));
const key = t => String(t).replace(/\s+/g, ' ').trim();
ok(D.concepts.length >= 12 && D.concepts.length <= 16, 'concept count');
for (const c of D.concepts) {
  ok(c.ideas.some(i => i.must), c.id + ' has must ideas');
  ok(Object.keys(c.models).length >= 4, c.id + ' has 4+ model versions');
  ok(c.terms.length >= 3 && c.connectors.length >= 3 && c.mistakes.length >= 3, c.id + ' terms/connectors/mistakes');
  c.slides.forEach(s => ok(fs.existsSync(path.join(dir, 'slides', `s${String(s).padStart(2, '0')}.webp`)), `${c.id} slide ${s}`));
  const texts = [...Object.values(c.models), ...c.ideas.map(i => i.en), ...c.terms.map(t => t.say), ...c.connSay, c.challenge];
  texts.forEach(t => { const m = M[key(t)]; ok(m, 'audio for: ' + t.slice(0, 40)); ['heart', 'michael'].forEach(v => ok(fs.existsSync(path.join(dir, 'audio', v, m[0] + '.mp3')), v + ' file ' + m[0])); });
  for (const [ang, m] of Object.entries(c.models)) {
    ok(D.angles[ang], 'angle exists ' + ang);
    const r = A.analyze({ concept: c, angle: ang, angles: D.angles, text: m, seconds: 20, models: [], allowed: D.allowedNumbers });
    ok(r.facts.length === 0, `model ${c.id}/${ang} has no fact flags: ` + r.facts.map(f => f.rule));
    ok(r.errors.length === 0, `model ${c.id}/${ang} has no language errors: ` + r.errors.map(f => f.id));
    ok(r.cov.mustOk, `model ${c.id}/${ang} covers must ideas`);
  }
}
const c = D.concepts.find(x => x.id === 'tfda-screen');
const flags = t => A.factCheck(t, D.allowedNumbers).map(f => f.rule);
ok(flags('the radar diagnoses OSA').includes('diagnose'), 'flags diagnose');
ok(!flags("it doesn't diagnose OSA on its own").includes('diagnose'), 'negated diagnose ok');
ok(flags('it also measures oxygen at night').includes('oxygen'), 'flags oxygen');
ok(!flags('the radar does not measure oxygen or CO2').includes('oxygen'), 'negated oxygen ok');
ok(!flags('wearables track blood oxygen').includes('oxygen'), 'wearable oxygen ok');
ok(flags('in the hospital the correlation with PSG was point eight seven').includes('rho-hospital'), 'r/rho swap');
ok(flags('it can predict heart failure').includes('heart'), 'flags prediction');
ok(flags('the accuracy was 97 percent').some(r => r.startsWith('num-')), 'unknown number');
ok(flags('setup takes less than forty minutes').includes('setup40'), '40 minutes');
const L = t => A.langCheck(t).map(x => x.id);
ok(L('the radar detect the chest').includes('sv'), 'subject-verb');
ok(L('we tested many patient').includes('plural'), 'plural');
ok(L('because it is blocked so the chest moves').includes('because-so'), 'because-so');
ok(L('the radar watches the breath signal').includes('breath-signal'), 'breath signal');
ok(A.upgrade('um the radar detect the breath signal', A.langCheck('um the radar detect the breath signal')).startsWith('The radar detects the breathing signal'), 'upgrade');
const r1 = A.analyze({ concept: c, angle: 'plain', angles: D.angles, text: 'It is a screen for suspected severe OSA, not a diagnosis.', seconds: 6, prev: [], models: [], allowed: D.allowedNumbers });
ok(A.checkTargets([{ type: 'idea', key: 4 }], r1)[0].ok === true, 'target check');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok(html.includes('analyze.js') && html.includes('app.js'), 'scripts');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
ok(app.includes("'gcbme2026-self-practice-ai-v1'") && !/AIza[0-9A-Za-z_-]{20}|sk-[A-Za-z0-9]{20}/.test(app), 'no API keys committed');
['index.html', 'anxiety-insomnia.html', 'gcbme-2026-smart-sleep.html'].forEach(f => ok(fs.readFileSync(path.join(root, f), 'utf8').includes('href="gcbme-2026-self-practice/"'), f + ' links to self-practice'));
console.log(n + ' checks passed');
