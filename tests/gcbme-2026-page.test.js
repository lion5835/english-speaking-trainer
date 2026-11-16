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
console.log(n + ' checks passed');
