/* serve.js - the local file server render.js uses.  Serves files under a root folder, and answers byte ranges so <video> and <audio> can seek.
   Text is declared UTF-8: without that, Chrome reads a page that has no <meta charset> as windows-1252 over HTTP (but as UTF-8 from disk). */
const fs = require('fs'), path = require('path');
const MIME = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.gif': 'image/gif',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg' };

// One file, honouring a single "Range: bytes=a-b" request.  Chrome only seeks a <video> whose server answers ranges with 206.
const serveFile = (q, r, p) => fs.stat(p, (e, st) => {
  if (e || !st.isFile()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', MIME[path.extname(p)] || 'application/octet-stream'); r.setHeader('accept-ranges', 'bytes');
  const m = /^bytes=(\d*)-(\d*)$/.exec(q.headers.range || '');
  if (!m || (m[1] === '' && m[2] === '')) { r.setHeader('content-length', st.size); return fs.createReadStream(p).pipe(r); }
  const a = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]), z = m[1] === '' || m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
  if (a > z) { r.statusCode = 416; r.setHeader('content-range', `bytes */${st.size}`); return r.end(); }
  r.statusCode = 206; r.setHeader('content-range', `bytes ${a}-${z}/${st.size}`); r.setHeader('content-length', z - a + 1);
  fs.createReadStream(p, { start: a, end: z }).pipe(r);
});

// Request handler for http.createServer: the URL path is a file under root; anything resolving outside root is refused.
// root is normalised first, and the check includes the separator, so neither "D:/x" against "D:\x" nor a sibling folder "root-other" slips through.
const handler = root => {
  const base = path.resolve(root);
  return (q, r) => {
    let p = path.join(base, decodeURIComponent(q.url.split('?')[0])); if (p !== base && !p.startsWith(base + path.sep)) { r.statusCode = 403; return r.end(); } if (p.endsWith(path.sep) || p === base) p = path.join(p, 'index.html');
    serveFile(q, r, p);
  };
};

module.exports = { MIME, handler };
