export const onRequest = async ({ request, env }) => {
  try {
    const sid = getSidFromRequest(request) || getSidFromAuthHeader(request);
    if (!sid) return json({ ok: false, error: 'Unauthorized' }, 401);

    if (!env.DB || !env.DB.prepare) return json({ ok: false, error: 'DB not configured' }, 500);
    await env.DB
      .prepare(
        'CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, user TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL)'
      )
      .run();
    const now = Date.now();
    const row = await env.DB
      .prepare('SELECT sid FROM sessions WHERE sid = ? AND expiresAt > ?')
      .bind(sid, now)
      .first();
    if (!row) return json({ ok: false, error: 'Unauthorized' }, 401);

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
};

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
