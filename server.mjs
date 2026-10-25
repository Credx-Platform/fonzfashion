import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.mesh':'application/octet-stream'};
const publicFiles = new Set(['/index.html','/viewer.js','/cart.js','/cart.css']);
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD'}).end(); return; }
  let url;
  try { url = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (url === '/health') { res.writeHead(200,{'Content-Type':'application/json'}).end(req.method === 'HEAD' ? '' : '{"status":"ok","commerce":"not_connected"}'); return; }
  if (url === '/') url = '/index.html';
  if (!publicFiles.has(url) && !/^\/assets\/[a-z0-9-]+\.(webp|mesh)$/.test(url)) { res.writeHead(404).end(); return; }
  try {
    const content = await readFile(path.join(root,url));
    res.writeHead(200,{'Content-Type':types[path.extname(url)] || 'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404).end(); }
}).listen(Number(process.env.PORT || 3000),'0.0.0.0');
