export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const { username = '', password = '' } = body || {};
  const u = String(username).trim();
  const p = String(password);

  const ADMIN_USER = env.ADMIN_USER || 'sagar';
  const ADMIN_PASS = env.ADMIN_PASS || 'sagar12390';

  if (u !== ADMIN_USER || p !== ADMIN_PASS) {
    return json({ ok: false, error: 'Invalid credentials' }, 401);
  }

  // Stateless signed token with TTL (7 days)
  const ttlSeconds = 7 * 24 * 60 * 60;
  const now = Date.now();
  const payload = {
    u,
    iat: now,
    exp: now + ttlSeconds * 1000,
    jti: crypto.randomUUID(),
  };
  const secret = env.SESSION_SECRET || ADMIN_PASS || 'change-me-secret';
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = await hmacSign(payloadB64, secret);
  const token = `${payloadB64}.${sig}`;

  // Cookie: same-origin -> SameSite=Lax; Secure required on HTTPS (Pages is HTTPS)
  const cookie = `sid=${token}; HttpOnly; Path=/; Max-Age=${ttlSeconds}; SameSite=Lax; Secure`;

  return json({ ok: true, token }, 200, { 'Set-Cookie': cookie });
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function base64url(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob(b64 + pad);
  return decodeURIComponent(escape(s));
}

async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sigBuf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
