# Module 1: Your First Ticket — Invalid Redirect on the Demo App

- **The Scenario:** "I click 'Log in' on the new demo app and Keycloak just shows me an error page that says 'Invalid parameter: redirect_uri'. Was anything deployed?"
- **Keycloak Feature:** Clients > web-app > Settings: Valid redirect URIs.

This module is your first real ticket. The demo app at http://localhost:3000 was deployed last night and the team that pushed it cannot log in — Keycloak rejects the redirect URI the app sends back. By the end you will have read the error in the right way to know it is a *client configuration* problem (not a user problem), found the field that controls which URLs Keycloak will return tokens to, and added the exact value the demo app needs.

---

## Prerequisites

Before starting this module, confirm:

- [ ] You completed [`module-0-sandbox-access`](../module-0-sandbox-access/) and the local stack is running (`docker compose ps` shows `keycloak`, `mailpit`, and `demo-app` as `Up`).
- [ ] You can log in to the admin console at http://localhost:8080/admin/ with `admin` / `admin` and the realm switcher is on **support-sandbox**.
- [ ] You can open http://localhost:3000 and see the demo app's "Acme Web App" welcome card with a **Log in** button.

---

## Background

### What a redirect URI is, and why Keycloak validates it

The **OAuth 2.0 / OIDC authorization code flow** has the app hand the user off to Keycloak to authenticate, and then has Keycloak hand the user *back* to the app at a specific URL — the **redirect URI** — carrying an authorization code in the query string. That code is what the app trades for tokens.

Keycloak refuses to send a code to any URL it has not been explicitly told to trust. Otherwise an attacker who knew the client ID could send a victim to Keycloak with `redirect_uri=https://attacker.example/grab` and harvest the code. The **Valid redirect URIs** list on the client is Keycloak's allow-list for those return URLs.

### Exact match, not wildcard

| Pattern in Valid redirect URIs | What the app may send | Verdict |
|---|---|---|
| `https://app.acme.com/callback` | Exactly `https://app.acme.com/callback` | ✅ allowed |
| `https://app.acme.com/callback` | `https://app.acme.com/callback?state=…` | ✅ allowed (query string is ignored in the match) |
| `https://app.acme.com/callback` | `http://app.acme.com/callback` (different scheme) | ❌ rejected |
| `https://app.acme.com/*` | `https://app.acme.com/anything` | ✅ allowed (but see warning below) |
| (entry missing entirely) | anything | ❌ `Invalid parameter: redirect_uri` |

> **Note:** Wildcard entries like `https://app.acme.com/*` are tempting because they make local-dev and staging "just work." They are a long-standing security antipattern — an open path-wildcard combined with an open redirect anywhere on the host can be used to exfiltrate auth codes. Prefer an exact entry per environment. Keycloak still lets you save wildcards because legacy realms depend on them, but new entries should be exact.

### How this ticket looks from each side

The same fault produces three different symptoms depending on where you look:

| Where | What you see |
|---|---|
| The user, in the browser | Keycloak's branded error page: **"Invalid parameter: redirect_uri"** |
| The demo-app server logs | The browser never came back to `/callback`; only the outbound `/login` is logged |
| Keycloak's Events log | A `LOGIN_ERROR` row with error code `invalid_redirect_uri`, naming the client and the URL the app tried to send |

You will get good at recognizing this fingerprint — it is one of the most common "the app suddenly stopped working" tickets in any Keycloak shop.

---

## Task 1 — Exercise 1A: The Invalid Redirect

> Estimated time: 8–12 min | Tools: admin console, browser

**Ticket #4015:** `dana@acme.test` from the platform team writes: "We brought up the new local sandbox of the Acme demo app this morning at http://localhost:3000. Clicking **Log in** sends me to Keycloak, I get a screen that just says *'Invalid parameter: redirect_uri'* — no login form, no password prompt, nothing. The same demo app worked fine on the team lead's machine yesterday. Did something change in the realm overnight?"

<details>
<summary>Hint — reproduce the error before changing anything</summary>

L1 instinct: see the error with your own eyes before editing config. Open http://localhost:3000 in a private/incognito window, click **Log in**, and read the Keycloak error page carefully. The page tells you *which client* and *which redirect URI* it rejected. Both pieces of information feed directly into your fix — the client tells you what to open in the admin console, the URI tells you exactly what to add.

</details>

<details>
<summary>Hint — where the allow-list lives</summary>

Every client in Keycloak has a Settings tab. The redirect-URI allow-list is one field on that tab — search the page for "redirect" if you cannot spot it. Look at what is currently in the list and compare it to the URL the error page named. The seeded entry is for a different deployment of the same app; the local one was never added.

</details>

<details>
<summary>Hint — exact value, not a wildcard</summary>

It is tempting to add `http://localhost:3000/*` and move on. Don't — re-read the **Note** in Background. Add the *exact* path the demo app sends, which is the `/callback` route. You can see that route in the URL bar of the Keycloak error page (look for the `redirect_uri=` parameter), or in the demo app's own README. One exact entry per environment is the L1-correct fix.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. **Reproduce.** Open a private browser window. Go to http://localhost:3000. Click **Log in**. You land on a Keycloak error page reading **"We are sorry... Invalid parameter: redirect_uri"**. Look at the address bar — the `client_id=web-app` parameter and the `redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback` parameter (URL-encoded `http://localhost:3000/callback`) are the two facts you need.
2. **Open the client.** In the admin console, left nav → **Clients** → click `web-app`.
3. **Settings** tab → scroll to **Access settings** → find the **Valid redirect URIs** field. Note the existing entry: `https://demo-app.localdev/callback`. That is the production-like deploy URL. The local demo app at `http://localhost:3000` was never added.
4. Click **Add valid redirect URIs** (the **+** / add-row button below the field). Enter exactly:

   ```
   http://localhost:3000/callback
   ```

   No trailing slash. No `*`. No surrounding whitespace.
5. Scroll to the bottom of the Settings tab. Click **Save**.
6. **Verify the fix.** Go back to the private window. Click **Log in** again (or reload). You should now see Keycloak's username/password form. Log in as `alice.healthy` / `Password123!`. Keycloak redirects you back to http://localhost:3000 and you land on the claim dashboard.
7. **Confirm in the audit trail.** Left nav → **Events**. The most recent rows should show a `LOGIN` event for `alice.healthy` on client `web-app`. Scroll to earlier rows: the `LOGIN_ERROR` with `error: invalid_redirect_uri` is from before your fix. Compare timestamps to confirm the failure stopped reproducing after you saved.

> **Note:** If a teammate later spins up the demo app on a different port (say `http://localhost:3001`), they will get the same error. The fix is to add another exact entry, not to change `3000` to a wildcard. Per environment, per port — exact.

</details>

---

## Lab Checkpoint

Verify that all of the following are true before marking this module complete:

- [ ] `Clients` → `web-app` → **Valid redirect URIs** contains `http://localhost:3000/callback` as an exact entry (no `*`).
- [ ] A fresh login from http://localhost:3000 as `alice.healthy` / `Password123!` lands on the demo-app claim dashboard (you can see her username and email rendered on the page).
- [ ] In the **Events** log, the most recent `web-app` event for alice is a `LOGIN` (not a `LOGIN_ERROR`).

---

## Going Further

These extension tasks have no hints or solutions. They are for learners who want to explore beyond the module's core objectives.

- Read the seeded entry `https://demo-app.localdev/callback`. Why might a team have chosen that hostname instead of `localhost` for a "local development" config? (Hint: think about hosts files, browser cookie isolation, and shared dev environments.)
- Look at the **Web origins** field on the same client. It is set to `+`, which means "all origins matching the redirect URIs." After your fix, what origin(s) does that resolve to? When would CORS matter for the demo app, and when would it not?
- Try adding a deliberately wrong entry — say `http://localhost:3000/wrong` — *instead* of the correct one. Reproduce the error. Read Keycloak's error message again: which URL does it complain about, the configured one or the requested one? That detail is the answer key for future tickets where someone insists their config is right.
- Open the demo app's `server.js` and find the line that builds `redirect_uris`. If a teammate changes the app to use `/auth/callback` instead of `/callback`, what would you have to change in Keycloak and what would the error look like *before* you did?
