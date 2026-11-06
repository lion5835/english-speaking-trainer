'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var TTS = require('../tts-engine.js');

var failed = 0;
var passed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(function () {
      passed += 1;
      console.log('ok  - ' + name);
    })
    .catch(function (err) {
      failed += 1;
      console.error('fail - ' + name);
      console.error('      ' + (err && err.stack ? err.stack : err));
    });
}

function voice(name, lang, extra) {
  extra = extra || {};
  return {
    name: name,
    lang: lang,
    voiceURI: extra.voiceURI || (name + '|' + lang),
    localService: extra.localService !== false,
    default: !!extra.default
  };
}

function mockStorage(seed) {
  var map = Object.assign({}, seed || {});
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null; },
    setItem: function (key, value) { map[key] = String(value); },
    removeItem: function (key) { delete map[key]; },
    _map: map
  };
}

function MockUtterance(text) {
  this.text = text;
  this.voice = null;
  this.lang = '';
  this.rate = 1;
  this.pitch = 1;
  this.volume = 1;
  this.onend = null;
  this.onerror = null;
}

function mockSynth(initialVoices) {
  var listeners = {};
  var synth = {
    voices: initialVoices ? initialVoices.slice() : [],
    speaking: false,
    paused: false,
    cancelled: 0,
    spoken: [],
    getVoices: function () { return this.voices.slice(); },
    addEventListener: function (type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    removeEventListener: function (type, fn) {
      listeners[type] = (listeners[type] || []).filter(function (item) { return item !== fn; });
    },
    onvoiceschanged: null,
    cancel: function () {
      this.cancelled += 1;
      this.speaking = false;
      this.spoken.forEach(function (u) {
        if (typeof u.onerror === 'function') u.onerror({ error: 'interrupted' });
      });
    },
    speak: function (utterance) {
      this.speaking = true;
      this.spoken.push(utterance);
      var self = this;
      setTimeout(function () {
        self.speaking = false;
        if (typeof utterance.onend === 'function') utterance.onend();
      }, 5);
    },
    fireVoices: function (next) {
      this.voices = next.slice();
      (listeners.voiceschanged || []).forEach(function (fn) { fn(); });
      if (typeof this.onvoiceschanged === 'function') this.onvoiceschanged();
    }
  };
  return synth;
}

function mockSelect() {
  var options = [];
  return {
    disabled: false,
    value: '',
    innerHTML: '',
    listeners: {},
    options: options,
    appendChild: function (opt) {
      options.push(opt);
      this.innerHTML += opt.textContent + ';';
    },
    addEventListener: function (type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    change: function (value) {
      this.value = value;
      (this.listeners.change || []).forEach(function (fn) { fn(); });
    }
  };
}

function mockInput(value) {
  return {
    disabled: false,
    value: value == null ? '' : String(value),
    listeners: {},
    addEventListener: function (type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    input: function (next) {
      this.value = String(next);
      (this.listeners.input || []).forEach(function (fn) { fn(); });
    }
  };
}

function mockBtn() {
  var classes = {};
  return {
    disabled: false,
    classList: {
      add: function (name) { classes[name] = true; },
      remove: function (name) { delete classes[name]; },
      contains: function (name) { return !!classes[name]; }
    },
    listeners: {},
    addEventListener: function (type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    click: function () {
      (this.listeners.click || []).forEach(function (fn) { fn(); });
    }
  };
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function makeController(overrides) {
  var select = overrides.selectEl || mockSelect();
  var defaults = {
    SpeechSynthesisUtterance: MockUtterance,
    localStorage: mockStorage(),
    selectEl: select,
    rateEl: mockInput('0.95'),
    rateValueEl: { textContent: '' },
    noteEl: { textContent: '' },
    previewBtn: mockBtn(),
    delay: function (fn) { return setTimeout(fn, 0); },
    pollMs: 0,
    createElement: function () { return { value: '', textContent: '' }; }
  };
  Object.keys(overrides).forEach(function (key) {
    defaults[key] = overrides[key];
  });
  return TTS.createController(defaults);
}

function run() {
  return Promise.resolve()
    .then(function () {
      return test('prefers quality English voices over compact or novelty ones', function () {
        var compact = voice('Microsoft David Desktop - English (United States)', 'en-US');
        var novelty = voice('Zarvox', 'en-US');
        var natural = voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US', { localService: false });
        var google = voice('Google US English', 'en-US', { localService: false });
        var samantha = voice('Samantha', 'en-US');
        assert.ok(TTS.scoreVoice(natural) > TTS.scoreVoice(compact));
        assert.ok(TTS.scoreVoice(google) > TTS.scoreVoice(compact));
        assert.ok(TTS.scoreVoice(samantha) > TTS.scoreVoice(novelty));
        assert.strictEqual(TTS.pickBestVoice([compact, novelty, natural, google]).name, natural.name);
      });
    })
    .then(function () {
      return test('falls back through en-US, other English, then null if none', function () {
        var zh = voice('Mei-Jia', 'zh-TW');
        var gb = voice('Daniel', 'en-GB');
        assert.strictEqual(TTS.pickBestVoice([zh, gb]).name, 'Daniel');
        assert.strictEqual(TTS.pickBestVoice([zh]), null);
        assert.strictEqual(TTS.pickBestVoice([]), null);
      });
    })
    .then(function () {
      return test('honors a saved voice URI when it is still available', function () {
        var google = voice('Google US English', 'en-US', { localService: false });
        var samantha = voice('Samantha', 'en-US');
        var picked = TTS.pickBestVoice([google, samantha], samantha.voiceURI);
        assert.strictEqual(picked.name, 'Samantha');
      });
    })
    .then(function () {
      return test('ignores a saved URI that is no longer installed', function () {
        var google = voice('Google US English', 'en-US', { localService: false });
        var picked = TTS.pickBestVoice([google], 'missing-voice');
        assert.strictEqual(picked.name, 'Google US English');
      });
    })
    .then(function () {
      return test('prepares spoken text without changing original teaching strings', function () {
        var original = 'Morning BP can peak after overnight HR/O₂ swings; ANP → diuretic-like nocturia (e.g. 1.5–2 kg).';
        var spoken = TTS.prepareSpokenText(original);
        assert.ok(spoken.indexOf('blood pressure') !== -1);
        assert.ok(spoken.indexOf('heart rate and oxygen') !== -1);
        assert.ok(spoken.indexOf('atrial natriuretic peptide') !== -1);
        assert.ok(spoken.indexOf('then') !== -1);
        assert.ok(spoken.indexOf('for example') !== -1);
        assert.ok(spoken.indexOf('1.5 to 2') !== -1);
        assert.ok(spoken.indexOf('kilograms') !== -1);
        assert.strictEqual(original.indexOf('blood pressure'), -1);
      });
    })
    .then(function () {
      return test('splits into sentence phrases, not word-by-word speech', function () {
        var phrases = TTS.splitPhrases('One sentence. Two sentence? Third sentence!');
        assert.deepStrictEqual(phrases, ['One sentence.', 'Two sentence?', 'Third sentence!']);
        assert.ok(phrases.every(function (p) { return p.split(/\s+/).length > 1; }));
      });
    })
    .then(function () {
      return test('settings persist separately from progress keys and recover from bad JSON', function () {
        var store = mockStorage();
        store.setItem('speech-trainer-sleep-apnea-v1', JSON.stringify({ studiedVocab: { 0: true } }));
        store.setItem('ep2-anxiety-speech-trainer-v1', JSON.stringify({ doneChunks: { 1: true } }));
        TTS.saveSettings({ voiceURI: 'Samantha|en-US', rate: 0.85, manual: true }, store);
        var loaded = TTS.loadSettings(store);
        assert.strictEqual(loaded.voiceURI, 'Samantha|en-US');
        assert.strictEqual(loaded.rate, 0.85);
        assert.strictEqual(loaded.manual, true);
        assert.deepStrictEqual(JSON.parse(store.getItem('speech-trainer-sleep-apnea-v1')), { studiedVocab: { 0: true } });
        assert.deepStrictEqual(JSON.parse(store.getItem('ep2-anxiety-speech-trainer-v1')), { doneChunks: { 1: true } });
        store.setItem(TTS.SETTINGS_KEY, '{not json');
        var recovered = TTS.loadSettings(store);
        assert.strictEqual(recovered.voiceURI, '');
        assert.strictEqual(recovered.rate, TTS.DEFAULT_RATE);
      });
    })
    .then(function () {
      return test('clamps rate and uses default when invalid', function () {
        assert.strictEqual(TTS.clampRate(0.2), 0.7);
        assert.strictEqual(TTS.clampRate(3), 1.15);
        assert.strictEqual(TTS.clampRate('nope'), TTS.DEFAULT_RATE);
      });
    })
    .then(function () {
      return test('async voiceschanged updates selection when the list arrives late', function () {
        var synth = mockSynth([]);
        var select = mockSelect();
        var controller = makeController({
          speechSynthesis: synth,
          selectEl: select
        });
        assert.strictEqual(controller.getVoices().length, 0);
        synth.fireVoices([
          voice('Zarvox', 'en-US'),
          voice('Google US English', 'en-US', { localService: false })
        ]);
        var names = controller.getVoices().map(function (v) { return v.name; });
        assert.ok(names.indexOf('Google US English') !== -1);
        assert.ok(select.innerHTML.indexOf('Google US English') !== -1);
        assert.ok(select.innerHTML.indexOf('建議') !== -1);
      });
    })
    .then(function () {
      return test('empty English voice list still allows speak() with en-US fallback', function () {
        var synth = mockSynth([voice('Mei-Jia', 'zh-TW')]);
        var note = { textContent: '' };
        var controller = makeController({
          speechSynthesis: synth,
          noteEl: note
        });
        assert.ok(note.textContent.indexOf('找不到已安裝的英文語音') !== -1);
        var btn = mockBtn();
        return controller.speak('High morning blood pressure is a red flag.', btn).then(function (ok) {
          assert.strictEqual(ok, true);
          return wait(20);
        }).then(function () {
          assert.strictEqual(synth.spoken.length, 1);
          assert.strictEqual(synth.spoken[0].lang, 'en-US');
          assert.strictEqual(synth.spoken[0].voice, null);
          assert.strictEqual(synth.spoken[0].pitch, 1);
        });
      });
    })
    .then(function () {
      return test('speech unavailable disables controls and does not speak', function () {
        var alerts = [];
        var select = mockSelect();
        var rate = mockInput('0.95');
        var preview = mockBtn();
        var note = { textContent: '' };
        var controller = makeController({
          speechSynthesis: null,
          SpeechSynthesisUtterance: null,
          selectEl: select,
          rateEl: rate,
          noteEl: note,
          previewBtn: preview,
          onUnsupported: function (msg) { alerts.push(msg); }
        });
        assert.strictEqual(controller.supported, false);
        assert.strictEqual(select.disabled, true);
        assert.strictEqual(rate.disabled, true);
        assert.strictEqual(preview.disabled, true);
        assert.ok(note.textContent.indexOf('沒有語音合成功能') !== -1);
        return controller.speak('hello').then(function (ok) {
          assert.strictEqual(ok, false);
          assert.strictEqual(alerts.length, 1);
        });
      });
    })
    .then(function () {
      return test('cancel/restart drops the previous queue and starts the new text', function () {
        var synth = mockSynth([voice('Samantha', 'en-US')]);
        var controller = makeController({ speechSynthesis: synth });
        var first = mockBtn();
        var second = mockBtn();
        controller.speak('First sentence. Second sentence.', first);
        return wait(10).then(function () {
          return controller.speak('Replacement phrase.', second);
        }).then(function () {
          return wait(40);
        }).then(function () {
          assert.ok(synth.cancelled >= 1);
          var texts = synth.spoken.map(function (u) { return u.text; });
          assert.ok(texts.indexOf('Replacement phrase.') !== -1);
          assert.strictEqual(second.classList.contains('speak-active') || !first.classList.contains('speak-active'), true);
        });
      });
    })
    .then(function () {
      return test('manual voice and speed are saved locally and reused', function () {
        var store = mockStorage();
        var samantha = voice('Samantha', 'en-US');
        var google = voice('Google US English', 'en-US', { localService: false });
        var select = mockSelect();
        var rate = mockInput('0.95');
        makeController({
          speechSynthesis: mockSynth([google, samantha]),
          localStorage: store,
          selectEl: select,
          rateEl: rate
        });
        select.change(samantha.voiceURI);
        rate.input(0.8);
        var saved = TTS.loadSettings(store);
        assert.strictEqual(saved.voiceURI, samantha.voiceURI);
        assert.strictEqual(saved.manual, true);
        assert.strictEqual(saved.rate, 0.8);

        var select2 = mockSelect();
        var controller2 = makeController({
          speechSynthesis: mockSynth([google, samantha]),
          localStorage: store,
          selectEl: select2
        });
        assert.strictEqual(controller2.getSettings().voiceURI, samantha.voiceURI);
        assert.strictEqual(controller2.getSettings().rate, 0.8);
      });
    })
    .then(function () {
      return test('does not randomize pitch or split words for intonation tricks', function () {
        var src = fs.readFileSync(path.join(__dirname, '..', 'tts-engine.js'), 'utf8');
        assert.ok(!/Math\.random/.test(src));
        assert.ok(!/split\(\s*['"]\\s\+['"]\s*\)/.test(src));
        assert.ok(/pitch = 1/.test(src));
      });
    })
    .then(function () {
      return test('both pages keep progress keys, cross-links, and load the shared engine', function () {
        var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        var anxietyHtml = fs.readFileSync(path.join(__dirname, '..', 'anxiety-insomnia.html'), 'utf8');
        [indexHtml, anxietyHtml].forEach(function (html) {
          assert.ok(html.indexOf('src="tts-engine.js"') !== -1);
          assert.ok(html.indexOf('id="voice-select"') !== -1);
          assert.ok(html.indexOf('id="voice-rate"') !== -1);
          assert.ok(html.indexOf('id="voice-preview"') !== -1);
          assert.ok(html.indexOf('TrainerTTS.createController') !== -1);
        });
        assert.ok(indexHtml.indexOf("const STORAGE_KEY = 'speech-trainer-sleep-apnea-v1'") !== -1);
        assert.ok(anxietyHtml.indexOf("const STORAGE_KEY = 'ep2-anxiety-speech-trainer-v1'") !== -1);
        assert.ok(indexHtml.indexOf('href="anxiety-insomnia.html"') !== -1);
        assert.ok(anxietyHtml.indexOf('href="index.html"') !== -1);
        assert.ok(indexHtml.indexOf('High morning blood pressure is a red flag') !== -1);
        assert.ok(anxietyHtml.indexOf('default mode network') !== -1);
        assert.ok(indexHtml.indexOf('u.rate = 0.9') === -1);
        assert.ok(anxietyHtml.indexOf('u.rate = 0.9') === -1);
      });
    });
}

run().then(function () {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
});
