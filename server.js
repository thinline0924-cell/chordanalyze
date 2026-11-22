/* =========================================================
   CHORD NOTE のサーバー
   - サイトのファイル(index.html・style.css・js/)を配る
   - /api/import?url=… で U-FRET / ChordWiki の曲のページを読み、コードだけを返す(歌詞は返さない)
   追加のパッケージは使わない(Node.js 20 以上の標準機能だけ)。起動:node server.js
   ========================================================= */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { checkUrl, parsePage } = require('./lib/parse.js');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const LIMIT = { count: 30, windowMs: 10 * 60 * 1000 };  // 読み込みは 10分に30回まで(1つの IP あたり)
const CACHE_MS = 60 * 60 * 1000;                         // 同じ曲は1時間覚えておき、相手のサイトに何度も取りに行かない
const MAX_BYTES = 4 * 1024 * 1024;

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const PUBLIC = /^\/(index\.html|style\.css|js\/[a-z0-9_-]+\.js)$/i;   // 配ってよいファイルだけ

const hits = new Map();   // IP → [時刻, …]
const cache = new Map();  // URL → { at, data }

function clientIp(req) {
  // Render などのプロキシの後ろでは、元の IP は X-Forwarded-For の先頭に入る
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket.remoteAddress || '';
}
function allow(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < LIMIT.windowMs);
  if (list.length >= LIMIT.count) { hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < LIMIT.windowMs)) hits.delete(k);
  return true;
}
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChordNote/1.0)', 'Accept-Language': 'ja' } });
    if (r.status === 404) { const e = new Error('曲のページが見つかりませんでした(URL を確かめてください)。'); e.user = true; throw e; }
    if (!r.ok) throw new Error('status ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('too large');
    return buf.toString('utf8');
  } finally { clearTimeout(timer); }
}

async function handleImport(req, res, q) {
  if (!allow(clientIp(req))) return send(res, 429, { error: '短い時間に読み込みすぎました。10分ほど待ってから、もう一度試してください。' });
  let target;
  try { target = checkUrl(q.get('url')); } catch (e) { return send(res, 400, { error: e.message }); }
  const hit = cache.get(target.url);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.data);
  try {
    const html = await fetchPage(target.url);
    const song = parsePage(target.kind, html);
    const data = { source: target.kind, url: target.url, ...song };
    cache.set(target.url, { at: Date.now(), data });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    send(res, 200, data);
  } catch (e) {
    if (e.user) return send(res, 422, { error: e.message });
    console.error('import failed', target.url, e.message);
    send(res, 502, { error: '曲のページを読み込めませんでした。相手のサイトが混んでいるか、つながりにくい状態です。少し待ってから、もう一度試してください。' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'GET だけ使えます' });
    if (u.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain; charset=utf-8');
    if (u.pathname === '/api/import') return handleImport(req, res, u.searchParams);
    const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    if (!PUBLIC.test(p)) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    fs.readFile(path.join(ROOT, p), (err, buf) => {
      if (err) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
      send(res, 200, buf, TYPES[path.extname(p)] || 'application/octet-stream');
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'サーバーで問題が起きました。' });
  }
});
server.listen(PORT, () => console.log('CHORD NOTE: http://localhost:' + PORT));
