/**
 * Auth Backend - Full Endpoint Test Script
 * Run: node test-endpoints.js
 */

const BASE = 'http://localhost:4000/api/v1';
let accessToken = '';
let refreshToken = '';
let csrfToken = '';

const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' };
const pass = (label) => console.log(`${colors.green}  âœ“ PASS${colors.reset} ${label}`);
const fail = (label, err) => console.log(`${colors.red}  âœ— FAIL${colors.reset} ${label}: ${err}`);
const section = (title) => console.log(`\n${colors.cyan}â”€â”€ ${title} â”€â”€${colors.reset}`);

/**
 * The API wraps all responses in { success, data, errors, ... }.
 * This helper returns the unwrapped data/body.
 */
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (csrfToken && method !== 'GET') headers['x-csrf-token'] = csrfToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // Capture new CSRF token if server sends one
  const newCsrf = res.headers.get('x-csrf-token');
  if (newCsrf) csrfToken = newCsrf;
  let json;
  try { json = await res.json(); } catch { json = {}; }
  // Unwrap `data` field if present
  const unwrapped = json.data !== undefined ? json.data : json;
  return { status: res.status, body: unwrapped, raw: json };
}

async function run() {
  console.log(`${colors.cyan}Auth Backend Endpoint Tests${colors.reset}`);
  console.log(`Base URL: ${BASE}\n`);

  // â”€â”€ Health (also fetches CSRF token) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Health');
  try {
    const r = await req('GET', '/health');
    r.status === 200 ? pass('GET /health (CSRF token obtained)') : fail('GET /health', `${r.status}`);
  } catch (e) { fail('GET /health', e.message); }

  // â”€â”€ Register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Register');
  const registerEmail = `test_${Date.now()}@example.com`;
  try {
    const r = await req('POST', '/auth/register', { firstName: 'Test', lastName: 'User', email: registerEmail, password: 'Test@1234!' });
    if ((r.status === 200 || r.status === 201) && r.body.accessToken) {
      pass(`POST /auth/register â†’ ${r.status}`);
      accessToken = r.body.accessToken;
      refreshToken = r.body.refreshToken;
    } else {
      fail('POST /auth/register', `${r.status} ${JSON.stringify(r.body).substring(0, 100)}`);
    }
  } catch (e) { fail('POST /auth/register', e.message); }

  // Duplicate email should 409
  const dupEmail = `dup_${Date.now()}@example.com`;
  try {
    await req('POST', '/auth/register', { firstName: 'A', lastName: 'B', email: dupEmail, password: 'Test@1234!' });
    const r2 = await req('POST', '/auth/register', { firstName: 'A', lastName: 'B', email: dupEmail, password: 'Test@1234!' });
    r2.status === 409 ? pass('POST /auth/register duplicate â†’ 409') : fail('duplicate â†’ should 409', `got ${r2.status}`);
  } catch (e) { fail('POST /auth/register duplicate', e.message); }

  // Weak password should 400
  try {
    const r = await req('POST', '/auth/register', { firstName: 'T', lastName: 'U', email: `weak_${Date.now()}@test.com`, password: '123' });
    r.status === 400 ? pass('POST /auth/register weak password â†’ 400') : fail('weak pw â†’ should 400', `got ${r.status}`);
  } catch (e) { fail('POST /auth/register weak pw', e.message); }

  // â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Login');
  const loginEmail = `login_${Date.now()}@example.com`;
  const loginPass = 'Login@1234!';
  try {
    // Register fresh user
    const reg = await req('POST', '/auth/register', { firstName: 'Login', lastName: 'User', email: loginEmail, password: loginPass });
    if ((reg.status === 200 || reg.status === 201) && reg.body.accessToken) {
      // Login with correct credentials
      const r = await req('POST', '/auth/login', { email: loginEmail, password: loginPass });
      if (r.status === 200 && r.body.accessToken) {
        pass(`POST /auth/login â†’ 200`);
        accessToken = r.body.accessToken;
        refreshToken = r.body.refreshToken;
      } else {
        fail('POST /auth/login', `${r.status} ${JSON.stringify(r.body).substring(0, 100)}`);
      }
    }
  } catch (e) { fail('POST /auth/login', e.message); }

  try {
    const r = await req('POST', '/auth/login', { email: loginEmail, password: 'WrongPass1!' });
    r.status === 401 ? pass('POST /auth/login wrong pw â†’ 401') : fail('login wrong pw', `got ${r.status}`);
  } catch (e) { fail('POST /auth/login wrong pw', e.message); }

  try {
    const r = await req('POST', '/auth/login', { email: 'nobody@nowhere.com', password: 'Test@1234!' });
    (r.status === 401 || r.status === 403) ? pass(`POST /auth/login unknown user → ${r.status}`) : fail('login unknown', `got ${r.status}`);
  } catch (e) { fail('POST /auth/login unknown', e.message); }

  // â”€â”€ Current User â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Current User');
  try {
    const r = await req('GET', '/users/me', null, accessToken);
    r.status === 200 && r.body.email ? pass(`GET /users/me â†’ 200 (${r.body.email})`) : fail('GET /users/me', `${r.status} ${JSON.stringify(r.body).substring(0,80)}`);
  } catch (e) { fail('GET /users/me', e.message); }

  // â”€â”€ Refresh Token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Refresh Token');
  try {
    const r = await req('POST', '/auth/refresh-token', { refreshToken });
    if (r.status === 200 && r.body.accessToken) {
      pass('POST /auth/refresh-token â†’ 200 (token rotated)');
      accessToken = r.body.accessToken;
      refreshToken = r.body.refreshToken;
    } else {
      fail('POST /auth/refresh-token', `${r.status} ${JSON.stringify(r.body).substring(0,100)}`);
    }
  } catch (e) { fail('POST /auth/refresh-token', e.message); }

  try {
    const r = await req('POST', '/auth/refresh-token', { refreshToken: 'invalid-token-xyz' });
    r.status === 401 ? pass('POST /auth/refresh-token invalid â†’ 401') : fail('refresh invalid', `got ${r.status}`);
  } catch (e) { fail('POST /auth/refresh-token invalid', e.message); }

  // â”€â”€ Auth Guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Auth Guard');
  try {
    const r = await req('POST', '/auth/logout', { refreshToken: 'x' });
    r.status === 401 ? pass('POST /auth/logout without token â†’ 401') : fail('logout no auth', `got ${r.status}`);
  } catch (e) { fail('POST /auth/logout no auth', e.message); }

  // â”€â”€ Forgot / Reset Password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Forgot / Reset Password');
  try {
    const r = await req('POST', '/auth/forgot-password', { email: loginEmail });
    r.status === 200 ? pass('POST /auth/forgot-password â†’ 200') : fail('/auth/forgot-password', `${r.status}`);
  } catch (e) { fail('/auth/forgot-password', e.message); }

  try {
    const r = await req('POST', '/auth/forgot-password', { email: 'nobody@nowhere.com' });
    (r.status === 200 || r.status === 403) ? pass(`POST /auth/forgot-password unknown → ${r.status}`) : fail('forgot anti-enum', `got ${r.status}`);
  } catch (e) { fail('forgot anti-enum', e.message); }

  try {
    const r = await req('POST', '/auth/reset-password', { token: 'bad-token', newPassword: 'NewPass@1234!' });
    (r.status === 400 || r.status === 403) ? pass(`POST /auth/reset-password bad token → ${r.status}`) : fail('reset bad token', `got ${r.status}`);
  } catch (e) { fail('reset bad token', e.message); }

  // â”€â”€ Change Password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Change Password');
  try {
    const r = await req('POST', '/auth/change-password', { currentPassword: loginPass, newPassword: 'NewPass@1234!' }, accessToken);
    if (r.status === 200 || r.status === 201) {
      pass('POST /auth/change-password â†’ 200');
      // Re-login with new password
      const rl = await req('POST', '/auth/login', { email: loginEmail, password: 'NewPass@1234!' });
      if (rl.status === 200) { accessToken = rl.body.accessToken; refreshToken = rl.body.refreshToken; }
    } else {
      fail('POST /auth/change-password', `${r.status} ${JSON.stringify(r.body).substring(0,80)}`);
    }
  } catch (e) { fail('POST /auth/change-password', e.message); }

  try {
    const r = await req('POST', '/auth/change-password', { currentPassword: 'WrongOld@1!', newPassword: 'Another@1234!' }, accessToken);
    r.status === 400 ? pass('POST /auth/change-password wrong current â†’ 400') : fail('change pw wrong cur', `got ${r.status}`);
  } catch (e) { fail('change pw wrong cur', e.message); }

  // â”€â”€ MFA Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('MFA');
  try {
    const r = await req('POST', '/auth/mfa/setup', null, accessToken);
    if ((r.status === 200 || r.status === 201) && r.body && r.body.secret) {
      pass(`POST /auth/mfa/setup → ${r.status} (secret: ${r.body.secret.substring(0, 8)}...)`);
    } else {
      fail('POST /auth/mfa/setup', `${r.status} ${JSON.stringify(r.body).substring(0,80)}`);
    }
  } catch (e) { fail('POST /auth/mfa/setup', e.message); }

  try {
    const r = await req('POST', '/auth/mfa/verify', { code: '000000' }, accessToken);
    r.status === 400 ? pass('POST /auth/mfa/verify invalid code â†’ 400') : fail('mfa verify bad', `got ${r.status}`);
  } catch (e) { fail('POST /auth/mfa/verify invalid', e.message); }

  // â”€â”€ Email Verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Email Verification');
  try {
    const r = await req('GET', '/auth/verify-email?token=badtoken123');
    (r.status === 400 || r.status === 403) ? pass(`GET /auth/verify-email invalid token → ${r.status}`) : fail('verify-email bad token', `got ${r.status}`);
  } catch (e) { fail('verify-email bad token', e.message); }

  try {
    const r = await req('POST', '/auth/resend-verification', { email: loginEmail });
    (r.status === 200 || r.status === 201) ? pass(`POST /auth/resend-verification â†’ ${r.status}`) : fail('resend-verification', `${r.status}`);
  } catch (e) { fail('POST /auth/resend-verification', e.message); }

  // â”€â”€ Sessions / Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Sessions & Logout');
  try {
    const r = await req('POST', '/auth/logout/session/nonexistent-session-id', null, accessToken);
    r.status === 404 ? pass('POST /auth/logout/session/:id bad id â†’ 404') : fail('logout session bad id', `got ${r.status}`);
  } catch (e) { fail('logout session bad id', e.message); }

  try {
    const r = await req('POST', '/auth/logout-all', null, accessToken);
    r.status === 200 ? pass('POST /auth/logout-all â†’ 200') : fail('logout-all', `${r.status}`);
  } catch (e) { fail('POST /auth/logout-all', e.message); }

  // Re-login after logout-all
  const rl3 = await req('POST', '/auth/login', { email: loginEmail, password: 'NewPass@1234!' });
  if (rl3.status === 200) { accessToken = rl3.body.accessToken; refreshToken = rl3.body.refreshToken; }

  try {
    const r = await req('POST', '/auth/logout', { refreshToken }, accessToken);
    r.status === 200 ? pass('POST /auth/logout â†’ 200') : fail('POST /auth/logout', `${r.status} ${JSON.stringify(r.body).substring(0,80)}`);
  } catch (e) { fail('POST /auth/logout', e.message); }

  // â”€â”€ Delete Account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section('Delete Account');
  const rl4 = await req('POST', '/auth/login', { email: loginEmail, password: 'NewPass@1234!' });
  if (rl4.status === 200) { accessToken = rl4.body.accessToken; refreshToken = rl4.body.refreshToken; }

  try {
    const r = await req('POST', '/auth/delete-account', null, accessToken);
    r.status === 200 ? pass('POST /auth/delete-account â†’ 200') : fail('delete-account', `${r.status} ${JSON.stringify(r.body).substring(0,80)}`);
  } catch (e) { fail('POST /auth/delete-account', e.message); }

  // â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log(`\n${colors.cyan}Done!${colors.reset}`);
}

run().catch(console.error);

