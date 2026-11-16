'use strict';
// Static checks for gcbme-2026-smart-sleep.html (run: node tests/gcbme-2026-page.test.js from the repo root)
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'gcbme-2026-smart-sleep.html'), 'utf8');
var n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; }
ok(html.indexOf('<script src="tts-engine.js"></script>') !== -1, 'loads shared engine');
['voice-select', 'voice-rate', 'voice-preview', 'voice-rate-value', 'voice-note'].forEach(function (id) { ok(html.indexOf('id="' + id + '"') !== -1, id); });
ok(html.indexOf('TrainerTTS.createController') !== -1, 'uses controller');
ok(html.indexOf("const STORAGE_KEY = 'gcbme2026-speech-trainer-v1'") !== -1, 'progress key');
ok(html.indexOf('href="index.html"') !== -1 && html.indexOf('href="anxiety-insomnia.html"') !== -1, 'nav links');
ok(html.indexOf('u.rate = 0.9') === -1, 'no hard-coded rate');
var m = html.match(/const D = (\{[\s\S]*?\});\n/);
ok(m, 'data block');
var D = JSON.parse(m[1].replace(/<\\\//g, '</'));
ok(D.slides.length === 34, '34 spoken slides');
D.slides.forEach(function (s) {
  ok(fs.existsSync(path.join(root, s.image)), 'image ' + s.image);
  ok(s.detailed.length && s.concise.length && s.points.length, 'levels for slide ' + s.slide);
});
['index.html', 'anxiety-insomnia.html'].forEach(function (f) {
  var p = path.join(root, f);
  if (fs.existsSync(p)) ok(fs.readFileSync(p, 'utf8').indexOf('href="gcbme-2026-smart-sleep.html"') !== -1, f + ' links to new page');
});
// ---- natural voices (pre-generated Kokoro-82M clips) ----
['nv-voice', 'nv-rate', 'nv-note'].forEach(function (id) { ok(html.indexOf('id="' + id + '"') !== -1, id); });
ok(html.indexOf("const NV_KEY = 'gcbme2026-natural-voice-v1'") !== -1, 'natural voice settings key');
ok(/data-nv="heart">自然女聲/.test(html) && /data-nv="michael">自然男聲/.test(html) && /data-nv="browser">瀏覽器/.test(html), 'three voice choices');
['0.8', '0.9', '1', '1.15'].forEach(function (r) { ok(html.indexOf('data-rate="' + r + '"') !== -1, 'rate ' + r); });
ok(html.indexOf('preservesPitch = true') !== -1, 'preservesPitch');
var manPath = path.join(root, 'gcbme-2026', 'audio', 'manifest.json');
ok(fs.existsSync(manPath), 'manifest exists');
var M = JSON.parse(fs.readFileSync(manPath, 'utf8'));
var key = function (t) { return String(t).replace(/\s+/g, ' ').trim(); };
var files = {};
Object.keys(M.clips).forEach(function (k) {
  var c = M.clips[k];
  ['heart', 'michael'].forEach(function (v) {
    var f = path.join(root, 'gcbme-2026', 'audio', v, c.f + '.mp3');
    if (!fs.existsSync(f) || fs.statSync(f).size < 2000 || !(c.d[v] > 0.3)) throw new Error('bad clip ' + v + ' ' + c.f + ' for: ' + k);
  });
  if (files[c.f]) throw new Error('duplicate file id ' + c.f); files[c.f] = 1;
});
ok(true, 'all clip files exist for both voices');
var want = [];
D.slides.forEach(function (s) { want = want.concat(s.detailed, s.concise, s.points.map(function (p) { return p.en; })); });
D.keyMessages.forEach(function (k) { want.push(k[1]); }); D.caveats.forEach(function (k) { want.push(k[0]); });
D.vocab.forEach(function (v) { want.push(v.say || v.term.replace(/\(.*?\)/g, ''), v.example); });
D.numbers.forEach(function (x) { want.push(x[1].replace(/（.*?）/g, '').replace(/-/g, ' ')); });
D.frames.forEach(function (f) {
  if (f.kind === 'rows') { f.rows.forEach(function (r) { r.forms.forEach(function (x) { want.push(x[1]); }); }); return; }
  var combos = [{}];
  Object.keys(f.slots).forEach(function (k) { var nx = []; combos.forEach(function (c) { f.slots[k].forEach(function (v) { var o = Object.assign({}, c); o[k] = v; nx.push(o); }); }); combos = nx; });
  combos.forEach(function (c) { f.forms.forEach(function (x) { want.push(x[1].replace(/\{([^}]+)\}/g, function (m, k) { return c[k]; })); }); });
});
D.lines.forEach(function (l) { want.push(l.text); }); D.qa.forEach(function (q) { want.push(q.q, q.a); });
D.phrases.forEach(function (g) { want = want.concat(g[1]); }); want.push(D.retell.model, D.retell.short);
var miss = want.filter(function (t) { return !M.clips[key(t)]; });
ok(miss.length === 0, 'every fixed text has a clip; missing: ' + JSON.stringify(miss.slice(0, 5)));
console.log(n + ' checks passed');
