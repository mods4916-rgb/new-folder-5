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

  // Create session in D1 with TTL (7 days)
  const sid = crypto.randomUUID();
  const ttlSeconds = 7 * 24 * 60 * 60;
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  try {
    if (!env.DB || !env.DB.prepare) throw new Error('D1 DB not bound');
    // Ensure table exists (use prepare().run() for local D1 compatibility)
    await env.DB
      .prepare(
        'CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, user TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL)'
      )
      .run();
    await env.DB.prepare(
      'INSERT INTO sessions (sid, user, createdAt, expiresAt) VALUES (?, ?, ?, ?)'
    ).bind(sid, u, now, expiresAt).run();
  } catch (e) {
    // Log and surface the error message to aid debugging in dev
    console.error('Login session store error:', e && (e.stack || e.message || e));
    return json({ ok: false, error: 'Session store error', detail: String(e && (e.message || e)) }, 500);
  }

  // Cookie: same-origin -> SameSite=Lax; Secure required on HTTPS (Pages is HTTPS)
  const cookie = `sid=${sid}; HttpOnly; Path=/; Max-Age=${ttlSeconds}; SameSite=Lax; Secure`;

  return json({ ok: true, token: sid }, 200, { 'Set-Cookie': cookie });
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
