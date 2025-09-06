// High-performance static file server with caching and compression
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_DIR = path.resolve(__dirname);

// Simple in-memory auth/session
const ADMIN_USER = process.env.ADMIN_USER || 'sagar';
const ADMIN_PASS = process.env.ADMIN_PASS || 'sagar12390';
const sessions = new Map(); // sid -> { user, createdAt }
function makeToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
function setSessionCookie(res, sid) {
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; Max-Age=${maxAge}`);
}
function parseCookies(req) {
  const hdr = req.headers['cookie'] || '';
  const out = {};
  hdr.split(/;\s*/).forEach(kv => {
    const i = kv.indexOf('=');
    if (i > -1) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  return out;
}
function isAuthed(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || '';
  return sid && sessions.has(sid);
}
function ok(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(Object.assign({ ok: true }, obj || {})));
}
function fail(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: msg || 'Error' }));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    const lenLimit = 2 * 1024 * 1024; // 2MB
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > lenLimit) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Basic CORS utilities (reflect origin and allow credentials)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '';
function setCors(req, res) {
  const origin = req.headers.origin || '';
  // If FRONTEND_ORIGIN is configured, prefer that. Otherwise, reflect request Origin.
  const allowOrigin = FRONTEND_ORIGIN || origin;
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

// File cache for better performance
const fileCache = new Map();
const CACHE_MAX_SIZE = 50; // Max files to cache
const CACHE_MAX_FILE_SIZE = 100 * 1024; // 100KB max file size to cache

// Optimized MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Check if client accepts gzip
function acceptsGzip(req) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  return acceptEncoding.includes('gzip');
}

// Serve file with caching and compression
function serveFile(filePath, req, res) {
  const mimeType = getMimeType(filePath);
  const useGzip = acceptsGzip(req) && (mimeType.includes('text') || mimeType.includes('javascript') || mimeType.includes('json'));
  
  // Check cache first
  const cacheKey = filePath + (useGzip ? '_gzip' : '');
  if (fileCache.has(cacheKey)) {
    const cached = fileCache.get(cacheKey);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600',
      'ETag': cached.etag,
      ...(useGzip && { 'Content-Encoding': 'gzip' })
    });
    res.end(cached.data);
    return;
  }
  
  // Read and potentially cache file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    
    const etag = `"${Date.now()}-${data.length}"`;
    
    // Check if client has current version
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }
    
    function sendResponse(finalData, isCompressed = false) {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
        'ETag': etag,
        'Content-Length': finalData.length,
        ...(isCompressed && { 'Content-Encoding': 'gzip' })
      });
      res.end(finalData);
      
      // Cache small files
      if (data.length <= CACHE_MAX_FILE_SIZE && fileCache.size < CACHE_MAX_SIZE) {
        fileCache.set(cacheKey, { data: finalData, etag });
      }
    }
    
    if (useGzip) {
      zlib.gzip(data, (err, compressed) => {
        if (err) {
          sendResponse(data);
        } else {
          sendResponse(compressed, true);
        }
      });
    } else {
      sendResponse(data);
    }
  });
}

// Main server
const server = http.createServer((req, res) => {
  const start = Date.now();
  const parsed = url.parse(req.url, true);
  let pathname = parsed.pathname;
  // Always apply CORS headers first
  setCors(req, res);

  // Handle CORS preflight globally
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Handle common routes
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/*w') pathname = '/uploads/wait.gif';
  if (pathname === '/favicon.ico') {
    // Quick favicon response
    res.writeHead(204);
    res.end();
    return;
  }
  
  // API routes
  if (pathname === '/api/login' && req.method === 'POST') {
    (async () => {
      try {
        const body = await readJson(req);
        const u = String(body.username || '').trim();
        const p = String(body.password || '');
        if (u === ADMIN_USER && p === ADMIN_PASS) {
          const sid = makeToken();
          sessions.set(sid, { user: u, createdAt: Date.now() });
          setSessionCookie(res, sid);
          ok(res, { token: sid });
        } else {
          fail(res, 401, 'Invalid credentials');
        }
      } catch (e) {
        fail(res, 400, 'Bad Request');
      }
    })();
    return;
  }

  if (pathname === '/api/auth-check') {
    if (isAuthed(req)) return ok(res);
    return fail(res, 401, 'Unauthorized');
  }

  if (pathname === '/api/save-page' && req.method === 'POST') {
    if (!isAuthed(req)) { return fail(res, 401, 'Unauthorized'); }
    (async () => {
      try {
        const body = await readJson(req);
        let rel = String(body.path || '').replace(/^[\\/]+/, '');
        if (!rel || !/\.html$/i.test(rel)) return fail(res, 400, 'Only .html files are allowed');
        const full = path.resolve(BASE_DIR, rel);
        if (!full.startsWith(BASE_DIR)) return fail(res, 400, 'Invalid path');
        const html = String(body.html || '');
        fs.writeFile(full, html, 'utf8', (err) => {
          if (err) return fail(res, 500, 'Failed to save');
          ok(res);
        });
      } catch (e) {
        fail(res, 400, 'Bad Request');
      }
    })();
    return;
  }

  if (pathname === '/api/chart') {
    const game = String((parsed.query.game || 'game')).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const year = String(parsed.query.year || '').replace(/[^0-9]/g, '').slice(0, 4) || String(new Date().getFullYear());
    const dir = path.join(BASE_DIR, 'data', 'chart', game);
    const file = path.join(dir, `${year}.json`);

    if (req.method === 'GET') {
      fs.readFile(file, 'utf8', (err, data) => {
        if (err) {
          return ok(res, { data: {} });
        }
        try {
          const json = JSON.parse(data || '{}');
          ok(res, { data: json });
        } catch {
          ok(res, { data: {} });
        }
      });
      return;
    }
    if (req.method === 'POST') {
      if (!isAuthed(req)) { return fail(res, 401, 'Unauthorized'); }
      (async () => {
        try {
          const body = await readJson(req);
          const key = String(body.key || ''); // DD-MM
          const value = String(body.value == null ? '' : body.value);
          fs.mkdir(dir, { recursive: true }, (mkErr) => {
            if (mkErr) return fail(res, 500, 'Failed to save');
            fs.readFile(file, 'utf8', (rErr, content) => {
              let obj = {};
              try { obj = JSON.parse(content || '{}'); } catch {}
              if (!key) return fail(res, 400, 'Missing key');
              if (value === '' || value === '-') delete obj[key]; else obj[key] = value;
              fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8', (wErr) => {
                if (wErr) return fail(res, 500, 'Failed to save');
                ok(res);
              });
            });
          });
        } catch (e) {
          fail(res, 400, 'Bad Request');
        }
      })();
      return;
    }
    // Method not allowed
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const filePath = path.join(BASE_DIR, pathname);
  
  // Security check
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Fast file existence check
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // Quick 404 response
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html><head><title>404 Not Found</title>
        <style>body{font-family:Arial;text-align:center;padding:50px}h1{color:#e74c3c}</style>
        </head><body>
        <h1>404 - Not Found</h1>
        <p>File not found: ${pathname}</p>
        <a href="/">← Go Home</a>
        </body></html>
      `);
      return;
    }
    
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      
      serveFile(filePath, req, res);
      
      // Log response time for monitoring
      const duration = Date.now() - start;
      if (duration > 100) {
        console.log(`⚠️  Slow response: ${pathname} took ${duration}ms`);
      }
    });
  });
});

// Optimize server settings
server.timeout = 30000; // 30 second timeout
server.keepAliveTimeout = 5000; // 5 second keep-alive
server.headersTimeout = 6000; // 6 second headers timeout

server.listen(PORT, () => {
  console.log(`🚀 Optimized server running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${BASE_DIR}`);
  console.log(`⚡ Features: Caching, Compression, Fast responses`);
  console.log(`💡 Press Ctrl+C to stop`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Try a different port.`);
  } else {
    console.error('❌ Server error:', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Server shutting down...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
