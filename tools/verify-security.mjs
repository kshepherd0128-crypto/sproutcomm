// Family isolation: a parent session is pinned to the family behind its token.
const BASE = process.env.BASE_URL || 'http://localhost:8787';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function login(role, body) {
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, ...body })
  });
  return { status: res.status, data: await res.json() };
}

const adv = await login('advocate', { passcode: '1111' });
const families = await (await fetch(`${BASE}/api/families`, {
  headers: { authorization: `Bearer ${adv.data.token}` }
})).json();

const a = families.families.find((f) => f.home_language === 'ar');
const b = families.families.find((f) => f.home_language === 'bn');
check('advocate sees family links', Boolean(a.access_path), a.access_path);

const tokenOf = (f) => f.access_path.split('/f/')[1];
const pa = await login('parent', { token: tokenOf(a) });
check('parent session starts from a token', pa.status === 200 && pa.data.family.id === a.id);

const auth = { authorization: `Bearer ${pa.data.token}` };
const feed = await (await fetch(`${BASE}/api/parent/feed`, { headers: auth })).json();
check('feed is pinned to the token family', feed.family.id === a.id, feed.family.family_name);
check('feed carries no access token', !JSON.stringify(feed).includes(tokenOf(a)));

for (const [name, path, init] of [
  ['parent cannot list families', '/api/families', {}],
  ['parent cannot read another family file', `/api/families/${b.id}`, {}],
  ['parent cannot read its own file as advocate', `/api/families/${a.id}`, {}],
  ['parent cannot send messages', '/api/messages', { method: 'POST', body: '{}' }],
  ['advocate cannot open the parent feed', '/api/parent/feed', {}]
]) {
  const token = name.startsWith('advocate') ? adv.data.token : pa.data.token;
  const res = await fetch(BASE + path, {
    method: init.method || 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body
  });
  check(name, res.status === 403, `status ${res.status}`);
}

const noAuth = await fetch(`${BASE}/api/parent/feed`);
check('no session gets nothing', noAuth.status === 401, `status ${noAuth.status}`);
const badToken = await login('parent', { token: 'x'.repeat(32) });
check('guessed token is rejected', badToken.status === 401, `status ${badToken.status}`);

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
if (failures.length) process.exitCode = 1;
