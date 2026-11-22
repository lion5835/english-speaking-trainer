const V = 'gcbme-self-v1';
const FILES = ['./', 'index.html', 'style.css?v=1', 'analyze.js?v=1', 'app.js?v=1', 'data.json?v=1', 'audio/manifest.json?v=1', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gcbme-self-v') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/audio/') && u.pathname.endsWith('.mp3')) { e.respondWith(audioResp(e.request)); return; }
  if (u.pathname.includes('/slides/')) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(V).then(ca => ca.put(e.request, c)); return res; }))); return; }
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(ca => ca.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match(e.request, { ignoreSearch: true }))));
});
async function audioResp(req) {
  let hit = null; try { hit = await (await caches.open('gcbme-self-audio-v1')).match(req.url); } catch (e) { }
  if (!hit) return fetch(req);
  const range = req.headers.get('range'); if (!range) return hit;
  const buf = await hit.arrayBuffer(), n = buf.byteLength, m = /bytes=(\d*)-(\d*)/.exec(range); let a = 0, b = n - 1;
  if (m) { if (m[1] !== '') a = +m[1]; if (m[2] !== '') b = Math.min(+m[2], n - 1); if (m[1] === '' && m[2] !== '') { a = Math.max(0, n - +m[2]); b = n - 1; } }
  if (a >= n) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + n } });
  return new Response(buf.slice(a, b + 1), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${a}-${b}/${n}`, 'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
}
