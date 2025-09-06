export const onRequestGet = async ({ env }) => {
  const hasDB = !!env.DB;
  const hasPrepare = !!(env.DB && env.DB.prepare);
  const info = {
    ok: true,
    d1_bound: hasDB,
    d1_has_prepare: hasPrepare,
    env_keys_sample: Object.keys(env || {}).slice(0, 20),
  };
  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
