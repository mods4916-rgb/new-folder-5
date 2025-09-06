function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function getSidFromCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function getSidFromAuthHeader(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export const onRequestPost = async ({ request, env }) => {
  // Auth check using D1 (same as other endpoints)
  const sid = getSidFromCookie(request) || getSidFromAuthHeader(request);
  if (!sid) return json({ ok: false, error: 'Unauthorized' }, 401);
  try {
    if (!env.DB || !env.DB.prepare) return json({ ok: false, error: 'DB not configured' }, 500);
    // Use prepare().run() for compatibility with local/Pages D1 (no multi-statement exec)
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, user TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL);').run();
    const now = Date.now();
    const row = await env.DB
      .prepare('SELECT sid FROM sessions WHERE sid = ? AND expiresAt > ?')
      .bind(sid, now)
      .first();
    if (!row) return json({ ok: false, error: 'Unauthorized' }, 401);
  } catch (e) {
    // Surface DB errors as 500 to avoid confusing redirect loops in admin.html
    return json({ ok: false, error: 'Session check failed', detail: String(e) }, 500);
  }

  // Cloudflare Pages cannot write to static files at runtime.
  // Keep endpoint to avoid 404 in existing admin.html, but return 501.
  return json({ ok: false, error: 'Saving static HTML is not supported on Cloudflare Pages at runtime. Use chart editing (POST /api/chart) or redeploy files.' }, 501);
};
