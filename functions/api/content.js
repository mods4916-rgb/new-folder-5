export const onRequestGet = async ({ env, request }) => {
  try {
    if (!env.DB || !env.DB.prepare) throw new Error('D1 DB not bound');
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS content (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
    ).run();

    const { results } = await env.DB.prepare('SELECT k, v FROM content').all();
    const data = {};
    for (const row of results || []) data[row.k] = row.v;
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
      status: 200,
    });
  } catch (e) {
    console.error('content GET error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: 'Content fetch error', detail: String(e) }),
      { headers: { 'content-type': 'application/json' }, status: 500 }
    );
  }
};

async function requireSession(env, request) {
  // Accept cookie or Bearer token
  const cookie = request.headers.get('cookie') || '';
  const auth = request.headers.get('authorization') || '';
  const sidCookie = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  const sidHeader = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const sid = sidHeader || (sidCookie ? decodeURIComponent(sidCookie[1]) : '');
  if (!sid) return false;

  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, user TEXT, createdAt INTEGER, expiresAt INTEGER)'
    ).run();
    const now = Date.now();
    const row = await env.DB
      .prepare('SELECT sid FROM sessions WHERE sid = ? AND expiresAt > ?')
      .bind(sid, now)
      .first();
    return !!row;
  } catch (e) {
    console.error('content requireSession error:', e);
    return false;
  }
}

export const onRequestPost = async ({ env, request }) => {
  try {
    if (!env.DB || !env.DB.prepare) throw new Error('D1 DB not bound');

    const ok = await requireSession(env, request);
    if (!ok) return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });

    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS content (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
    ).run();

    const body = await request.json().catch(() => ({}));
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    if (!updates.length) {
      return new Response(JSON.stringify({ ok: false, error: 'No updates provided' }), { status: 400 });
    }

    const stmt = env.DB.prepare('INSERT OR REPLACE INTO content (k, v) VALUES (?, ?)');
    for (const item of updates) {
      const k = String(item?.k || '').trim();
      const v = String(item?.v ?? '');
      if (!k) continue;
      await stmt.bind(k, v).run();
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error('content POST error:', e);
    // DB errors are server errors, not auth errors
    return new Response(JSON.stringify({ ok: false, error: 'Content save error', detail: String(e) }), { status: 500 });
  }
};
