/* GCBME 2026 self-practice — local feedback engine (no network).
   Browser: window.SPA ; Node: module.exports */
(function (root) {
'use strict';
/* ---------------- text normalisation ---------------- */
const UNITS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const DIG = { zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
const isNumWord = w => w in UNITS || w in TENS || w === 'hundred' || w === 'thousand';
function basicClean(t) {
  return String(t || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/ρ/g, ' rho ').replace(/≥/g, ' or more ')
    .replace(/\bco[\s-]?(2|two)\b/gi, 'co2').replace(/\bc\.?\s?o\.?\s?(2|two)\b/gi, 'co2').replace(/\bsp\s?o\s?(2|two)\b/gi, 'spo2')
    .replace(/\bwi[\s-]?fi\b/gi, 'wifi').replace(/(\d),(\d{3})\b/g, '$1$2');
}
// words -> digits ("zero point nine one" -> 0.91, "one hundred ninety six" -> 196, ".87" -> 0.87)
function numerize(tokens) {
  const out = []; let i = 0;
  const readInt = j => { // returns [value, nextIndex] or null
    let total = 0, cur = 0, used = false, k = j;
    while (k < tokens.length) {
      const w = tokens[k];
      if (w in UNITS) { if (used && cur % 10 !== 0 && cur < 100 && !(cur >= 20)) break; if (used && cur >= 20 && cur % 10 !== 0) break; cur += UNITS[w]; used = true; k++; }
      else if (w in TENS) { if (used && cur % 100 !== 0) break; cur += TENS[w]; used = true; k++; }
      else if (w === 'hundred' && used) { cur *= 100; k++; if (tokens[k] === 'and' && tokens[k + 1] && (tokens[k + 1] in UNITS || tokens[k + 1] in TENS)) k++; }
      else if (w === 'thousand' && used) { total += cur * 1000; cur = 0; k++; }
      else if (w === 'a' && (tokens[k + 1] === 'hundred') && !used) { cur = 1; used = true; k++; }
      else break;
    }
    return used ? [total + cur, k] : null;
  };
  while (i < tokens.length) {
    const w = tokens[i];
    if (w === 'point' && tokens[i + 1] in DIG) { // ".87"
      let k = i + 1, d = ''; while (k < tokens.length && tokens[k] in DIG) d += DIG[tokens[k++]];
      const prev = out.length && /^\d+$/.test(out[out.length - 1]) ? out.pop() : '0';
      out.push(prev + '.' + d); i = k; continue;
    }
    if (w === 'point' && /^\d+$/.test(tokens[i + 1] || '') && out.length && /^\d+$/.test(out[out.length - 1])) { out.push(out.pop() + '.' + tokens[i + 1]); i += 2; continue; }
    if (w === 'point' && /^\d+$/.test(tokens[i + 1] || '')) { out.push('0.' + tokens[i + 1]); i += 2; continue; }
    if (isNumWord(w) || (w === 'a' && tokens[i + 1] === 'hundred')) { const r = readInt(i); if (r) { out.push(String(r[0])); i = r[1]; continue; } }
    out.push(w); i++;
  }
  return out;
}
function tokens(text) {
  let t = basicClean(text).toLowerCase();
  t = t.replace(/(\d)\s*%/g, '$1 percent').replace(/(^|[^\d])\.(\d)/g, '$10.$2').replace(/(\d)-(\d)/g, '$1 to $2').replace(/[–—]/g, ' ');
  t = t.replace(/([a-z])-([a-z])/g, '$1 $2');
  const out = [];
  for (const seg of t.split(/[,;:!?]|\.(?!\d)/)) {
    const raw = seg.match(/[a-z0-9']+(?:\.\d+)?/g) || [];
    out.push(...numerize(raw.map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean)));
  }
  return out;
}
const norm = text => tokens(text).join(' ');
/* ---------------- key-idea coverage ---------------- */
const altCache = new Map();
const altToks = a => { if (!altCache.has(a)) altCache.set(a, tokens(a)); return altCache.get(a); };
const stemEq = (alt, w) => {
  if (!w) return false;
  if (/^\d/.test(alt)) return alt === w;
  if (alt === "n't") return /n't$/.test(w);
  if (alt.length <= 3) return w === alt || ['s', 'es', 'er', 'ed', 'ing', 'est'].some(x => w === alt + x);
  return w.startsWith(alt) || (alt.endsWith('e') && w.startsWith(alt.slice(0, -1)) && w.length <= alt.length + 3);
};
function altHit(alt, T) {
  const A = altToks(alt); if (!A.length) return false;
  outer: for (let j = 0; j <= T.length - A.length; j++) {
    for (let m = 0; m < A.length; m++) { const ok = m === A.length - 1 ? stemEq(A[m], T[j + m]) : (A[m] === T[j + m] || stemEq(A[m], T[j + m]) && A[m].length > 3); if (!ok) continue outer; }
    return true;
  }
  return false;
}
const ALLOW = { oneliner: n => Math.max(0, n - 1), patient: n => (n >= 2 ? 1 : 0) };
function coverage(concept, text, semHits, angle) {
  const T = tokens(text);
  const only = concept.angleIdeas && concept.angleIdeas[angle];
  const ideas = concept.ideas.map((idea0, i) => {
    const idea = only ? Object.assign({}, idea0, { must: only.includes(i) }) : idea0;
    const groups = idea.any.map(g => g.find(a => altHit(a, T)) || null);
    const lex = groups.every(Boolean);
    const sem = !!(semHits && semHits[i]);
    return { i, zh: idea.zh, en: idea.en, must: idea.must, hit: lex || sem, via: lex ? 'lex' : (sem ? 'sem' : ''), matched: groups.filter(Boolean) };
  });
  const scored = only ? ideas.filter(x => x.must) : ideas;
  const w = x => x.must ? 2 : 1;
  const tot = scored.reduce((a, x) => a + w(x), 0), got = scored.reduce((a, x) => a + (x.hit ? w(x) : 0), 0);
  const mustMissing = ideas.filter(x => x.must && !x.hit);
  const nMust = ideas.filter(x => x.must).length;
  const allow = (ALLOW[angle] || (n => (n >= 3 ? 1 : 0)))(nMust);
  return { ideas, pct: Math.round(100 * got / tot), mustOk: mustMissing.length <= allow, mustMissing, allow, nMust, only: !!only };
}
/* ---------------- fact-safety ---------------- */
const NEG = new Set(['not', 'no', 'never', 'cannot', "can't", "doesn't", "don't", "isn't", "aren't", "won't", "wasn't", 'without', 'instead', 'rather', 'nor', 'nothing', "it's not", 'neither']);
const near = (T, i, before, after, pred) => { for (let k = Math.max(0, i - before); k <= Math.min(T.length - 1, i + after); k++) if (k !== i && pred(T[k], k)) return true; return false; };
const negBefore = (T, i, n = 6) => near(T, i, n, 0, w => NEG.has(w) || /n't$/.test(w));
const quote = (T, i, a = 4, b = 4) => T.slice(Math.max(0, i - a), i + b + 1).join(' ');
function factCheck(text, allowed) {
  const T = tokens(text), flags = [];
  const add = (rule, i, zh, fix) => { if (!flags.some(f => f.rule === rule)) flags.push({ rule, quote: quote(T, i), zh, fix, severity: 'error' }); };
  T.forEach((w, i) => {
    if (/^diagnos/.test(w) && !negBefore(T, i, 7) && !near(T, i, 7, 7, x => /^(psg|polysomnography|doctor|doctors|confirm|confirms|still|standard|final|further|physician)$/.test(x)))
      add('diagnose', i, '雷達是 TFDA 核可的「可疑重度 OSA 篩檢」，不能說它會診斷。', "It screens for suspected severe OSA. It doesn't diagnose OSA on its own.");
    if (/^(oxygen|spo2|saturation|co2|carbon|o2)$/.test(w) && !negBefore(T, i, 8)
      && near(T, i, 8, 0, x => /^(measur|detect|monitor|track|check|read|sens|record|see$|sees$|show|captur|calculat|estimat)/.test(x))
      && !near(T, i, 10, 6, x => /^(wearable|wearables|oximeter|oximeters|patch|patches|psg|watch|watches|ring|rings|pulse|lungs|lung|sensors?)$/.test(x)))
      add('oxygen', i, '雷達不量血氧（SpO₂）也不量 CO₂，只看呼吸模式。', "Our radar does not measure oxygen or CO2. It only sees the breathing pattern.");
    if (/^airflow$/.test(w) && !negBefore(T, i, 6) && near(T, i, 6, 0, x => /^(radar|it|device)$/.test(x)) && near(T, i, 5, 0, x => /^(measur|detect|sens|see|sees|watch|track|record)/.test(x)) && !near(T, i, 6, 3, x => /^(test|tests|psg|standard|scoring)$/.test(x)))
      add('airflow', i, '雷達看的是「胸部動作」，不是氣流；看氣流的是標準睡眠檢查。', 'Sleep tests watch airflow, while the radar watches the chest.');
    if (/^(predict|prove|caus|determin)/.test(w) && w !== 'because' && !negBefore(T, i, 8) && near(T, i, 8, 8, x => /^(heart|lvef|cardiac|failure|bnp)$/.test(x)))
      add('heart', i, '心臟的發現只是「關聯」，還沒驗證能預測或診斷，也不能說是因果。', "It's an association, not a diagnosis. It isn't validated yet for prediction.");
    if (/^replac/.test(w) && !negBefore(T, i, 6) && near(T, i, 2, 5, x => /^(psg|polysomnography|test|tests|study)$/.test(x)))
      add('replace', i, '雷達是篩檢工具，不取代 PSG／標準睡眠檢查。', "It doesn't replace PSG. When the screen is positive, we still do a standard sleep test.");
    if (/^(covid|coronavirus|pandemic)/.test(w)) add('covid', i, '這場演講不提 COVID。', '');
    if (/^(award|awards|prize|prizes)$/.test(w)) add('award', i, '這場演講不提獲獎。', '');
    if ((w === '100' && T[i + 1] === 'percent') || /^perfect/.test(w)) add('perfect', i, '數據沒有 100%／完美；請講實際數字。', '');
    if (w === '0.87' && near(T, i, 10, 10, x => /^(hospital|psg|lab)$/.test(x)) && !near(T, i, 10, 10, x => /^(home|hsat|homes)$/.test(x)))
      add('rho-hospital', i, 'ρ = 0.87 是「居家」研究（對 HSAT）；醫院對 PSG 是 r = 0.91。', 'r = 0.91 in the hospital, and rho = 0.87 at home.');
    if (w === '0.91' && near(T, i, 10, 10, x => /^(home|hsat|homes)$/.test(x)) && !near(T, i, 10, 10, x => /^(hospital|psg|lab)$/.test(x)))
      add('r-home', i, 'r = 0.91 是「醫院」研究（對 PSG）；居家是 ρ = 0.87。', 'r = 0.91 in the hospital, and rho = 0.87 at home.');
    if (w === '40' && near(T, i, 0, 2, x => /^minut/.test(x)) && near(T, i, 3, 0, x => /^(less|under|only|fewer|within|about)$/.test(x)))
      add('setup40', i, '貼感測器是「超過 40 分鐘」（more than 40 minutes）。', 'Putting on the sensors often takes more than 40 minutes.');
  });
  // numbers not in the script → soft note
  if (allowed) {
    const ok = new Set(allowed);
    T.forEach((w, i) => {
      if (!/^\d+(\.\d+)?$/.test(w) || ok.has(w)) return;
      const n = parseFloat(w); if (Number.isInteger(n) && n <= 12) return;
      if (/^(times|time|o'clock|years?|old)$/.test(T[i + 1] || '') && n < 60) return;
      flags.push({ rule: 'num-' + w, quote: quote(T, i), zh: `「${w}」這個數字講稿裡沒有，請確認（數字只用講稿裡的）。`, fix: '', severity: 'warn' });
    });
  }
  return flags;
}
/* ---------------- language suggestions ---------------- */
const S3 = { have: 'has', do: 'does', go: 'goes', watch: 'watches', finish: 'finishes', reach: 'reaches', touch: 'touches', catch: 'catches', miss: 'misses', fix: 'fixes', pass: 'passes' };
const third = v => S3[v] || (/(s|sh|ch|x|z)$/.test(v) ? v + 'es' : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'ies' : v + 's');
const PAST = { test: 'tested', compare: 'compared', publish: 'published', find: 'found', do: 'did', use: 'used', try: 'tried', put: 'put', see: 'saw', get: 'got', record: 'recorded', recruit: 'recruited', study: 'studied', ask: 'asked', start: 'started', give: 'gave', take: 'took', have: 'had', go: 'went', show: 'showed', build: 'built', think: 'thought', want: 'wanted', look: 'looked' };
const PLURAL = { study: 'studies', breath: 'breaths', patch: 'patches' };
const plural = n => PLURAL[n] || n + 's';
const COMP = { easy: 'easier', simple: 'simpler', cheap: 'cheaper', fast: 'faster', quick: 'quicker', big: 'bigger', small: 'smaller', early: 'earlier', late: 'later', safe: 'safer', clear: 'clearer', short: 'shorter', long: 'longer', deep: 'deeper', weak: 'weaker', strong: 'stronger', busy: 'busier', heavy: 'heavier', light: 'lighter', high: 'higher', low: 'lower', close: 'closer' };
const SUBJ = '(it|he|she|the radar|this radar|our radar|the device|this device|the patient|the system|the signal|the chest|the body|the airway|the brain|the heart|the dashboard|the report|the algorithm|psg|nobody|everyone|everybody|someone|each patient|every patient)';
const VERBS = 'need|have|detect|measure|show|work|look|take|send|pick|use|make|give|help|track|see|watch|cause|mean|tell|move|stop|change|open|close|come|go|run|get|sit|reflect|bounce|breathe|become|finish|end|leave|arrive|start|sense|record|depend|seem|try|want|do|happen|drop|rise|grow|fade|increase|decrease|keep|turn|cover|cost|look';
const LANG = [
  { id: 'sv', re: new RegExp(`\\b${SUBJ}\\s+((?:still|also|always|just|only|often|really|usually|never|even)\\s+)?(${VERBS})\\b(?!['’])`, 'gi'), skipPrev: /\b(let|make|makes|help|helps|lets|see|watch|hear|can|will|may|must|to|does|did|should|would|could|might|that|when|if)\s*$/i,
    fix: (m, s, adv, v) => `${s} ${adv || ''}${third(v.toLowerCase())}`, zh: '主詞是第三人稱單數（it／the radar／the patient…），現在式動詞要加 -s。', level: 'grammar' },
  { id: 'plural', re: /\b(many|several|two|three|four|five|six|both|these|those|a lot of|lots of|a few|few|\d+)\s+(patient|night|study|device|sensor|wire|event|minute|hour|signal|month|centimeter|bed|cycle|nurse|doctor|reason|option|test|method|day|second|week|year|point|percent?age|team|paper|feature)\b(?!['’-])/gi,
    skipPrev: /\b(a|the|one)\s*$/i, skipWord: /^(19|20)\d\d$/, fix: (m, q, n) => `${q} ${plural(n.toLowerCase())}`, zh: '數量大於一的可數名詞要用複數。', level: 'grammar' },
  { id: 'comparative', re: new RegExp(`\\bmore (${Object.keys(COMP).join('|')})\\b`, 'gi'), fix: (m, a) => COMP[a.toLowerCase()], zh: '單音節（和 -y 結尾）形容詞的比較級用 -er，不用 more。', level: 'grammar' },
  { id: 'redundant-prep', re: /\b(discuss|explain|emphasize|mention|describe)(es|s|ed|ing)? about\b|\breturn(s|ed)? back\b|\brepeat(s|ed)? again\b|\breach(es|ed)? to\b/gi,
    fix: m => m.replace(/\s+(about|back|again|to)$/i, ''), zh: '這些動詞後面直接接受詞，不用 about／back／again／to（中文直翻常多一個字）。', level: 'chinglish' },
  { id: 'can-be-able', re: /\bcan be able to\b/gi, fix: () => 'can', zh: 'can 和 be able to 意思一樣，擇一就好。', level: 'chinglish' },
  { id: 'how-to-say', re: /\bhow to say\b/gi, fix: () => 'let me put it this way', zh: '「怎麼說呢」直翻成 how to say 很像中式英文；卡住時說 Let me put it this way, 或 What I mean is,', level: 'chinglish' },
  { id: 'because-so', re: /\bbecause\b([^.?!]{1,90}?),?\s+\bso\b/gi, fix: (m, mid) => `because${mid},`, zh: '中文「因為…所以…」英文只能用一個：because 或 so，不要兩個一起。', level: 'chinglish' },
  { id: 'although-but', re: /\balthough\b([^.?!]{1,90}?),?\s+\bbut\b/gi, fix: (m, mid) => `although${mid},`, zh: '中文「雖然…但是…」英文只能用 although 或 but 其中一個。', level: 'chinglish' },
  { id: 'can-know', re: /\b(can|could) know\b/gi, fix: (m, c) => `${c} tell`, zh: '「可以知道」英文常說 we can tell／we can find out／we can see，不太說 can know。', level: 'chinglish' },
  { id: 'almost', re: /\balmost (patients|people|everyone|every patient|the patients|doctors)\b/gi, fix: (m, n) => /every/i.test(n) ? m : `almost all ${n.replace(/^the /i, 'the ')}`, zh: '「幾乎所有」要說 almost all ＋名詞，或 most ＋名詞；almost 不能直接接名詞。', level: 'chinglish' },
  { id: 'article-a', re: /\ba ([aeiou][a-z]+)\b/gi, skipWord: /^(one|once|user|use|used|useful|unit|uni\w*|eu\w*|usual\w*|ur\w*|u\w*ly)$/i, fix: (m, w) => `an ${w}`, zh: '母音開頭的字前面用 an（an apnea, an event, an alert）。', level: 'grammar' },
  { id: 'the-superlative', re: /\b(is|was|are|were) (most important|biggest|best|largest|main|hardest|easiest|key) (problem|point|reason|question|challenge|difference|limit|issue|message|finding|blind spot|idea)\b/gi, fix: (m, b, a, n) => `${b} the ${a} ${n}`, zh: '最高級（the biggest／the main…）前面要加 the。', level: 'grammar' },
  { id: 'at-night', re: /\bin the night\b/gi, fix: () => 'at night', zh: '「在晚上」說 at night；during the night 也可以。', level: 'collocation' },
  { id: 'during-sleeping', re: /\bduring sleeping\b/gi, fix: () => 'during sleep', zh: 'during 後面接名詞：during sleep，或說 while sleeping。', level: 'grammar' },
  { id: 'in-bed', re: /\b(lie|lying|lies|sleep|sleeping|sleeps) on (the )?bed\b/gi, fix: (m, v) => `${v} in bed`, zh: '「躺在床上睡」英文說 in bed。', level: 'collocation' },
  { id: 'in-the-hospital', re: /\bin hospital\b/gi, fix: () => 'in the hospital', zh: '美式英文說 in the hospital（英式才說 in hospital）。', level: 'collocation' },
  { id: 'at-home', re: /\b(in|to) home\b/gi, skipPrev: /\b(back|go|goes|went|come|came|bring|brought|take|took)\s*$/i, fix: (m, p) => p.toLowerCase() === 'in' ? 'at home' : 'home', zh: '「在家」說 at home；「回家」說 go home（不加 to）。', level: 'collocation' },
  { id: 'go-to-home', re: /\b(go|goes|went|come|came|back|bring|brought|take|took) to home\b/gi, fix: (m, v) => `${v} home`, zh: 'home 當副詞，前面不加 to：go home、take it home。', level: 'collocation' },
  { id: 'breath-verb', re: /\b(to|can|cannot|they|we|patients|people|you|i|don't|doesn't|not|and|still) breath\b(?!\s+(signal|pattern|wave|rate|sound))/gi, fix: (m, p) => `${p} breathe`, zh: 'breath /brɛθ/ 是名詞（一口氣）；動詞「呼吸」是 breathe /brið/。', level: 'word' },
  { id: 'breathe-noun', re: /\b(a|one|big|deep|huge|large|every|each|next) breathe\b/gi, fix: (m, p) => `${p} breath`, zh: '這裡要名詞 breath（一口氣），breathe 是動詞。', level: 'word' },
  { id: 'breath-signal', re: /\bbreath (signal|pattern|wave|waveform|rate)\b/gi, fix: (m, n) => `breathing ${n}`, zh: '修飾 signal／pattern 時用 breathing（breathing signal, breathing pattern）。', level: 'word' },
  { id: 'uncountable', re: /\b(staffs|informations|datas|researches|equipments|evidences|advices|feedbacks)\b/gi, fix: m => ({ staffs: 'staff', informations: 'information', datas: 'data', researches: 'research', equipments: 'equipment', evidences: 'evidence', advices: 'advice', feedbacks: 'feedback' })[m.toLowerCase()], zh: '這個字是不可數名詞（或集合名詞），不加 -s。', level: 'word' },
  { id: 'prep-with', re: /\b(associated|correlated) to\b/gi, fix: (m, a) => `${a} with`, zh: 'associated／correlated 後面接 with。', level: 'collocation' },
  { id: 'related-with', re: /\brelated with\b/gi, fix: () => 'related to', zh: 'related 後面接 to。', level: 'collocation' },
  { id: 'depend', re: /\b(is|are) depend(s)? on\b|\bdepend(s)? of\b/gi, fix: m => /of$/i.test(m) ? m.replace(/of$/i, 'on') : 'depends on', zh: 'depend 是動詞，不加 is；後面接 on。', level: 'grammar' },
  { id: 'past', re: /\b(in 20\d\d|last year|\d+ years ago|in our first year|at first|in study (1|2|3|one|two|three))\b([^.?!]{0,40}?)\bwe (test|compare|publish|find|do|use|try|put|see|get|record|recruit|study|ask|start|give|take|have|go|show|build|think|want|look)\b/gi,
    fix: (m, a, b, mid, v) => m.replace(new RegExp(`\\bwe ${v}\\b`, 'i'), `we ${PAST[v.toLowerCase()]}`), zh: '講已經做完的研究或過去的經驗，動詞用過去式。', level: 'grammar' },
  { id: 'gave-up', re: /\b(almost|nearly) give up\b/gi, fix: (m, a) => `${a} gave up`, zh: '「差點放棄」是過去的事：we almost gave up。', level: 'grammar' },
  { id: 'too-less', re: /\btoo less\b/gi, fix: () => 'too little', zh: '「太少」是 too little（不可數）或 too few（可數）。', level: 'grammar' },
  { id: 'much-plural', re: /\b(so|too|very)? ?much (patients|people|nights|wires|sensors|events|studies)\b/gi, fix: (m, a, n) => `${a ? a + ' ' : ''}many ${n}`, zh: '可數名詞複數用 many，不用 much。', level: 'grammar' },
  { id: 'people-has', re: /\b(people|patients|they|we) (has|is|was)\b/gi, fix: (m, s, v) => `${s} ${({ has: 'have', is: 'are', was: 'were' })[v.toLowerCase()]}`, zh: '複數主詞配複數動詞（have／are／were）。', level: 'grammar' },
  { id: 'patient-article', re: /\b(let|make|help|for|tell|ask|of|to) patient\b(?!s)/gi, fix: (m, p) => `${p} the patient`, zh: 'patient 是可數名詞，單數要加 the／a，泛指可以用複數 patients。', level: 'grammar' },
  { id: 'screen-tool', re: /\bscreen tool\b/gi, fix: () => 'screening tool', zh: '「篩檢工具」說 screening tool。', level: 'word' },
  { id: 'diagnosis-verb', re: /\b(can|to|cannot|not|doesn't|don't|could|will) diagnosis\b/gi, fix: (m, a) => `${a} diagnose`, zh: 'diagnosis 是名詞，動詞是 diagnose。', level: 'word' },
  { id: 'high-corr', re: /\b(a )?high correlation\b/gi, fix: () => 'a strong correlation', zh: '不算錯，但更道地的說法是 a strong correlation。', level: 'style' },
  { id: 'up-to', re: /\b(accuracy|correlation|sensitivity|specificity) (is|was) up to\b/gi, fix: (m, n, v) => `${n} ${v}`, zh: 'up to 是「最高可達」，研究結果直接說 the accuracy was …。', level: 'style' },
  { id: 'very-adj', re: /\bvery (good|big|small|important|bad|hard|difficult|different|useful|accurate|strong|weak|tiny|clear)\b/gi, fix: (m, a) => ({ good: 'strong', big: 'huge', small: 'tiny', important: 'crucial', bad: 'poor', hard: 'tough', difficult: 'tough', different: 'quite different', useful: 'really useful', accurate: 'highly accurate', strong: 'really strong', weak: 'quite weak', tiny: 'tiny', clear: 'really clear' })[a.toLowerCase()], zh: 'very＋形容詞用太多會很平；換一個更有力的字（huge、tiny、crucial、strong）。', level: 'style', minCount: 2 },
  { id: 'for-your-listening', re: /\bthank you for your listening\b/gi, fix: () => 'thank you for listening', zh: 'Thank you for listening，listening 前不加 your。', level: 'chinglish' },
];
const FILLER_RE = /\b(um+|uh+|er+|ah+|hmm+|erm)\b|\byou know\b|\bi mean\b|\bkind of\b|\bsort of\b/gi;
const GENERAL_CONNECTORS = ['first', 'second', 'third', 'finally', 'so', 'but', 'because', "that's why", 'in other words', 'for example', 'on top of that', 'then', 'also', 'however', 'even so', 'instead', 'in short', 'to be clear', 'the point is', 'which means', 'that means', 'actually', 'still'];
function langCheck(text, opts) {
  const issues = []; const src = basicClean(text);
  for (const r of LANG) {
    r.re.lastIndex = 0; let m; const hits = [];
    while ((m = r.re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 20), m.index);
      if (r.skipPrev && r.skipPrev.test(before)) continue;
      if (r.skipWord && r.skipWord.test(m[1] || '')) continue;
      const fixed = r.fix(...m);
      if (!fixed || fixed.toLowerCase() === m[0].toLowerCase()) continue;
      hits.push({ from: m[0], to: fixed, at: m.index });
    }
    if (hits.length >= (r.minCount || 1)) issues.push({ id: r.id, zh: r.zh, level: r.level, hits });
  }
  // fillers / repetition
  const fill = src.match(FILLER_RE) || [];
  if (fill.length >= 2) issues.push({ id: 'filler', zh: `贅詞 ${fill.length} 次（${[...new Set(fill.map(x => x.toLowerCase()))].join('、')}）。想不到字時停一拍就好，或用 Let me put it this way.`, level: 'fluency', hits: fill.map(f => ({ from: f, to: '' })) });
  const T = tokens(text);
  const andThen = (norm(text).match(/\band then\b/g) || []).length;
  if (andThen >= 3) issues.push({ id: 'and-then', zh: `“and then” 用了 ${andThen} 次，像在流水帳。換成 After that／Next／So／That's when 讓結構更清楚。`, level: 'fluency', hits: [] });
  const rep = []; for (let i = 1; i < T.length; i++) if (T[i] === T[i - 1] && !/^\d/.test(T[i]) && T[i] !== 'that' && T[i] !== 'had') rep.push(T[i]);
  if (rep.length >= 2) issues.push({ id: 'repeat', zh: `有重複的字（${[...new Set(rep)].join('、')}），這是卡住的痕跡；先想好下一句再開口，停頓比重複自然。`, level: 'fluency', hits: [] });
  // sentence / chunk length
  const chunks = (opts && opts.chunks && opts.chunks.length) ? opts.chunks : src.split(/(?<=[.?!])\s+/);
  const long = chunks.map(c => (c.match(/[A-Za-z0-9']+/g) || []).length).filter(n => n > 30);
  if (long.length) issues.push({ id: 'long', zh: `有 ${long.length} 句一口氣超過 30 個字。口說時一句 8–15 個字最好懂：說完一個意思就停，再用連接詞接下一句。`, level: 'fluency', hits: [] });
  const andCount = T.filter(w => w === 'and').length;
  if (T.length > 30 && andCount / T.length > 0.09) issues.push({ id: 'and-chain', zh: `“and” 佔了 ${Math.round(100 * andCount / T.length)}%，句子都用 and 串在一起。試著把句子切開，用 So／But／That's why 換接。`, level: 'fluency', hits: [] });
  return issues;
}
function connectorsUsed(text, concept) {
  const s = ' ' + norm(text) + ' ';
  const has = c => s.includes(' ' + norm(c.replace(/[…,:.]/g, ' ').split(/\s+/).slice(0, 4).join(' ')) + ' ');
  const conceptUsed = concept ? concept.connectors.filter(c => has(c.split('…')[0])) : [];
  const general = GENERAL_CONNECTORS.filter(c => s.includes(' ' + c + ' '));
  return { conceptUsed, general };
}
/* ---------------- similarity / variety ---------------- */
function grams(text, n = 3) { const T = tokens(text); const g = new Set(); for (let i = 0; i + n <= T.length; i++) g.add(T.slice(i, i + n).join(' ')); return g; }
function overlap(a, b) { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let k = 0; A.forEach(x => B.has(x) && k++); return k / Math.min(A.size, B.size); }
/* ---------------- upgrade ("your version, fixed") ---------------- */
function applyRule(r, s) {
  r.re.lastIndex = 0;
  return s.replace(r.re, (...m) => {
    const off = m[m.length - 2], whole = m[m.length - 1];
    const before = whole.slice(Math.max(0, off - 20), off);
    if (r.skipPrev && r.skipPrev.test(before)) return m[0];
    if (r.skipWord && r.skipWord.test(m[1] || '')) return m[0];
    const f = r.fix(...m.slice(0, -2)); return f || m[0];
  });
}
function upgrade(text, issues) {
  let s = basicClean(text);
  s = s.replace(FILLER_RE, ' ').replace(/\b(\w+)(\s+\1\b)+/gi, '$1').replace(/\s+/g, ' ');
  // fact-safe rewrites first (they change whole clauses)
  s = s.replace(/\b(it|the radar|this radar|our radar|the device)\s+(can\s+)?diagnos(e|es)\s+(osa|sleep apnea|obstructive sleep apnea)\b/gi, (m, sub) => `${sub} screens for suspected severe OSA`)
       .replace(/\b(it|the radar|this radar|our radar|the device)\s+(can\s+)?(also\s+)?(measures?|detects?|monitors?|tracks?|checks?)\s+(the\s+)?(blood\s+)?(oxygen|spo2|co2)(\s+(level|levels|saturation))?(\s+(too|as well|also))?\b/gi, (m, sub) => `${sub} doesn't measure oxygen or CO2; it only sees the breathing pattern`)
       .replace(/\b(it|the radar|this)\s+(can\s+)?(predicts?|diagnos(?:e|es))\s+heart failure\b/gi, (m, sub) => `${sub} is linked to weaker heart function, but it isn't validated for prediction`)
       .replace(/\b(it|the radar|this)\s+(can\s+)?replaces?\s+(the\s+)?psg\b/gi, (m, sub) => `${sub} doesn't replace PSG`);
  const ids = new Set((issues || []).map(x => x.id));
  for (const r of LANG) if (ids.has(r.id)) s = applyRule(r, s);
  // sentence shaping: break long runs before discourse markers
  const sents = s.split(/(?<=[.?!])\s+/).flatMap(seg => {
    if (seg.split(/\s+/).length <= 22) return [seg];
    const parts = seg.split(/\s+(?=(?:so|but|and then|because|first|second|third|finally|that's why|also|then|however|in other words|for example|and the|and it|and we)\b)/i);
    const out = []; let buf = '';
    for (const p of parts) { if (buf && buf.split(/\s+/).length + p.split(/\s+/).length > 16) { out.push(buf.trim()); buf = p; } else buf += ' ' + p; }
    if (buf.trim()) out.push(buf.trim());
    return out.map((x, k) => (k ? x.replace(/^(and then|and)\s+/i, '') : x).replace(/[,;]\s*$/, ''));
  });
  s = sents.map(x => x.trim()).filter(Boolean).map(x => /[.?!]$/.test(x) ? x : x + '.').join(' ');
  s = s.replace(/\s+([,.?!;])/g, '$1').replace(/,\./g, '.').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bi\b/g, 'I').replace(/\bi'(m|ve|d|ll)\b/g, "I'$1").replace(/(^|[.?!]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  s = s.replace(/\b(psg|osa|hsat|tfda|lvef|ahi|brdi|co2|spo2|ieee|nt-probnp|wifi|tx|rx|ecg)\b/gi, w => ({ brdi: 'bRDI', wifi: 'Wi-Fi', co2: 'CO2', spo2: 'SpO2', 'nt-probnp': 'NT-proBNP', tx: 'Tx', rx: 'Rx' })[w.toLowerCase()] || w.toUpperCase());
  return s;
}
/* ---------------- full analysis ---------------- */
function analyze({ concept, angle, angles, text, seconds, chunks, prev, models, allowed, semHits }) {
  const T = tokens(text), words = T.length;
  const cov = coverage(concept, text, semHits, angle);
  const facts = factCheck(text, allowed);
  const lang = langCheck(text, { chunks });
  const conn = connectorsUsed(text, concept);
  const wpm = seconds > 3 ? Math.round(words / (seconds / 60)) : 0;
  const target = (angles && angles[angle] && angles[angle].sec) || 30;
  const pace = [];
  if (words < 8) pace.push({ id: 'too-short', zh: '講得太短了，至少講 2–3 句，讓聽眾聽得懂。' });
  if (wpm && wpm < 85 && words >= 8) pace.push({ id: 'slow', zh: `速度 ${wpm} 字／分，偏慢；目標 110–150。先把句子想短，再一口氣講完一句。` });
  if (wpm > 175) pace.push({ id: 'fast', zh: `速度 ${wpm} 字／分，偏快；重點數字前停一拍，聽眾才跟得上。` });
  if (seconds && seconds > target * 1.8 && angle !== 'oneliner') pace.push({ id: 'overtime', zh: `這個角度建議約 ${target} 秒，你講了 ${Math.round(seconds)} 秒；試著只留最重要的 2–3 個重點。` });
  if (angle === 'oneliner' && words > 30) pace.push({ id: 'oneliner-long', zh: `一句話版本你講了 ${words} 個字；壓到 20 個字以內。` });
  const prevTexts = (prev || []).map(p => p.text).filter(Boolean);
  const simPrev = prevTexts.length ? Math.max(...prevTexts.map(p => overlap(text, p))) : 0;
  const simModel = (models || []).length ? Math.max(...models.map(m => overlap(text, m))) : 0;
  const variety = [];
  if (simModel > 0.6 && words > 12) variety.push({ id: 'recite', zh: `和示範稿重疊 ${Math.round(simModel * 100)}%，比較像在背稿。換成你自己的字和句型講同樣的意思。` });
  if (simPrev > 0.5 && words > 12) variety.push({ id: 'same', zh: `和你前一輪的說法重疊 ${Math.round(simPrev * 100)}%。這一輪換個開頭、換個例子或順序。` });
  const errors = lang.filter(x => ['grammar', 'word', 'chinglish', 'collocation'].includes(x.level));
  // next-round targets (max 3)
  const targets = [];
  facts.filter(f => f.severity === 'error').slice(0, 1).forEach(f => targets.push({ type: 'fact', key: f.rule, zh: '守住界線：' + f.zh, en: f.fix }));
  cov.mustMissing.slice(0, 3 - targets.length).forEach(x => targets.push({ type: 'idea', key: x.i, zh: '補上重點：' + x.zh, en: x.en }));
  if (targets.length < 3 && errors.length) { const e = errors[0]; targets.push({ type: 'lang', key: e.id, zh: '修正：' + e.zh, en: e.hits[0] ? `${e.hits[0].from} → ${e.hits[0].to}` : '' }); }
  if (targets.length < 3 && variety.length) targets.push({ type: 'variety', key: variety[0].id, zh: variety[0].zh });
  if (targets.length < 3 && conn.conceptUsed.length < 2) { const c = concept.connectors.find(x => !conn.conceptUsed.includes(x)); if (c) targets.push({ type: 'connector', key: c, zh: `試著用一個轉折句：「${c}」`, en: c }); }
  if (targets.length < 3 && pace.length) targets.push({ type: 'pace', key: pace[0].id, zh: pace[0].zh });
  if (!targets.length) targets.push({ type: 'angle', key: 'new', zh: '這輪很好！下一輪換一個新角度，用不同的開頭和例子再講一次。' });
  const mastered = cov.mustOk && !facts.some(f => f.severity === 'error') && words >= 8;
  return { words, wpm, seconds, cov, facts, lang, errors, conn, pace, variety, simPrev, simModel, targets, mastered, upgraded: upgrade(text, lang) };
}
function checkTargets(targets, result) {
  return (targets || []).map(t => {
    let ok = null;
    if (t.type === 'idea') ok = !!(result.cov.ideas[t.key] && result.cov.ideas[t.key].hit);
    else if (t.type === 'fact') ok = !result.facts.some(f => f.rule === t.key);
    else if (t.type === 'lang') ok = !result.lang.some(l => l.id === t.key);
    else if (t.type === 'variety') ok = !result.variety.some(v => v.id === t.key);
    else if (t.type === 'pace') ok = !result.pace.some(p => p.id === t.key);
    else if (t.type === 'connector') ok = result.conn.conceptUsed.includes(t.key);
    else ok = true;
    return Object.assign({}, t, { ok });
  });
}
const API = { LANG, tokens, norm, coverage, factCheck, langCheck, upgrade, analyze, checkTargets, overlap, connectorsUsed };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SPA = API;
})(typeof window !== 'undefined' ? window : globalThis);
