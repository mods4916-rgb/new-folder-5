// Server-side content API disabled: frontend stores changes locally.
// GET returns empty data so pages can proceed without errors.
export const onRequestGet = async () => {
  return new Response(JSON.stringify({ ok: true, data: {}, note: 'Server content disabled' }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    status: 200,
  });
};

// POST is disabled to avoid any server writes; admin edits should be saved on the client only.
export const onRequestPost = async () => {
  return new Response(JSON.stringify({ ok: false, error: 'Content save disabled; use frontend storage' }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status: 405,
  });
};
