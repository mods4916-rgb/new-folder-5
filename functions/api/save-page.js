function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export const onRequestPost = async ({ request, env }) => {
  // Server-side saving disabled: return explicit 405 and no DB usage.
  return json(
    { ok: false, error: 'Server save disabled; edits should be applied in the frontend and deployed via git.' },
    405,
    { 'Allow': 'GET' }
  );
};
