/* GCBME 2026 self-practice page — app */
(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SK = 'gcbme2026-self-practice-v1', AK = 'gcbme2026-self-practice-ai-v1';
const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return d; } };
const ST = load(SK, { concepts: {}, settings: { voice: 'heart', rate: 1, record: true, semantic: false, hints: true }, free: [] });
ST.settings = Object.assign({ voice: 'heart', rate: 1, record: true, semantic: false, hints: true }, ST.settings || {});
const save = () => { try { localStorage.setItem(SK, JSON.stringify(ST)); } catch (e) { toast('無法儲存進度（瀏覽器儲存空間已滿或為私密模式）'); } };
const AI = load(AK, { provider: 'gemini', key: '', model: '', base: '' });
const saveAI = () => localStorage.setItem(AK, JSON.stringify(AI));
let D = null, MAN = {};
const toast = (m, ms = 2200) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, ms); };
const fmtS = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const FACT_RULES = [
  'r = 0.91：醫院研究，196 位病人，對 PSG',
  'Spearman ρ = 0.87：居家研究，80 位病人、147 晚，對 HSAT；平均約低 5 events/h',
  'TFDA：bRDI ≥ 30 只作為「可疑重度 OSA 的篩檢」，敏感度與特異度 90.5%；不是診斷，不取代 PSG',
  '雷達不量血氧（SpO₂）也不量 CO₂，只看胸部動作／呼吸模式',
  '心臟（LVEF、週期性呼吸、NT-proBNP）只是關聯，尚未驗證可診斷或預測，不能說因果',
  'PSG 貼感測器「超過 40 分鐘」（more than 40 minutes）',
  '不提 COVID、不提獲獎；引用文獻不唸出來；其他數字只用講稿裡有的',
];
const conceptState = id => (ST.concepts[id] = ST.concepts[id] || { rounds: [], mastered: false });

/* ---------------- audio ---------------- */
const keyOf = t => String(t).replace(/\s+/g, ' ').trim();
let audioEl = null;
function stopAudio() { if (audioEl) { audioEl.pause(); audioEl = null; } if (window.speechSynthesis) speechSynthesis.cancel(); }
function play(text) {
  stopAudio();
  const m = MAN[keyOf(text)];
  if (m) {
    const a = new Audio(`audio/${ST.settings.voice}/${m[0]}.mp3`);
    a.playbackRate = +ST.settings.rate || 1; a.preservesPitch = true; a.webkitPreservesPitch = true;
    audioEl = a; a.play().catch(() => browserSay(text)); return;
  }
  browserSay(text);
}
function browserSay(text) {
  if (!window.speechSynthesis) { toast('這個瀏覽器不能朗讀'); return; }
  const u = new SpeechSynthesisUtterance(String(text).replace(/\bbRDI\b/g, 'b R D I').replace(/\bPSG\b/g, 'P S G').replace(/\bOSA\b/g, 'O S A'));
  u.lang = 'en-US'; u.rate = 0.95 * (+ST.settings.rate || 1);
  const v = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
  const pref = v.find(x => /Samantha|Ava|Google US English|Jenny|Aria/i.test(x.name)) || v[0]; if (pref) u.voice = pref;
  speechSynthesis.speak(u);
}
const pbtn = (text, label = '▶') => `<button type="button" class="play" data-say="${esc(text)}" aria-label="播放">${label}</button>`;

/* ---------------- speech capture ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
class Capture {
  constructor(onText) { this.onText = onText; this.final = ''; this.interim = ''; this.chunks = []; this.active = false; this.err = ''; this.blobUrl = ''; }
  async start() {
    this.active = true; this.final = ''; this.interim = ''; this.chunks = []; this.err = ''; this.t0 = Date.now();
    if (ST.settings.record && navigator.mediaDevices && window.MediaRecorder) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.parts = []; this.mr = new MediaRecorder(this.stream);
        this.mr.ondataavailable = e => e.data.size && this.parts.push(e.data);
        this.mr.onstop = () => { const b = new Blob(this.parts, { type: this.mr.mimeType || 'audio/webm' }); this.blobUrl = URL.createObjectURL(b); this.stream.getTracks().forEach(t => t.stop()); this.onRec && this.onRec(this.blobUrl); };
        this.mr.start();
      } catch (e) { this.err = '無法錄音（麥克風權限？）。仍可用語音辨識或直接輸入。'; }
    }
    if (SR) this._spawn(); else this.err = (this.err ? this.err + ' ' : '') + '這個瀏覽器不支援語音辨識：講完後請在下方文字框輸入（iPhone 可用鍵盤上的🎙聽寫）。';
  }
  _spawn() {
    const r = new SR(); this.rec = r; r.lang = 'en-US'; r.continuous = true; r.interimResults = true;
    const base = this.final, baseChunks = this.chunks.slice();
    r.onresult = e => {
      let fin = [], inter = '';
      for (let i = 0; i < e.results.length; i++) { const t = e.results[i][0].transcript.trim(); if (e.results[i].isFinal) fin.push(t); else inter += t + ' '; }
      this.chunks = baseChunks.concat(fin); this.final = (base + ' ' + fin.join(' ')).replace(/\s+/g, ' ').trim(); this.interim = inter.trim();
      this.onText(this.final, this.interim);
    };
    r.onerror = e => { if (/not-allowed|service-not-allowed/.test(e.error)) { this.err = '語音辨識權限被拒絕，請到瀏覽器設定允許麥克風。'; this.active = false; } else if (e.error === 'network') this.err = '語音辨識需要網路。'; };
    r.onend = () => { if (this.interim) { this.final = (this.final + ' ' + this.interim).trim(); this.chunks.push(this.interim); this.interim = ''; } if (this.active) { try { this._spawn(); } catch (e) { } } };
    try { r.start(); } catch (e) { }
  }
  stop() {
    this.active = false; this.sec = (Date.now() - this.t0) / 1000;
    try { this.rec && this.rec.stop(); } catch (e) { }
    try { this.mr && this.mr.state !== 'inactive' && this.mr.stop(); } catch (e) { }
    return new Promise(res => setTimeout(() => res({ text: (this.final + ' ' + this.interim).trim(), chunks: this.chunks, sec: this.sec }), 700));
  }
}

/* ---------------- optional semantic matching (transformers.js, cached by browser) ---------------- */
const EMB = { state: 'off', ext: null, cache: new Map() };
function ensureEmb() {
  if (!ST.settings.semantic) return Promise.resolve(false);
  if (EMB.state === 'ready') return Promise.resolve(true);
  if (EMB.p) return EMB.p;
  EMB.state = 'loading';
  EMB.p = Promise.race([(async () => {
    const tf = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
    tf.env.allowLocalModels = false; tf.env.useBrowserCache = true;
    EMB.ext = await tf.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', device: 'wasm' });
    EMB.state = 'ready'; return true;
  })(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 90000))]).catch(e => { EMB.state = 'failed'; console.warn('semantic model unavailable', e && e.message); return false; });
  return EMB.p;
}
async function semHits(concept, text) {
  if (!(await ensureEmb())) return null;
  const emb = async xs => (await EMB.ext(xs, { pooling: 'mean', normalize: true })).tolist();
  const need = concept.ideas.map(i => i.en).filter(t => !EMB.cache.has(t));
  if (need.length) (await emb(need)).forEach((v, i) => EMB.cache.set(need[i], v));
  const w = text.split(/\s+/).filter(Boolean); const wins = [];
  for (const L of [8, 14, 20]) for (let i = 0; i < Math.max(1, w.length - L + 1); i += 3) wins.push(w.slice(i, i + L).join(' '));
  if (!wins.length) return null;
  const ev = await emb(wins.slice(0, 120));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  return concept.ideas.map(i => Math.max(...ev.map(v => dot(v, EMB.cache.get(i.en)))) >= 0.52);
}

/* ---------------- tabs ---------------- */
function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name || (name === 'practice' && b.dataset.tab === 'list')));
  stopAudio();
  if (name === 'list') renderList(); if (name === 'progress') renderProgress(); if (name === 'settings') renderSettings(); if (name === 'free') renderFree(); if (name === 'help') renderHelp();
  window.scrollTo(0, 0);
}

/* ---------------- concept list ---------------- */
let listFilter = 'all';
function conceptAngles(c) { return Object.keys(c.models); }
function renderList() {
  const el = $('#tab-list');
  const done = D.concepts.filter(c => conceptState(c.id).mastered).length;
  const cards = D.concepts.filter(c => listFilter === 'all' || (listFilter === 'talk' && !c.qa) || (listFilter === 'qa' && c.qa) || (listFilter === 'todo' && !conceptState(c.id).mastered)).map(c => {
    const s = conceptState(c.id), n = D.concepts.indexOf(c) + 1;
    const tried = new Set(s.rounds.map(r => r.angle));
    const best = s.rounds.reduce((a, r) => Math.max(a, r.cov), 0);
    return `<button type="button" class="ccard" data-open="${c.id}">
      <span class="num">觀念 ${n}${c.qa ? ' <span class="badge qa">問答</span>' : ''}${s.mastered ? ' <span class="badge star">⭐ 精熟</span>' : ''}</span>
      <span class="t">${esc(c.title_zh)}</span><span class="te">${esc(c.title_en)}</span>
      <span class="dots" title="已練過的角度">${conceptAngles(c).map(a => `<i class="dot ${tried.has(a) ? 'on' : ''}"></i>`).join('')}</span>
      <span class="tiny muted">練了 ${s.rounds.length} 輪｜最佳涵蓋 ${best}%</span>
      <span class="bar"><i style="width:${best}%"></i></span></button>`;
  }).join('');
  el.innerHTML = `<div class="card"><h2>選一個觀念，用不同方式講到會</h2>
    <p class="small">每個觀念都照「<b>A 理解 → B 你自己講 → C 看回饋 → D 換角度再講</b>」反覆練。每一輪都要你自己開口，講完頁面會分析你說的內容（重點、事實、文法與道地說法），再給你下一輪的目標。<b>同一個觀念至少練 3 輪、每輪換一個角度</b>，三輪都講到重點、沒有事實錯誤，就算精熟。</p>
    <p class="small muted">已精熟 ${done} / ${D.concepts.length} 個觀念。</p>
    <div class="row">${[['all', '全部'], ['talk', '演講內容'], ['qa', '問答'], ['todo', '還沒精熟']].map(([k, v]) => `<button type="button" class="chip ${listFilter === k ? 'on' : ''}" data-filter="${k}">${v}</button>`).join('')}</div></div>
    <div class="grid" id="conceptGrid">${cards}</div>`;
}

/* ---------------- practice ---------------- */
const P = { c: null, step: 'A', angle: null, cap: null, rec: false, timer: null, result: null, text: '', chunks: [], sec: 0, recUrl: '', mode: 'concept', showModel: false };
function nextAngle(c) {
  const tried = new Set(conceptState(c.id).rounds.map(r => r.angle));
  return conceptAngles(c).find(a => !tried.has(a)) || conceptAngles(c)[conceptState(c.id).rounds.length % conceptAngles(c).length];
}
function openConcept(id, step) {
  P.c = D.concepts.find(c => c.id === id); P.mode = 'concept'; P.step = step || (conceptState(id).rounds.length ? 'B' : 'A'); P.angle = nextAngle(P.c); P.result = null; P.text = ''; P.recUrl = '';
  showTab('practice'); renderPractice();
}
const lastTargets = id => { const r = conceptState(id).rounds; return r.length ? r[r.length - 1].next || [] : []; };
function stepsBar() {
  const order = ['A', 'B', 'C', 'D'], names = { A: 'A 理解', B: 'B 你自己講', C: 'C 回饋', D: 'D 再講一次' };
  const i = order.indexOf(P.step);
  return `<div class="steps">${order.map((s, k) => `<span class="${k === i ? 'on' : k < i ? 'done' : ''}">${names[s]}</span>`).join('')}</div>`;
}
function renderPractice() {
  const c = P.c, s = conceptState(c.id), n = D.concepts.indexOf(c) + 1, el = $('#tab-practice');
  const head = `<div class="row" style="justify-content:space-between;margin-bottom:8px"><button type="button" class="btn sm" data-act="back">← 觀念列表</button><span class="small muted">已練 ${s.rounds.length} 輪${s.mastered ? '｜⭐ 精熟' : ''}</span></div>
   <div class="card"><div class="num tiny muted">觀念 ${n}${c.qa ? '（問答）' : ''}</div><h2>${esc(c.title_zh)}<br><span class="en muted" style="font-size:.95rem">${esc(c.title_en)}</span></h2>
   <div class="slides">${c.slides.map(x => `<img loading="lazy" src="slides/s${String(x).padStart(2, '0')}.webp" alt="投影片 ${x}" data-zoom>`).join('')}</div></div>`;
  let body = '';
  if (P.step === 'A') body = stepA(c);
  else if (P.step === 'B' || P.step === 'D') body = stepB(c);
  else if (P.step === 'C') body = stepC(c);
  el.innerHTML = head + stepsBar() + body + roundsTable(c);
}
function stepA(c) {
  const model = c.models.plain || Object.values(c.models)[0];
  return `<div class="card"><h2>A｜先理解這個觀念</h2>
   <p class="essence">${esc(c.essence)}</p>
   <h3>要講到的重點</h3><ul class="ideas">${c.ideas.map((i, k) => `<li>${i.must ? '<span class="must">★必講</span>' : '<span class="tiny muted">可加分 </span>'}${esc(i.zh)}
     <details><summary class="tiny muted">看英文提示</summary><div class="row"><span class="en">${esc(i.en)}</span>${pbtn(i.en)}</div></details></li>`).join('')}</ul>
   <h3>關鍵字與發音</h3>${c.terms.map(t => `<div class="term"><span>${pbtn(t.say)}</span><span><b>${esc(t.t)}</b> <span class="muted small">${esc(t.ipa)}</span>　${esc(t.zh)}<br><span class="small">${esc(t.note)}</span></span></div>`).join('')}
   <h3>好用的連接句</h3><div>${c.connectors.map((x, k) => `<span class="chip" data-say="${esc(c.connSay[k])}">🔈 ${esc(x)}</span>`).join('')}</div>
   <details><summary>台灣人講這段常見的錯誤</summary>${c.mistakes.map(m => `<div class="fb warn"><div class="fix"><del>${esc(m.bad)}</del> → <ins>${esc(m.good)}</ins></div><div class="small">${esc(m.why)}</div></div>`).join('')}</details>
   <h3>（可選）只聽一種示範</h3>
   <p class="small muted">只聽一種，聽完不要背，用你自己的話講。文字先模糊，點一下才看得到。</p>
   <div class="row">${pbtn(model)}<span class="en hidden-text" data-reveal>${esc(model)}</span></div>
   <div style="margin-top:14px"><button type="button" class="btn primary big" data-act="toB">我準備好了，開始自己講 →</button></div></div>`;
}
function stepB(c) {
  const s = conceptState(c.id), ang = D.angles[P.angle], round = s.rounds.length + 1, tgt = lastTargets(c.id);
  const tried = new Set(s.rounds.map(r => r.angle));
  const q = P.angle === 'skeptic' ? c.challenge : P.angle === 'honest' ? (c.honest_q || c.challenge) : '';
  const showHints = ST.settings.hints && round <= 1;
  return `<div class="card"><h2>${P.step === 'D' ? 'D｜再講一次（換新角度）' : 'B｜你自己講'}　<span class="muted small">第 ${round} 輪</span></h2>
   <div class="small muted">選一個角度（綠框＝練過）：</div>
   <div>${conceptAngles(c).map(a => `<span class="chip ${a === P.angle ? 'on' : tried.has(a) ? 'tried' : ''}" data-angle="${a}">${esc(D.angles[a].zh)}</span>`).join('')}</div>
   <div class="prompt" style="margin-top:8px"><div class="small"><b>${esc(ang.zh)}</b>｜建議約 ${ang.sec} 秒</div>
     <div class="q">${esc(ang.en)} ${pbtn(ang.en)}</div>
     ${q ? `<div class="q">❓ “${esc(q)}” ${pbtn(q)}</div>` : ''}
     <div class="small muted">${esc(ang.tip)}</div></div>
   ${tgt.length ? `<div class="targets"><b>這一輪的目標</b>（來自上一輪的建議）<ul>${tgt.map(t => `<li>${esc(t.zh)}${t.en ? `<br><span class="en small">${esc(t.en)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
   <details ${showHints ? 'open' : ''}><summary class="small">偷看重點（中文）</summary><ul class="ideas small">${c.ideas.map(i => `<li>${i.must ? '<span class="must">★</span>' : ''}${esc(i.zh)}</li>`).join('')}</ul></details>
   <div class="row" style="margin:12px 0"><button type="button" class="btn big ${P.rec ? 'rec' : 'primary'}" data-act="rec">${P.rec ? '■ 講完了' : '🎙 開始講'}</button><span class="timer" id="timer">${P.rec ? '' : '0:00'}</span><span class="small muted" id="timerHint">／目標 ${ang.sec} 秒</span></div>
   <div class="live" id="live">${P.rec ? '' : '<span class="muted small">按「開始講」後，這裡會即時出現你說的英文（語音辨識，en-US）。</span>'}</div>
   <p class="small muted" id="capErr"></p>
   <h3>你說的內容（可以修改辨識錯字，或直接打字／用鍵盤聽寫）</h3>
   <textarea id="said" placeholder="Speak, or type what you said here…">${esc(P.text)}</textarea>
   <div class="row" style="margin-top:8px"><button type="button" class="btn primary" data-act="analyze">分析我講的 →</button>
   <label class="small"><input type="checkbox" id="optRec" ${ST.settings.record ? 'checked' : ''}> 同時錄音（可回放）</label></div></div>`;
}
function diffMark(orig, upg) {
  const a = (orig.toLowerCase().match(/[a-z0-9'.]+/g) || []).map(w => w.replace(/[.]$/, ''));
  const words = upg.split(/\s+/), b = words.map(w => w.toLowerCase().replace(/[^a-z0-9'.]/g, '').replace(/[.]$/, ''));
  const n = a.length, m = b.length; if (n * m > 250000) return esc(upg);
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const keep = new Set(); let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { keep.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return words.map((w, k) => keep.has(k) ? esc(w) : `<mark>${esc(w)}</mark>`).join(' ');
}
function stepC(c) {
  const r = P.result, ang = D.angles[P.angle];
  if (!r) return '';
  const s = conceptState(c.id), rd = s.rounds[s.rounds.length - 1];
  const errN = r.facts.filter(f => f.severity === 'error').length;
  const stat = (lab, val, cls) => `<div class="stat ${cls || ''}"><b>${val}</b><span class="tiny">${lab}</span></div>`;
  const checked = rd && rd.targetsChecked && rd.targetsChecked.length ? `<div class="fb tip"><b>上一輪目標達成：</b>${rd.targetsChecked.map(t => `<div>${t.ok ? '✅' : '❌'} ${esc(t.zh)}</div>`).join('')}</div>` : '';
  const alt = Object.entries(c.models).filter(([a]) => a !== P.angle);
  const tried = new Set(s.rounds.map(x => x.angle)); const altPick = alt.find(([a]) => !tried.has(a)) || alt[0];
  const mine = c.models[P.angle];
  const mastery = s.mastered ? `<div class="mastery">⭐ <b>這個觀念精熟了！</b>你已經用 ${new Set(s.rounds.filter(x => x.ok).map(x => x.angle)).size} 種不同角度講對。之後可以到「自由模式」不看提示抽考。</div>`
    : `<div class="small muted">精熟條件：至少 3 輪講到必講重點、沒有事實錯誤，而且用 3 種不同角度。目前達標 ${s.rounds.filter(x => x.ok).length} 輪、${new Set(s.rounds.filter(x => x.ok).map(x => x.angle)).size} 種角度。</div>`;
  return `<div class="card" id="feedback"><h2>C｜回饋：你剛剛說的</h2>
   <div class="small muted">角度：${esc(ang.zh)}${P.mode === 'free' ? '（自由模式）' : ''}</div>
   <div class="stats">${stat('重點涵蓋', r.cov.pct + '%', r.cov.mustOk ? 'good' : 'warn')}${stat('事實錯誤', errN, errN ? 'bad' : 'good')}${stat('語言建議', r.errors.length, r.errors.length ? 'warn' : 'good')}${stat('字數', r.words)}${stat('秒數', Math.round(r.seconds || 0))}${stat('字／分', r.wpm || '—', r.wpm && (r.wpm < 85 || r.wpm > 175) ? 'warn' : '')}</div>
   ${checked}
   <h3>1. 重點有沒有講到</h3>${r.cov.only ? '<p class="small muted">這個角度只看「誠實回答」這個重點。</p>' : ''}
   ${r.cov.ideas.filter(x => !r.cov.only || x.must).map(x => `<div class="fb ${x.hit ? 'ok' : x.must ? 'bad' : ''}">${x.hit ? '✅' : x.must ? '⬜ ★' : '⬜'} ${esc(x.zh)}${x.hit && x.matched.length ? ` <span class="tiny muted">（聽到：${esc(x.matched.join('、'))}${x.via === 'sem' ? '；語意比對' : ''}）</span>` : ''}
     ${!x.hit ? `<div class="row small"><span>可以這樣補：</span><span class="en">${esc(x.en)}</span>${pbtn(x.en)}</div>` : ''}</div>`).join('')}
   <h3>2. 事實檢查</h3>${r.facts.length ? r.facts.map(f => `<div class="fb ${f.severity === 'error' ? 'bad' : 'warn'}">${f.severity === 'error' ? '⚠️' : '❔'} ${esc(f.zh)}<div class="small muted">你說：「…${esc(f.quote)}…」</div>${f.fix ? `<div class="row small"><span>安全說法：</span><span class="en">${esc(f.fix)}</span>${pbtn(f.fix)}</div>` : ''}</div>`).join('') : '<div class="fb ok">✅ 沒有發現違反事實界線的說法。</div>'}
   <h3>3. 語言建議（文法・中式英文・道地說法）</h3>${r.lang.length ? r.lang.map(l => `<div class="fb ${['grammar', 'word', 'chinglish', 'collocation'].includes(l.level) ? 'warn' : 'tip'}"><div>${esc(l.zh)}</div>${(l.hits || []).filter(h => h.to).slice(0, 3).map(h => `<div class="fix small"><del>${esc(h.from)}</del> → <ins>${esc(h.to)}</ins></div>`).join('')}</div>`).join('') : '<div class="fb ok">✅ 沒有抓到常見文法或中式英文問題。（本機規則只抓常見錯誤；想要更細的講解可以用 AI 教練。）</div>'}
   ${r.pace.concat(r.variety).map(p => `<div class="fb tip">💡 ${esc(p.zh)}</div>`).join('')}
   <div class="fb tip small">連接詞：${r.conn.conceptUsed.length ? '你用了 ' + r.conn.conceptUsed.map(esc).join('、') : '這輪沒有用到這個觀念的轉折句'}。可以試試：${c.connectors.filter(x => !r.conn.conceptUsed.includes(x)).slice(0, 2).map(x => `<span class="en">“${esc(x)}”</span>`).join('、')}</div>
   <h3>4. 你的版本・升級版</h3><p class="small muted">保留你的結構，只修正錯誤、去掉贅詞、把太長的句子切短。<mark>黃色</mark>是改過或補上的字。</p>
   <div class="upg">${diffMark(P.text, r.upgraded)}</div><div class="row" style="margin-top:6px">${pbtn(r.upgraded, '▶')}<span class="tiny muted">（用瀏覽器語音唸）</span></div>
   ${r.cov.mustMissing.length ? `<p class="small">再補上：${r.cov.mustMissing.map(x => `<span class="en">${esc(x.en)}</span>`).join(' ')}</p>` : ''}
   <h3>5. 換個說法（道地示範）</h3>
   ${mine ? `<div class="model"><div class="small"><b>同一個角度：${esc(ang.zh)}</b></div><div class="row">${pbtn(mine)}<span class="en">${esc(mine)}</span></div></div>` : ''}
   ${altPick ? `<div class="model"><div class="small"><b>另一個角度：${esc(D.angles[altPick[0]].zh)}</b></div><div class="row">${pbtn(altPick[1])}<span class="en">${esc(altPick[1])}</span></div></div>` : ''}
   <p class="small muted">示範只是參考，不要背；挑一兩個你喜歡的片語，下一輪用進你自己的句子。</p>
   ${P.recUrl ? `<h3>6. 聽聽自己</h3><audio controls src="${P.recUrl}" style="width:100%"></audio>` : ''}
   <h3>${P.recUrl ? '7' : '6'}. 想要更深入的講解？</h3>
   <div class="row"><button type="button" class="btn" data-act="ai" ${AI.key ? '' : 'disabled'}>🤖 請 AI 教練講解</button><button type="button" class="btn" data-act="copy">📋 複製給教練</button>${AI.key ? '' : '<span class="tiny muted">（到「設定・AI 教練」貼上你自己的 API 金鑰才能直接問；或按「複製給教練」貼到聊天視窗）</span>'}</div>
   <div id="aiOut" class="ai-out"></div>
   <div class="targets"><b>下一輪的目標</b><ul>${r.targets.map(t => `<li>${esc(t.zh)}${t.en ? `<br><span class="en small">${esc(t.en)}</span>` : ''}</li>`).join('')}</ul></div>
   ${P.mode === 'free' ? '' : mastery}
   <div class="row" style="margin-top:10px"><button type="button" class="btn primary big" data-act="again">${P.mode === 'free' ? '再抽一題 →' : '再講一次（換新角度）→'}</button>${P.mode === 'free' ? '' : '<button type="button" class="btn" data-act="same">同一個角度再講</button><button type="button" class="btn" data-act="toA">回到 A 看重點</button>'}</div></div>`;
}
function roundsTable(c) {
  const rs = conceptState(c.id).rounds; if (!rs.length) return '';
  return `<div class="card" id="rounds"><h2>每一輪的比較</h2><div class="tablewrap"><table class="cmp"><thead><tr><th>輪</th><th>角度</th><th>涵蓋</th><th>必講</th><th>事實錯</th><th>語言</th><th>字數</th><th>秒</th><th>字/分</th><th>目標達成</th></tr></thead><tbody>
   ${rs.map((r, k) => { const prev = rs[k - 1]; const up = prev ? (r.cov > prev.cov ? ' ▲' : r.cov < prev.cov ? ' ▼' : '') : '';
     const tc = r.targetsChecked || []; return `<tr><td>${k + 1}${r.mode === 'free' ? '<span class="tiny">自由</span>' : ''}</td><td class="small">${esc(D.angles[r.angle] ? D.angles[r.angle].zh : r.angle)}</td><td>${r.cov}%${up}</td><td>${r.mustOk ? '✅' : '—'}</td><td>${r.factErr}</td><td>${r.langN}</td><td>${r.words}</td><td>${Math.round(r.sec || 0)}</td><td>${r.wpm || '—'}</td><td>${tc.length ? tc.filter(t => t.ok).length + '/' + tc.length : '—'}</td></tr>`; }).join('')}
   </tbody></table></div>
   <details><summary class="small">看每一輪你說的話</summary>${rs.map((r, k) => `<div class="model small"><b>第 ${k + 1} 輪</b>（${esc(D.angles[r.angle] ? D.angles[r.angle].zh : '')}）<div class="en">${esc(r.text)}</div></div>`).join('')}</details></div>`;
}
async function toggleRec() {
  if (!P.rec) {
    stopAudio(); P.rec = true; P.text = ''; P.recUrl = '';
    P.cap = new Capture((fin, inter) => { const l = $('#live'); if (l) l.innerHTML = `${esc(fin)} <span class="interim">${esc(inter)}</span>`; const t = $('#said'); if (t) t.value = fin; });
    P.cap.onRec = url => { P.recUrl = url; };
    rerender(); await P.cap.start(); if (P.cap.err) $('#capErr').textContent = P.cap.err;
    const t0 = Date.now(), tg = D.angles[P.angle].sec;
    P.timer = setInterval(() => { const e = (Date.now() - t0) / 1000, el = $('#timer'); if (el) { el.textContent = fmtS(e); el.style.color = e > tg * 1.5 ? 'var(--bad)' : ''; } }, 250);
  } else {
    P.rec = false; clearInterval(P.timer);
    const res = await P.cap.stop(); P.sec = res.sec; P.chunks = res.chunks;
    const typed = $('#said') ? $('#said').value.trim() : '';
    P.text = typed || res.text; rerender();
    if (P.cap.err) $('#capErr').textContent = P.cap.err;
    if (P.text) await doAnalyze(); else toast('沒有聽到內容：可以再講一次，或在文字框輸入你說的話');
  }
}
function rerender() { if (P.mode === 'free') renderFreeSpeak(); else renderPractice(); }
async function doAnalyze(opts) {
  const c = P.c; const ta = $('#said');
  if (ta) P.text = ta.value.trim();
  if (opts && opts.text != null) { P.text = opts.text; P.sec = opts.seconds || 0; P.chunks = opts.chunks || []; }
  if (!P.text) { toast('請先講，或在文字框輸入你說的話'); return; }
  if (!P.sec) P.sec = P.text.split(/\s+/).length / 2.1; // typed: assume ~126 wpm
  const s = conceptState(c.id), prev = s.rounds;
  let sem = null; if (ST.settings.semantic) { toast('語意比對中…'); sem = await semHits(c, P.text).catch(() => null); }
  const r = SPA.analyze({ concept: c, angle: P.angle, angles: D.angles, text: P.text, seconds: P.sec, chunks: P.chunks, prev, models: Object.values(c.models), allowed: D.allowedNumbers, semHits: sem });
  const checkedTargets = SPA.checkTargets(lastTargets(c.id), r);
  const ok = r.mastered;
  s.rounds.push({ t: Date.now(), angle: P.angle, mode: P.mode, text: P.text, sec: Math.round(P.sec * 10) / 10, words: r.words, wpm: r.wpm, cov: r.cov.pct, mustOk: r.cov.mustOk, factErr: r.facts.filter(f => f.severity === 'error').length, langN: r.errors.length, ok, next: r.targets, targetsChecked: checkedTargets });
  if (s.rounds.length > 60) s.rounds = s.rounds.slice(-60);
  const okR = s.rounds.filter(x => x.ok); if (okR.length >= 3 && new Set(okR.map(x => x.angle)).size >= 3) s.mastered = true;
  save(); P.result = r; P.step = 'C';
  if (P.mode === 'free') { ST.free.push({ t: Date.now(), id: c.id, angle: P.angle, cov: r.cov.pct, ok }); if (ST.free.length > 100) ST.free = ST.free.slice(-100); save(); renderFreeResult(); }
  else renderPractice();
  const fb = $('#feedback'); if (fb) fb.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- AI coach ---------------- */
function coachPrompt() {
  const c = P.c, ang = D.angles[P.angle], r = P.result;
  const q = P.angle === 'skeptic' ? `（問題：“${c.challenge}”）` : P.angle === 'honest' ? `（問題：“${c.honest_q || c.challenge}”）` : '';
  return `你是一位英文口說教練。學員是台灣的胸腔內科醫師劉文德（Wen-Te Liu, M.D., Ph.D.），他剛在國際論壇用英文演講「Non-wearable Devices in Sleep Medicine: Using Contactless Radar to Check Breathing During Sleep」。他對英文口說沒什麼信心，偏好用自己的話抓重點、用自然的口語連接詞，不想背稿。目標是讓他能完全用自己的方式，講出正確、道地的英文。
請用繁體中文（台灣用語）回饋，英文例句保持英文。

【觀念】${c.title_en}（${c.title_zh}）
${c.essence}
【要講到的重點】
${c.ideas.map(i => `- ${i.must ? '★' : ''}${i.zh}｜${i.en}`).join('\n')}
【這一輪的角度】${ang.zh}：${ang.en}${q}，建議約 ${ang.sec} 秒
【事實界線（不可違反，也不要在示範裡違反）】
${FACT_RULES.map(x => '- ' + x).join('\n')}
【他剛剛說的（語音辨識逐字稿，可能有辨識錯字，請推測他想說的）】
"${P.text}"
（約 ${Math.round(r ? r.seconds : P.sec)} 秒、${r ? r.words : ''} 字）
【本機初步分析】涵蓋 ${r ? r.cov.pct : '?'}%；漏掉：${r ? r.cov.mustMissing.map(x => x.zh).join('、') || '無' : '?'}；事實提醒：${r ? r.facts.map(f => f.zh).join('；') || '無' : '?'}；語言：${r ? r.lang.map(l => l.id).join(', ') || '無' : '?'}

請依序回覆：
1. 一句總評（先講做得好的地方）
2. 重點涵蓋：哪些講到了、哪些漏了（漏的給一句英文補法）
3. 事實檢查：有沒有違反界線或講錯數字
4. 語言：挑最重要的 3–5 個問題，格式「你說：… → 建議：…（為什麼）」，特別注意中式英文、冠詞、單複數、時態、搭配詞、太長的句子
5. 升級版：保留他的結構和用字習慣，只修正錯誤、讓它更自然道地（口語、短句），不要改成正式書面英文
6. 另外兩種道地的說法（換句型或換角度，每種 2–4 句，要是他講得出口的程度）
7. 下一輪練習的 3 個具體目標`;
}
function mdLite(t) {
  return esc(t).replace(/^#{1,4}\s*(.+)$/gm, '<h4>$1</h4>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-*]\s+(.+)$/gm, '• $1').replace(/\n/g, '<br>');
}
async function askAI() {
  const out = $('#aiOut'); if (!AI.key) { toast('請先到「設定・AI 教練」貼上 API 金鑰'); return; }
  out.innerHTML = '<p class="small muted">AI 教練思考中…（你的逐字稿會送到你設定的 AI 服務）</p>';
  try { const txt = await callAI(coachPrompt()); out.innerHTML = `<div class="card" style="box-shadow:none"><h3>🤖 AI 教練</h3>${mdLite(txt)}</div>`; }
  catch (e) { out.innerHTML = `<div class="fb bad">AI 教練連線失敗：${esc(e.message || e)}。可以改用「複製給教練」。</div>`; }
}
async function callAI(prompt) {
  if (AI.provider === 'gemini') {
    const model = AI.model || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI.key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }) });
    const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
    return (j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(p => p.text).join('')) || '(沒有回應)';
  }
  const base = (AI.base || 'https://api.openai.com/v1').replace(/\/+$/, ''), model = AI.model || 'gpt-4o-mini';
  const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.key }, body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: 'user', content: prompt }] }) });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
  return j.choices[0].message.content;
}
async function copyCoach() {
  const t = coachPrompt();
  try { await navigator.clipboard.writeText(t); toast('已複製：貼到 ChatGPT／Gemini／Grok 的對話框就可以'); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('已複製'); } catch (e2) { toast('無法自動複製'); } ta.remove(); }
  window.__lastCoachPrompt = t;
}

/* ---------------- free mode ---------------- */
function renderFree() {
  const el = $('#tab-free'); const n = ST.free.length, ok = ST.free.filter(x => x.ok).length;
  el.innerHTML = `<div class="card"><h2>自由模式：隨機抽一個觀念＋一個角度，沒有提示</h2>
   <p class="small">像真的被問到一樣：只給你題目，不給重點、不給關鍵字。講完一樣有回饋，也會記到該觀念的紀錄裡。</p>
   <p class="small muted">已抽考 ${n} 題，其中 ${ok} 題講到必講重點且沒有事實錯誤。</p>
   <button type="button" class="btn primary big" data-act="draw">🎲 抽一題</button></div><div id="freeBox"></div>`;
}
function drawFree() {
  const c = D.concepts[Math.floor(Math.random() * D.concepts.length)], angs = conceptAngles(c);
  P.c = c; P.mode = 'free'; P.angle = angs[Math.floor(Math.random() * angs.length)]; P.result = null; P.text = ''; P.recUrl = ''; P.step = 'B';
  renderFreeSpeak();
}
function renderFreeSpeak() {
  const c = P.c, ang = D.angles[P.angle];
  const q = P.angle === 'skeptic' ? c.challenge : P.angle === 'honest' ? (c.honest_q || c.challenge) : '';
  $('#freeBox').innerHTML = `<div class="card"><h2>題目</h2><div class="prompt"><div class="small"><b>主題：${esc(c.title_en)}</b></div><div class="small">${esc(ang.zh)}｜約 ${ang.sec} 秒</div><div class="q">${esc(ang.en)}</div>${q ? `<div class="q">❓ “${esc(q)}” ${pbtn(q)}</div>` : ''}</div>
   <div class="row" style="margin:12px 0"><button type="button" class="btn big ${P.rec ? 'rec' : 'primary'}" data-act="rec">${P.rec ? '■ 講完了' : '🎙 開始講'}</button><span class="timer" id="timer">0:00</span></div>
   <div class="live" id="live"><span class="muted small">按「開始講」後，這裡會即時出現你說的英文。</span></div><p class="small muted" id="capErr"></p>
   <textarea id="said" placeholder="Speak, or type what you said here…">${esc(P.text)}</textarea>
   <div class="row" style="margin-top:8px"><button type="button" class="btn primary" data-act="analyze">分析我講的 →</button><button type="button" class="btn" data-act="draw">換一題</button></div></div>`;
}
function renderFreeResult() { $('#freeBox').innerHTML = stepC(P.c); }

/* ---------------- progress / settings / help ---------------- */
function renderProgress() {
  const rows = D.concepts.map((c, k) => { const s = conceptState(c.id); const angs = new Set(s.rounds.map(r => r.angle)); const best = s.rounds.reduce((a, r) => Math.max(a, r.cov), 0);
    return `<tr><td><a href="#" data-open="${c.id}">${k + 1}. ${esc(c.title_zh)}</a></td><td>${s.rounds.length}</td><td>${angs.size}/${conceptAngles(c).length}</td><td>${best}%</td><td>${s.rounds.filter(r => r.ok).length}</td><td>${s.mastered ? '⭐' : ''}</td></tr>`; }).join('');
  const all = D.concepts.flatMap(c => conceptState(c.id).rounds);
  $('#tab-progress').innerHTML = `<div class="card"><h2>我的進度</h2><p class="small">總共練了 ${all.length} 輪，精熟 ${D.concepts.filter(c => conceptState(c.id).mastered).length} / ${D.concepts.length} 個觀念。紀錄只存在這台裝置。</p>
   <div class="tablewrap"><table class="cmp"><thead><tr><th>觀念</th><th>輪數</th><th>角度</th><th>最佳涵蓋</th><th>達標輪</th><th>精熟</th></tr></thead><tbody>${rows}</tbody></table></div>
   <div class="row" style="margin-top:12px"><button type="button" class="btn" data-act="export">匯出紀錄（JSON）</button><label class="btn">匯入紀錄<input type="file" id="importFile" accept="application/json" hidden></label><button type="button" class="btn" data-act="reset">清除全部紀錄</button></div></div>`;
}
function renderSettings() {
  $('#tab-settings').innerHTML = `<div class="card"><h2>練習設定</h2>
   <label class="small"><input type="checkbox" id="setHints" ${ST.settings.hints ? 'checked' : ''}> 第一輪自動展開中文重點提示</label><br>
   <label class="small"><input type="checkbox" id="setRec" ${ST.settings.record ? 'checked' : ''}> 講的時候同時錄音（可回放；只存在記憶體）</label><br>
   <label class="small"><input type="checkbox" id="setSem" ${ST.settings.semantic ? 'checked' : ''}> 🧠 語意比對：用小型 AI 模型判斷「意思有沒有講到」（第一次要下載約 23 MB，之後瀏覽器會快取；關閉時只用關鍵字比對）</label>
   <p class="tiny muted" id="semState">${{ off: '', loading: '語意模型下載中…', ready: '語意模型已就緒', failed: '語意模型無法載入，改用關鍵字比對' }[EMB.state] || ''}</p>
   <h3>離線使用</h3><p class="small">網頁本身會自動存到這台裝置。示範音檔要另外下載一次：</p>
   <div class="row"><button type="button" class="btn" data-act="offline">⬇︎ 存目前聲音的示範音檔（約 ${D.audioMB || 5} MB）</button><span class="small muted" id="offState"></span></div></div>
   <div class="card"><h2>🤖 AI 教練（可選）</h2>
   <p class="small">不設定也能完整使用（回饋都在本機算）。如果你有自己的 API 金鑰，貼在這裡，就能在回饋頁按「請 AI 教練講解」，把<b>你的逐字稿、這個觀念的重點和事實界線</b>送到你選的 AI 服務，拿到更細的中文講解和升級版。<b>金鑰只存在這台裝置的瀏覽器（localStorage），不會上傳到網站或 GitHub。</b></p>
   <label class="field">服務<select id="aiProv"><option value="gemini" ${AI.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option><option value="openai" ${AI.provider === 'openai' ? 'selected' : ''}>OpenAI 相容（OpenAI、xAI、OpenRouter…）</option></select></label>
   <label class="field">API 金鑰<input type="password" id="aiKey" value="${esc(AI.key)}" autocomplete="off" placeholder="貼上你的金鑰"></label>
   <label class="field">模型（可留空）<input id="aiModel" value="${esc(AI.model)}" placeholder="${AI.provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'}"></label>
   <label class="field" id="aiBaseWrap" ${AI.provider === 'gemini' ? 'hidden' : ''}>API 網址（OpenAI 相容才需要）<input id="aiBase" value="${esc(AI.base)}" placeholder="https://api.openai.com/v1"></label>
   <div class="row"><button type="button" class="btn primary" data-act="aiSave">儲存</button><button type="button" class="btn" data-act="aiTest">測試連線</button><button type="button" class="btn" data-act="aiClear">清除金鑰</button><span class="small muted" id="aiState">${AI.key ? '已設定金鑰' : '尚未設定'}</span></div>
   <p class="small muted">沒有金鑰？回饋頁的「📋 複製給教練」會複製一段已經寫好的提示詞＋你的逐字稿，直接貼到 ChatGPT、Gemini 或 Grok 的對話框即可。</p></div>`;
}
function renderHelp() {
  $('#tab-help').innerHTML = `<div class="card"><h2>怎麼練最有效</h2><ol class="small">
   <li><b>一次只練一個觀念。</b>先在 A 看中文重點和關鍵字，最多只聽一種示範——不要背。</li>
   <li><b>每一輪都自己開口講。</b>按「開始講」，用你自己的話講；卡住就停一拍，用連接句（So／That's why／In other words）接下去。</li>
   <li><b>看回饋只挑 1–3 件事改。</b>頁面會告訴你漏了哪個重點、有沒有講錯事實、哪裡是中式英文，並給你「升級版」（保留你的句子，只修錯）。</li>
   <li><b>換角度再講。</b>對護理師、對病人、對工程師、回答質疑、一句話版……每換一個角度，你就被迫用不同的字和句型講同一件事——這就是「能自由講」的練法。</li>
   <li><b>至少 3 輪。</b>3 輪都講到必講重點、沒有事實錯誤、用了 3 種角度，就算精熟。之後去「自由模式」不看提示抽考。</li></ol>
   <h3>回饋怎麼算的</h3><ul class="small">
   <li><b>重點涵蓋</b>：比對你說的字有沒有包含每個重點的關鍵概念（可以用不同說法，例如 bounce back／reflect／echo 都算）。開啟「語意比對」會再用小型 AI 模型判斷意思。</li>
   <li><b>事實檢查</b>：抓出講稿以外的數字、把篩檢講成診斷、說雷達量血氧或 CO₂、把心臟關聯講成預測或因果、r／ρ 用錯場景等。</li>
   <li><b>語言建議</b>：約 40 條台灣人常見的錯誤規則（主詞動詞一致、單複數、冠詞、因為…所以、breath／breathe、in the hospital…），以及句子太長、贅詞、and 串太多、和上一輪或示範太像。</li>
   <li>本機規則抓不到所有錯誤；語音辨識也可能聽錯，可以先在文字框改正再分析。想要更細的講解就用 AI 教練或「複製給教練」。</li></ul>
   <h3>事實界線</h3><ul class="small">${FACT_RULES.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
   <h3>裝置</h3><p class="small">iPhone 請用 Safari（或 Chrome），第一次會問麥克風與語音辨識權限。電腦建議 Chrome。語音辨識會把聲音送到 Apple／Google 的辨識服務；錄音檔本身只留在這個分頁。</p></div>`;
}

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-say],[data-open],[data-act],[data-angle],[data-filter],[data-zoom],[data-reveal],#nav button');
  if (!t) return;
  if (t.matches('#nav button')) { showTab(t.dataset.tab); return; }
  if (t.dataset.say != null) { play(t.dataset.say); return; }
  if (t.dataset.open) { e.preventDefault(); openConcept(t.dataset.open); return; }
  if (t.dataset.filter) { listFilter = t.dataset.filter; renderList(); return; }
  if (t.dataset.zoom != null) { const lb = $('#lightbox'); lb.querySelector('img').src = t.src; lb.hidden = false; return; }
  if (t.dataset.reveal != null) { t.classList.remove('hidden-text'); return; }
  if (t.dataset.angle) { if (P.rec) return; P.angle = t.dataset.angle; const ta = $('#said'); if (ta) P.text = ta.value; renderPractice(); return; }
  const a = t.dataset.act;
  if (a === 'back') showTab('list');
  else if (a === 'toB') { P.step = 'B'; renderPractice(); window.scrollTo(0, 0); }
  else if (a === 'toA') { P.step = 'A'; renderPractice(); window.scrollTo(0, 0); }
  else if (a === 'rec') { await toggleRec(); }
  else if (a === 'analyze') { if (P.rec) await toggleRec(); else await doAnalyze(); }
  else if (a === 'again') { if (P.mode === 'free') { drawFree(); return; } P.step = 'D'; P.angle = nextAngle(P.c); P.text = ''; P.result = null; P.recUrl = ''; P.sec = 0; renderPractice(); window.scrollTo(0, 0); }
  else if (a === 'same') { P.step = 'D'; P.text = ''; P.result = null; P.recUrl = ''; P.sec = 0; renderPractice(); window.scrollTo(0, 0); }
  else if (a === 'ai') askAI();
  else if (a === 'copy') copyCoach();
  else if (a === 'draw') drawFree();
  else if (a === 'export') { const b = new Blob([JSON.stringify(ST, null, 1)], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'gcbme2026-self-practice-progress.json'; l.click(); }
  else if (a === 'reset') { if (confirm('確定要清除這台裝置上的全部練習紀錄？')) { ST.concepts = {}; ST.free = []; save(); renderProgress(); } }
  else if (a === 'aiSave' || a === 'aiTest') {
    AI.provider = $('#aiProv').value; AI.key = $('#aiKey').value.trim(); AI.model = $('#aiModel').value.trim(); AI.base = $('#aiBase').value.trim(); saveAI(); $('#aiState').textContent = AI.key ? '已儲存在這台裝置' : '尚未設定';
    if (a === 'aiTest') { $('#aiState').textContent = '測試中…'; try { const r = await callAI('Reply with exactly: OK'); $('#aiState').textContent = '連線成功：' + r.slice(0, 30); } catch (err) { $('#aiState').textContent = '失敗：' + (err.message || err); } }
  }
  else if (a === 'aiClear') { AI.key = ''; saveAI(); renderSettings(); toast('已清除金鑰'); }
  else if (a === 'offline') cacheAudio();
});
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'voiceSel') { ST.settings.voice = e.target.value; save(); }
  else if (id === 'rateSel') { ST.settings.rate = +e.target.value; save(); }
  else if (id === 'optRec' || id === 'setRec') { ST.settings.record = e.target.checked; save(); }
  else if (id === 'setHints') { ST.settings.hints = e.target.checked; save(); }
  else if (id === 'setSem') { ST.settings.semantic = e.target.checked; save(); if (e.target.checked) ensureEmb().then(() => { const s = $('#semState'); if (s) s.textContent = EMB.state === 'ready' ? '語意模型已就緒' : '語意模型無法載入，改用關鍵字比對'; }); }
  else if (id === 'aiProv') { $('#aiBaseWrap').hidden = e.target.value === 'gemini'; }
  else if (id === 'importFile') { const f = e.target.files[0]; if (!f) return; f.text().then(t => { const j = JSON.parse(t); if (j && j.concepts) { Object.assign(ST, j); save(); renderProgress(); toast('已匯入'); } }).catch(() => toast('檔案格式不對')); }
});
$('#lightbox').addEventListener('click', () => $('#lightbox').hidden = true);
async function cacheAudio() {
  const st = $('#offState'); if (!('caches' in window)) { st.textContent = '這個瀏覽器不支援離線快取'; return; }
  const v = ST.settings.voice, files = [...new Set(Object.values(MAN).map(m => `audio/${v}/${m[0]}.mp3`))];
  const cache = await caches.open('gcbme-self-audio-v1'); let n = 0;
  for (let i = 0; i < files.length; i += 8) { await Promise.all(files.slice(i, i + 8).map(async f => { try { if (!(await cache.match(f))) await cache.add(f); } catch (e) { } n++; })); st.textContent = `${n}/${files.length}`; }
  st.textContent = `完成：${files.length} 個音檔已存在這台裝置（${v === 'heart' ? '女聲' : '男聲'}）`;
}

/* ---------------- boot ---------------- */
async function boot() {
  $('#voiceSel').value = ST.settings.voice; $('#rateSel').value = String(ST.settings.rate);
  const [d, m] = await Promise.all([fetch('data.json?v=1').then(r => r.json()), fetch('audio/manifest.json?v=1').then(r => r.json()).catch(() => ({}))]);
  D = d; MAN = m; renderList();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__sp = { D, ST, P, analyze: doAnalyze, open: openConcept, inject: async (text, seconds, chunks) => { if (P.step === 'A') { P.step = 'B'; renderPractice(); } await doAnalyze({ text, seconds, chunks }); return P.result; }, coachPrompt, showTab, drawFree };
  document.body.dataset.ready = '1';
}
boot().catch(e => { console.error(e); $('#tab-list').innerHTML = `<div class="card">載入失敗：${esc(e.message)}</div>`; });
})();
