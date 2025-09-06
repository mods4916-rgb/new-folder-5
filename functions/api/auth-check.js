export const onRequest = async ({ request, env }) => {
  try {
    const token = getSidFromRequest(request) || getSidFromAuthHeader(request);
    if (!token) return json({ ok: false, error: 'Unauthorized' }, 401);

    const secret = env.SESSION_SECRET || env.ADMIN_PASS || 'change-me-secret';
    const ok = await verifyToken(token, secret);
    if (!ok) return json({ ok: false, error: 'Unauthorized' }, 401);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
};

async function verifyToken(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expected = await hmacSign(payloadB64, secret);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const payloadStr = fromBase64url(payloadB64);
    const payload = JSON.parse(payloadStr);
    if (!payload || typeof payload !== 'object') return false;
    if (!payload.exp || Date.now() > Number(payload.exp)) return false;
    return true;
  } catch {
    return false;
  }
}

function getSidFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function getSidFromAuthHeader(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

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

function timingSafeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let out = 0;
  for (let i = 0; i < sa.length; i++) out |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return out === 0;
}
