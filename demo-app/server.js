require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');

const app = express();
const PORT = process.env.PORT || 3000;
const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const REALM = 'support-sandbox';
const CLIENT_SECRET = process.env.WEB_APP_CLIENT_SECRET || 'web-app-secret-not-for-production';

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: APP_BASE_URL.startsWith('https://'),
    sameSite: 'lax',
    maxAge: 3600_000,
  },
}));

let cachedClient = null;

async function getClient() {
  if (!cachedClient) {
    const issuer = await Issuer.discover(`${KEYCLOAK_BASE_URL}/realms/${REALM}`);
    cachedClient = new issuer.Client({
      client_id: 'web-app',
      client_secret: CLIENT_SECRET,
      redirect_uris: [`${APP_BASE_URL}/callback`],
      response_types: ['code'],
    });
  }
  return cachedClient;
}

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  if (!req.session.userinfo) {
    return res.send(renderWelcome());
  }
  const { userinfo, idClaims, accessClaims } = req.session;
  res.send(renderDashboard(userinfo, idClaims, accessClaims));
});

app.get('/login', async (req, res) => {
  try {
    const client = await getClient();
    const codeVerifier = generators.codeVerifier();
    req.session.codeVerifier = codeVerifier;
    const authUrl = client.authorizationUrl({
      // Request only `openid`. Every other claim the app needs (profile, email,
      // roles, billing) must be wired into the `web-app` client's Default
      // scopes in Keycloak — that way misconfigurations there surface as
      // missing claims here instead of being masked by an explicit request.
      scope: 'openid',
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    res.redirect(authUrl);
  } catch (err) {
    res.status(500).send(renderError(
      `Could not reach Keycloak at <code>${KEYCLOAK_BASE_URL}/realms/${REALM}</code>.<br>` +
      `Check that the stack is up (<code>docker compose ps</code>).<br><pre>${err.message}</pre>`
    ));
  }
});

app.get('/callback', async (req, res) => {
  try {
    const client = await getClient();
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(
      `${APP_BASE_URL}/callback`,
      params,
      { code_verifier: req.session.codeVerifier }
    );
    const userinfo = await client.userinfo(tokenSet.access_token);
    req.session.userinfo = userinfo;
    req.session.idClaims = tokenSet.claims();
    req.session.accessClaims = decodeJwtPayload(tokenSet.access_token);
    req.session.idToken = tokenSet.id_token;
    delete req.session.codeVerifier;
    res.redirect('/');
  } catch (err) {
    res.status(500).send(renderError(`Authentication failed: ${err.message}`));
  }
});

app.get('/logout', (req, res) => {
  const idToken = req.session.idToken;
  req.session.destroy(() => {
    try {
      if (cachedClient && idToken) {
        const logoutUrl = cachedClient.endSessionUrl({
          id_token_hint: idToken,
          post_logout_redirect_uri: `${APP_BASE_URL}/`,
        });
        return res.redirect(logoutUrl);
      }
    } catch { /* fall through */ }
    res.redirect('/');
  });
});

// ── HTML helpers ─────────────────────────────────────────────────────────────

function renderDashboard(userinfo, idClaims, accessClaims) {
  const email = userinfo.email;
  const name = userinfo.name;
  const scopeStr = accessClaims.scope || '';
  const hasBilling = scopeStr.split(' ').includes('billing');

  const rawRoles = (accessClaims.realm_access && accessClaims.realm_access.roles) || [];
  const displayRoles = rawRoles.filter(r =>
    !r.startsWith('default-roles-') && r !== 'uma_authorization' && r !== 'offline_access'
  );

  const greetingHtml = name
    ? `Welcome, <span class="present">${escapeHtml(name)}</span>`
    : `Welcome, <span class="missing">&lt;unknown&gt;</span>`;

  const emailLineHtml = email
    ? `Email on file: <span class="present">${escapeHtml(email)}</span>`
    : `Email on file: <span class="missing">none</span>`;

  const emailHtml = email
    ? `<span class="present">${escapeHtml(email)}</span>`
    : `<span class="missing">&mdash;</span>`;

  const rolesHtml = displayRoles.length > 0
    ? displayRoles.map(r => `<span class="chip">${escapeHtml(r)}</span>`).join(' ')
    : `<span class="missing">&mdash;</span>`;

  const billingHtml = hasBilling
    ? `<span class="present">present</span>`
    : `<span class="missing">not granted</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acme Web App</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 820px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.5; }
    h1 { margin-bottom: 4px; }
    .realm-badge { background: #e8f0fe; color: #1a73e8; padding: 3px 12px; border-radius: 12px; font-size: 0.8em; vertical-align: middle; }
    .card { border: 1px solid #dadce0; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .row { display: flex; gap: 12px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid #f1f3f4; }
    .row:last-child { border-bottom: none; }
    .lbl { font-weight: 600; min-width: 140px; color: #5f6368; font-size: 0.9em; }
    .present { color: #188038; }
    .missing { color: #d93025; font-size: 0.9em; }
    .greeting { font-size: 1.4em; font-weight: 600; margin: 16px 0 4px; }
    .profile-dropdown { background: #fafafa; border: 1px solid #dadce0; border-radius: 8px; padding: 14px 18px; margin: 4px 0 24px; color: #3c4043; font-size: 0.95em; }
    .chip { background: #f1f3f4; padding: 2px 10px; border-radius: 10px; font-size: 0.85em; }
    details { margin-top: 24px; }
    summary { cursor: pointer; color: #1a73e8; user-select: none; }
    pre { background: #f8f9fa; border: 1px solid #dadce0; border-radius: 6px; padding: 16px; overflow-x: auto; font-size: 0.78em; margin-top: 8px; }
    .logout-bar { margin-top: 28px; }
    a.btn { display: inline-block; padding: 8px 20px; background: #d93025; color: #fff; border-radius: 4px; text-decoration: none; font-size: 0.9em; }
    a.btn:hover { background: #b31412; }
  </style>
</head>
<body>
  <h1>Acme Web App <span class="realm-badge">${REALM}</span></h1>

  <div class="greeting">${greetingHtml}</div>
  <div class="profile-dropdown">${emailLineHtml}</div>

  <p style="color:#5f6368;margin-top:24px">Claim dashboard &mdash; shows what Keycloak put in the token for this session.</p>

  <div class="card">
    <div class="row"><span class="lbl">Username</span><span>${escapeHtml(userinfo.preferred_username || userinfo.sub)}</span></div>
    <div class="row"><span class="lbl">Full name</span><span>${userinfo.name ? escapeHtml(userinfo.name) : '&mdash;'}</span></div>
    <div class="row"><span class="lbl">Email</span>${emailHtml}</div>
    <div class="row"><span class="lbl">Realm roles</span><span>${rolesHtml}</span></div>
    <div class="row"><span class="lbl">billing scope</span>${billingHtml}</div>
  </div>

  <details>
    <summary>ID token claims</summary>
    <pre>${escapeHtml(JSON.stringify(idClaims, null, 2))}</pre>
  </details>
  <details>
    <summary>Access token claims</summary>
    <pre>${escapeHtml(JSON.stringify(accessClaims, null, 2))}</pre>
  </details>

  <div class="logout-bar"><a class="btn" href="/logout">Log out</a></div>
</body>
</html>`;
}

function renderWelcome() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acme Web App</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8f9fa; color: #222; }
    .card { background: #fff; border: 1px solid #dadce0; border-radius: 12px; padding: 40px 48px; max-width: 440px; width: 90%; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    h1 { margin: 0 0 8px; font-size: 1.6em; }
    .realm-badge { background: #e8f0fe; color: #1a73e8; padding: 3px 12px; border-radius: 12px; font-size: 0.75em; vertical-align: middle; }
    p { color: #5f6368; margin: 12px 0 28px; line-height: 1.5; }
    a.btn { display: inline-block; padding: 12px 32px; background: #1a73e8; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 1em; }
    a.btn:hover { background: #1557b0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Acme Web App <span class="realm-badge">${REALM}</span></h1>
    <p>Sign in to see what claims Keycloak puts into your token.</p>
    <a class="btn" href="/login">Log in</a>
  </div>
</body>
</html>`;
}

function renderError(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Error &mdash; Acme Web App</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 620px; margin: 60px auto; padding: 0 20px; }
    .err { background: #fce8e6; border: 1px solid #f28b82; border-radius: 8px; padding: 20px; color: #c5221f; }
    pre { margin-top: 8px; font-size: 0.8em; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Acme Web App</h1>
  <div class="err"><strong>Error</strong><br>${message}</div>
  <p><a href="javascript:history.back()">Go back</a></p>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

app.listen(PORT, () => {
  console.log(`Demo app listening on port ${PORT}`);
  console.log(`Open ${APP_BASE_URL} in your browser to log in to realm "${REALM}".`);
});
