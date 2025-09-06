function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
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

function normalizeGame(game) {
  return String(game || 'game').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

function normalizeYear(year) {
  const y = String(year || '').replace(/[^0-9]/g, '').slice(0, 4);
  if (y) return y;
  try { return String(new Date().getFullYear()); } catch { return '2025'; }
}

export const onRequestGet = async ({ request, env }) => {
  // Read endpoint disabled: no data served from API anymore
  try {
    return json({ ok: false, error: 'Read API disabled' }, 410, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return json({ ok: false, error: 'Read API disabled' }, 410, { 'Cache-Control': 'no-store' });
  }
};

export const onRequestPost = async ({ request, env }) => {
  // Write endpoint disabled: reject all attempts to store chart data from the frontend.
  try {
    return json({ ok: false, error: 'Write API disabled' }, 405, { 'Allow': 'GET' });
  } catch (e) {
    return json({ ok: false, error: 'Write API disabled' }, 405, { 'Allow': 'GET' });
  }
};
