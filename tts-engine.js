(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.TrainerTTS = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SETTINGS_KEY = 'english-speaking-trainer-voice-v1';
  var DEFAULT_RATE = 0.95;
  var MIN_RATE = 0.7;
  var MAX_RATE = 1.15;
  var PREVIEW_TEXT = 'This is a preview of the selected English voice. Listen to the rhythm, stress, and clarity.';
  var LIMITATION_NOTE = '朗讀使用你裝置上瀏覽器／作業系統已安裝的英文語音。語調能自然到什麼程度，取決於那些語音本身的品質；這不是另外錄製的真人聲音，也沒有接雲端或付費語音服務。';
  var UNSUPPORTED_NOTE = '這個瀏覽器沒有語音合成功能，因此無法朗讀。請改用 Chrome 或 Safari，並確認系統已安裝英文語音。';
  var EMPTY_VOICE_NOTE = '目前找不到已安裝的英文語音，將改用瀏覽器預設語音朗讀英文。語調品質仍取決於裝置，不是額外的神經網路或真人音訊。';
  var FALLBACK_VOICE_NOTE = '先前選擇的語音在此裝置上找不到，已改用目前較自然的可用英文語音。';

  var NOVELTY_RE = /compact|dummy|espeak|whisper|zarvox|trinoids|boing|bells|bubbles|cellos|bad news|good news|jester|organ|albert|bahh|wobble|princess|kathy|junior|deranged|hysterical|pipe organ|fred\b|novelty/i;
  var QUALITY_NAME_RE = /\b(natural|neural|premium|enhanced|online|studio|wavenet|neural2|multilingual)\b/i;
  var KNOWN_GOOD_RE = /samantha|karen|daniel|moira|serena|martha|tessa|fiona|veena|rishi|aria|jenny|guy|sara|davis|tony|nancy|jason|sonia|ryan|clara|nicky|aaron|evan|nathan|stephanie|google|siri|\balex\b/i;
  var DESKTOP_COMPACT_RE = /desktop|compact|mobile compact/i;

  function clampRate(value) {
    var n = Number(value);
    if (!isFinite(n)) return DEFAULT_RATE;
    if (n < MIN_RATE) return MIN_RATE;
    if (n > MAX_RATE) return MAX_RATE;
    return Math.round(n * 100) / 100;
  }

  function isEnglishVoice(voice) {
    if (!voice) return false;
    var lang = String(voice.lang || '');
    var name = String(voice.name || '');
    return /^(en)([-_]|$)/i.test(lang) || /english/i.test(name);
  }

  function scoreVoice(voice) {
    if (!voice) return -10000;
    var name = String(voice.name || '');
    var lang = String(voice.lang || '');
    var score = 0;

    if (!isEnglishVoice(voice)) return -10000;
    if (NOVELTY_RE.test(name)) score -= 90;
    if (QUALITY_NAME_RE.test(name)) score += 55;
    if (/google/i.test(name)) score += 34;
    if (KNOWN_GOOD_RE.test(name)) score += 26;
    if (/microsoft/i.test(name) && QUALITY_NAME_RE.test(name)) score += 18;
    if (/microsoft/i.test(name) && DESKTOP_COMPACT_RE.test(name)) score -= 28;
    if (voice.localService === false) score += 12;
    if (/en-US/i.test(lang)) score += 10;
    else if (/en-GB/i.test(lang)) score += 8;
    else if (/en-(AU|IN|IE|ZA|NG|CA|NZ)/i.test(lang)) score += 6;
    else score += 4;
    if (voice.default) score += 3;
    return score;
  }

  function pickBestVoice(voices, savedVoiceURI) {
    var list = Array.prototype.slice.call(voices || []);
    if (!list.length) return null;
    if (savedVoiceURI) {
      var saved = list.filter(function (voice) {
        return voice.voiceURI === savedVoiceURI || voice.name === savedVoiceURI;
      })[0];
      if (saved) return saved;
    }
    var english = list.filter(isEnglishVoice).sort(function (a, b) {
      return scoreVoice(b) - scoreVoice(a);
    });
    return english[0] || null;
  }

  function prepareSpokenText(text) {
    var spoken = String(text == null ? '' : text);
    spoken = spoken.replace(/(\d)\s*[–—−-]\s*(\d)/g, '$1 to $2');
    spoken = spoken.replace(/[–—]/g, ', ');
    spoken = spoken.replace(/→/g, ', then ');
    spoken = spoken.replace(/\bHR\/O₂\b/g, 'heart rate and oxygen');
    spoken = spoken.replace(/\bHR\/O2\b/gi, 'heart rate and oxygen');
    spoken = spoken.replace(/O₂/g, 'oxygen');
    spoken = spoken.replace(/\bO2\b/g, 'oxygen');
    spoken = spoken.replace(/\bHR\b/g, 'heart rate');
    spoken = spoken.replace(/\bBP\b/g, 'blood pressure');
    spoken = spoken.replace(/\bANP\b/g, 'atrial natriuretic peptide');
    spoken = spoken.replace(/\bDMN\b/g, 'default mode network');
    spoken = spoken.replace(/\bkg\b/gi, ' kilograms');
    spoken = spoken.replace(/\be\.g\./gi, 'for example');
    spoken = spoken.replace(/\bvs\.?\b/gi, 'versus');
    spoken = spoken.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    spoken = spoken.replace(/\s+/g, ' ').trim();
    return spoken;
  }

  function splitPhrases(text) {
    var spoken = prepareSpokenText(text);
    if (!spoken) return [];
    var parts = spoken.replace(/([.!?;])\s+/g, '$1\n').split('\n').map(function (part) {
      return part.trim();
    }).filter(Boolean);
    return parts.length ? parts : [spoken];
  }

  function getStorage(storage) {
    return storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  function defaultSettings() {
    return { voiceURI: '', rate: DEFAULT_RATE, manual: false };
  }

  function loadSettings(storage) {
    var store = getStorage(storage);
    var fallback = defaultSettings();
    if (!store) return fallback;
    try {
      var raw = store.getItem(SETTINGS_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return {
        voiceURI: parsed && parsed.voiceURI ? String(parsed.voiceURI) : '',
        rate: clampRate(parsed && parsed.rate),
        manual: !!(parsed && parsed.manual)
      };
    } catch (err) {
      return fallback;
    }
  }

  function saveSettings(settings, storage) {
    var store = getStorage(storage);
    if (!store) return loadSettings(storage);
    var next = {
      voiceURI: settings && settings.voiceURI ? String(settings.voiceURI) : '',
      rate: clampRate(settings && settings.rate),
      manual: !!(settings && settings.manual)
    };
    store.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function createController(options) {
    options = options || {};
    var synth = options.speechSynthesis;
    if (synth === undefined && typeof window !== 'undefined') synth = window.speechSynthesis;
    var Utterance = options.SpeechSynthesisUtterance;
    if (Utterance === undefined && typeof window !== 'undefined') Utterance = window.SpeechSynthesisUtterance;
    var storage = options.localStorage;
    var selectEl = options.selectEl || null;
    var rateEl = options.rateEl || null;
    var rateValueEl = options.rateValueEl || null;
    var noteEl = options.noteEl || null;
    var previewBtn = options.previewBtn || null;
    var delay = options.delay || function (fn, ms) { return setTimeout(fn, ms); };
    var pollMs = options.pollMs == null ? 150 : options.pollMs;
    var previewText = options.previewText || PREVIEW_TEXT;
    var onUnsupported = options.onUnsupported || function (message) {
      if (typeof alert === 'function') alert(message);
    };

    var settings = loadSettings(storage);
    var voices = [];
    var speakToken = 0;
    var speakingBtn = null;
    var voicesTimer = null;
    var supported = !!(synth && Utterance);

    function setNote(text) {
      if (noteEl) noteEl.textContent = text;
    }

    function setActive(btn, on) {
      if (!btn || !btn.classList) return;
      if (on) btn.classList.add('speak-active');
      else btn.classList.remove('speak-active');
    }

    function clearActive() {
      if (speakingBtn) setActive(speakingBtn, false);
      speakingBtn = null;
    }

    function currentVoiceURI(voice) {
      return voice ? (voice.voiceURI || voice.name || '') : '';
    }

    function populateSelect(preferred) {
      if (!selectEl) return;
      var english = voices.filter(isEnglishVoice).sort(function (a, b) {
        return scoreVoice(b) - scoreVoice(a);
      });
      var best = english[0] || null;
      var selected = preferred || best;
      selectEl.innerHTML = '';
      if (!english.length) {
        var empty = options.createElement
          ? options.createElement('option')
          : (typeof document !== 'undefined' ? document.createElement('option') : { value: '', textContent: '' });
        empty.value = '';
        empty.textContent = '瀏覽器預設（找不到英文語音）';
        if (selectEl.appendChild) selectEl.appendChild(empty);
        selectEl.value = '';
        selectEl.disabled = !supported;
        return;
      }
      english.forEach(function (voice) {
        var opt = options.createElement
          ? options.createElement('option')
          : document.createElement('option');
        opt.value = currentVoiceURI(voice);
        opt.textContent = voice.name + ' (' + (voice.lang || 'en') + ')' + (voice === best ? ' · 建議' : '');
        if (selectEl.appendChild) selectEl.appendChild(opt);
      });
      selectEl.disabled = !supported;
      selectEl.value = selected ? currentVoiceURI(selected) : currentVoiceURI(best);
    }

    function applyRateUI() {
      if (rateEl) {
        rateEl.value = String(settings.rate);
        rateEl.disabled = !supported;
      }
      if (rateValueEl) rateValueEl.textContent = settings.rate.toFixed(2);
    }

    function refreshFromSynth(opts) {
      opts = opts || {};
      voices = supported && synth.getVoices ? (synth.getVoices() || []) : [];
      var savedURI = settings.manual ? settings.voiceURI : '';
      var chosen = pickBestVoice(voices, savedURI);
      var lostManual = !!(settings.manual && settings.voiceURI && !chosen);
      if (lostManual) {
        settings.manual = false;
        chosen = pickBestVoice(voices, '');
      }
      if (chosen && (!settings.manual || lostManual)) {
        settings.voiceURI = currentVoiceURI(chosen);
      }
      if (chosen || settings.voiceURI) saveSettings(settings, storage);
      populateSelect(chosen);
      applyRateUI();
      if (!supported) setNote(UNSUPPORTED_NOTE);
      else if (!voices.filter(isEnglishVoice).length) setNote(EMPTY_VOICE_NOTE);
      else if (lostManual) setNote(FALLBACK_VOICE_NOTE);
      else if (!opts.keepNote) setNote(LIMITATION_NOTE);
      return chosen;
    }

    function waitForVoices(timeoutMs) {
      timeoutMs = timeoutMs == null ? 1200 : timeoutMs;
      return new Promise(function (resolve) {
        if (!supported) {
          resolve([]);
          return;
        }
        var settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          if (synth.removeEventListener) synth.removeEventListener('voiceschanged', onChange);
          resolve(synth.getVoices ? (synth.getVoices() || []) : []);
        }
        function onChange() {
          var list = synth.getVoices ? (synth.getVoices() || []) : [];
          if (list.length) finish();
        }
        var existing = synth.getVoices ? (synth.getVoices() || []) : [];
        if (existing.length) {
          resolve(existing);
          return;
        }
        if (synth.addEventListener) synth.addEventListener('voiceschanged', onChange);
        delay(finish, timeoutMs);
      });
    }

    function cancel() {
      speakToken += 1;
      clearActive();
      if (supported && synth.cancel) synth.cancel();
    }

    function speakPhrase(phrase, voice, rate, token, rest) {
      if (token !== speakToken) return;
      var utterance = new Utterance(phrase);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = function () {
        if (token !== speakToken) return;
        if (rest.length) speakPhrase(rest[0], voice, rate, token, rest.slice(1));
        else clearActive();
      };
      utterance.onerror = function () {
        if (token !== speakToken) return;
        clearActive();
      };
      synth.speak(utterance);
    }

    function speak(text, btn) {
      if (!supported) {
        onUnsupported(UNSUPPORTED_NOTE);
        return Promise.resolve(false);
      }
      cancel();
      var token = speakToken;
      if (btn) {
        speakingBtn = btn;
        setActive(btn, true);
      }
      var phrases = splitPhrases(text);
      if (!phrases.length) {
        clearActive();
        return Promise.resolve(false);
      }
      return waitForVoices().then(function (list) {
        if (token !== speakToken) return false;
        voices = list || [];
        var chosen = refreshFromSynth({ keepNote: true });
        return new Promise(function (resolve) {
          delay(function () {
            if (token !== speakToken) {
              resolve(false);
              return;
            }
            speakPhrase(phrases[0], chosen, settings.rate, token, phrases.slice(1));
            resolve(true);
          }, 50);
        });
      });
    }

    function bind() {
      applyRateUI();
      if (!supported) {
        if (selectEl) selectEl.disabled = true;
        if (previewBtn) previewBtn.disabled = true;
        setNote(UNSUPPORTED_NOTE);
        populateSelect(null);
        return;
      }
      setNote(LIMITATION_NOTE);
      refreshFromSynth();
      function onVoicesChanged() {
        refreshFromSynth({ keepNote: false });
      }
      if (synth.addEventListener) synth.addEventListener('voiceschanged', onVoicesChanged);
      synth.onvoiceschanged = onVoicesChanged;
      if (pollMs > 0) {
        var polls = 0;
        voicesTimer = setInterval(function () {
          polls += 1;
          var list = synth.getVoices ? synth.getVoices() : [];
          if ((list && list.length) || polls > 12) {
            if (list && list.length) refreshFromSynth({ keepNote: true });
            clearInterval(voicesTimer);
            voicesTimer = null;
          }
        }, pollMs);
      }
      if (selectEl && selectEl.addEventListener) {
        selectEl.addEventListener('change', function () {
          settings.voiceURI = selectEl.value || '';
          settings.manual = !!settings.voiceURI;
          saveSettings(settings, storage);
          refreshFromSynth({ keepNote: true });
        });
      }
      if (rateEl && rateEl.addEventListener) {
        rateEl.addEventListener('input', function () {
          settings.rate = clampRate(rateEl.value);
          applyRateUI();
          saveSettings(settings, storage);
        });
        rateEl.addEventListener('change', function () {
          settings.rate = clampRate(rateEl.value);
          applyRateUI();
          saveSettings(settings, storage);
        });
      }
      if (previewBtn && previewBtn.addEventListener) {
        previewBtn.addEventListener('click', function () {
          speak(previewText, previewBtn);
        });
      }
    }

    bind();

    return {
      speak: speak,
      cancel: cancel,
      refreshVoices: refreshFromSynth,
      waitForVoices: waitForVoices,
      getSettings: function () { return { voiceURI: settings.voiceURI, rate: settings.rate, manual: settings.manual }; },
      getVoices: function () { return voices.slice(); },
      supported: supported
    };
  }

  return {
    SETTINGS_KEY: SETTINGS_KEY,
    DEFAULT_RATE: DEFAULT_RATE,
    MIN_RATE: MIN_RATE,
    MAX_RATE: MAX_RATE,
    PREVIEW_TEXT: PREVIEW_TEXT,
    LIMITATION_NOTE: LIMITATION_NOTE,
    UNSUPPORTED_NOTE: UNSUPPORTED_NOTE,
    EMPTY_VOICE_NOTE: EMPTY_VOICE_NOTE,
    isEnglishVoice: isEnglishVoice,
    scoreVoice: scoreVoice,
    pickBestVoice: pickBestVoice,
    prepareSpokenText: prepareSpokenText,
    splitPhrases: splitPhrases,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    clampRate: clampRate,
    createController: createController
  };
});
