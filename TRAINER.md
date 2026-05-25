# TRAINER.md — Running the L1 Support Day

This document is for **trainers and curriculum maintainers**. Learners do not read it; reading it would spoil every exercise.

It covers:

1. Provisioning per-learner sandbox realms.
2. The broken-state inventory each module relies on.
3. Optional infrastructure (LDAP, SMTP catcher).
4. The reset procedure between cohorts.
5. The sync rule with `sandbox-realm/support-sandbox-realm.json` and module READMEs.

---

## 1. Provisioning per-learner sandbox realms

The L1 curriculum requires **one realm per learner**. A shared realm will not work: in Module 3 alone, learner A unlocks `bob.bruteforce`, learner B can no longer reproduce the broken state. Same problem in 2B (re-toggled scope), and so on. Module 1 (demo-app redirect URI) has the same single-realm constraint: once one learner adds `http://localhost:3000/callback` to the `web-app` client's Valid redirect URIs, the next learner cannot reproduce the `invalid_redirect_uri` error.

Recommended pattern:

1. Trainer hosts one cloud Keycloak (Keycloak 26.5.x). Any cloud-hosted Keycloak instance is fine — Red Hat build of Keycloak, a managed offering, or a self-managed cluster.
2. Trainer creates a **realm template** by importing `sandbox-realm/support-sandbox-realm.json` once and verifying it from the broken-state inventory below.
3. For each learner, trainer creates a new realm named `support-l1-<learner-handle>` from the same export. Quickest path: re-import the JSON via **Master realm → Add realm → Resource file**.
4. Trainer creates one realm-admin user per learner, scoped to that learner's realm only. Hand the learner the realm URL, username, and password as their "sandbox credentials" before Module 0.

> **Note:** The exercises only need realm-level admin permissions, not master-realm permissions. Do not hand out master-realm admin credentials.

### Reset procedure between cohorts

After a cohort finishes:

```text
For each support-l1-* realm:
  1. Delete the realm.
  2. Re-import sandbox-realm/support-sandbox-realm.json with the same realm name.
  3. Re-create the realm-admin user for the next learner.
```

If your cloud Keycloak has the Admin CLI exposed, `kcadm.sh delete realms/<name>` followed by `kcadm.sh create realms -f support-sandbox-realm.json` automates step 1–2.

---

## 2. Broken-state inventory (the source of truth)

Every named user, client, group, and client-scope below **must** exist in `sandbox-realm/support-sandbox-realm.json` and **must** be referenced by the corresponding module README. If you add or remove an exercise, update all three (`TRAINER.md`, the realm export, the module README). They drift out of sync trivially.

### Control user (do not break)

| User | Why it exists |
|---|---|
| `alice.healthy` | Used in Module 0 as a "can you see this user?" check and throughout the day as a reference for what a healthy account looks like. Never modify her in lab content. |

### Module 1: Demo App Invalid Redirect

| Exercise | Client | Seeded broken state | Green-state assertion |
|---|---|---|---|
| 1A | `web-app` | The `Valid redirect URIs` list contains only `https://demo-app.localdev/callback` (a non-functional "production deploy" URL). Clicking **Log in** on the demo app at http://localhost:3000 produces Keycloak's `Invalid parameter: redirect_uri` page; the `Events` log records a `LOGIN_ERROR` with `error=invalid_redirect_uri`. | The list also contains an exact `http://localhost:3000/callback` entry (no wildcard), and an end-to-end demo-app login as `alice.healthy` succeeds and renders the claim dashboard. |

### Module 3: User Account Rescue

| Exercise | User | Seeded broken state | Green-state assertion |
|---|---|---|---|
| 3A | `bob.bruteforce` | Realm has brute-force detection enabled (max 10 login failures, 60s reset). User has 12 recorded login failures and is in **Temporarily disabled** state. | The Users list shows `bob.bruteforce` with no lockout banner, and a fresh login as bob with the correct password succeeds. |
| 3B | `erin.no-welcome` | Email is `erin@acmm.test` (note the double `m`), `Email verified` is false, no `VERIFY_EMAIL` required action. Username intentionally does **not** mention the typo — the learner has to read the email field and notice it. | Email is `erin@acme.test`, `Email verified` is false, and a verification email is visible in the SMTP catcher addressed to `erin@acme.test`. |

### Module 4: Access & Role Troubleshooting

| Exercise | User | Seeded broken state | Green-state assertion |
|---|---|---|---|
| 4A | `karl.dawson` | Has the realm role `editor` assigned directly, but the `internal-wiki` client has `Full scope allowed = Off` and `editor` is **not** mapped into its `internal-wiki-dedicated` client scope. The role exists on the user yet never reaches the wiki's access token. | `karl.dawson`'s Evaluate-tab access token for `internal-wiki` contains `editor` in `realm_access.roles` — achieved by adding the `editor` realm role to the `internal-wiki-dedicated` scope (not by toggling Full scope allowed). |
| 4B | `lara.wrong-group` | Not a member of the `Marketing` group, but the user reports they should be. The `Marketing` group has the realm role `marketing-author` mapped to it. | `lara.wrong-group` is in the `Marketing` group, and her effective roles include `marketing-author`. |

### Module 2: OAuth / OIDC Scope Issues

| Exercise | Client | Seeded broken state | Green-state assertion |
|---|---|---|---|
| 2A | `web-app` | The `email` client scope is removed from the client's Default and Optional scope lists. | `email` is in Default scopes, and the Evaluate tab for `alice.healthy` + `web-app` shows an `email` claim in the generated ID token. |
| 2B | `web-app` | The custom `billing` client scope is assigned as **Optional** (app expects Default). | `billing` is in Default scopes, and the Evaluate tab shows `billing` listed under Generated access token's `scope`. |

> **Trainer note:** Both Module 2 breaks live on the same `web-app` client (the same client Module 1 fixed the redirect URI on). Encourage learners to re-toggle one break at a time, verify via Evaluate, then move on — otherwise the failures mask each other.

### Module 6: User Federation / LDAP

The L1 docker-compose stack ships a local OpenLDAP container (`openldap`) seeded from `sandbox-realm/ldap/*.ldif`. Two federation providers are pre-wired to it: `corp-ldap` (healthy) and `partner-ldap` (deliberately broken bind credential). No trainer setup is required for the local L1 day; the table below documents the seeded state.

| Exercise | Seeded broken state | Green-state assertion |
|---|---|---|
| 6C | **Ships `enabled: false` — Module 6's Prerequisites step tells the learner to toggle it on before the exercise.** `partner-ldap` provider is configured against the same OpenLDAP container, same Bind DN (`cn=admin,dc=acme,dc=test`), but with a deliberately-wrong `bindCredential` (the "rotated overnight" scenario). **Quirk to teach:** Keycloak 26's *Synchronize changed users* swallows the bind exception — it shows a green "Sync finished successfully. 0 users added…" banner instead of a red error. The unambiguous diagnostic is **Test authentication** on the provider's Settings tab, which returns *Authentication failure*. | Learner observes the silent-success-with-zero-counts on `partner-ldap`, uses **Test authentication** to surface the auth-stage failure, names the failing Bind DN, and writes an escalation note to IT Ops. (No fix is expected; this is a "know when to hand off" exercise.) |

### Module 7: Sleuthing & Escalation

| Exercise | Source data | Green-state assertion |
|---|---|---|
| 7A | Login events accumulated from Modules 1 and 3 (failed logins, redirect-URI errors). | Learner correctly classifies at least 3 distinct `LOGIN_ERROR` codes from the Events log. |
| 7B | Admin events from the trainer disabling and re-enabling a user (do this live before the exercise, or have a pre-recorded sequence). | Learner produces a timeline that aligns one admin-event with one login-event. |
| 7C | Any user from prior modules. | Learner submits a writeup that includes: user ID (UUID), at least one session ID, the client ID, the event timestamps, the exact error code, and a screenshot. |

---

## 3. Optional infrastructure

### LDAP (for Module 6)

The L1 docker-compose stack ships a local OpenLDAP container (`bitnami/openldap:2.6`) seeded from `sandbox-realm/ldap/*.ldif`. The seed contains:

- `alice.ldap`, `quinn.veteran`, `rachel.contractor`, `peter.newhire` — background users so the directory does not look suspiciously sparse.
- The admin / bind account `cn=admin,dc=acme,dc=test` with password `admin` (auto-created by the image from `LDAP_ADMIN_USERNAME` / `LDAP_ADMIN_PASSWORD`).

Two federation providers are pre-wired in the realm export:

- `corp-ldap` — healthy and `enabled: true` (kept as the working-baseline contrast to `partner-ldap` for 6C; not exercised directly).
- `partner-ldap` — same OpenLDAP target, but with a deliberately-wrong `bindCredential` so 6C's sync fails at the authentication stage. **Ships `enabled: false`** so a fresh `docker compose up` does not hold an always-failing federation provider open; Module 6's Prerequisites instructs the learner to toggle it on before Exercise 6C. The 6C ticket text deliberately does NOT name the root cause; the learner has to land on it via **Test authentication**, then articulate the hypothesis (locked / rotated bind account) in the escalation note.

No per-cohort or per-learner LDAP provisioning is required for the local L1 day. If you adapt this curriculum to a multi-realm trainer-hosted setup (see §1), each cloned realm carries both providers; point them at whichever LDAP host you provide.

### SMTP catcher (for Module 3B)

Module 3B's verification email goes nowhere without an SMTP target. Recommended: **Mailpit** (https://github.com/axllent/mailpit) — a single binary that catches all outbound mail and exposes a web UI.

#### Multi-learner setup with per-user tagging

Since all learner realms seed users with the same email addresses (`erin@acme.test`, etc.), a single Mailpit instance works for the whole cohort — but you need messages tagged per learner so each person sees only their own mail.

**Run Mailpit with the `--tags-username` flag (available since v1.26.2):**

```bash
mailpit --tags-username
```

This automatically tags every message with the SMTP username that authenticated when sending it.

**Configure each realm's SMTP with the learner's handle as the username:**

In each learner's realm → **Realm settings → Email**:

| Field | Value |
|---|---|
| Host | `<mailpit-host>` |
| Port | `1025` |
| Username | `<learner-handle>` (e.g. `alice`) |
| Password | any value — Mailpit ignores the password by default |
| From | `keycloak@acme.test` |

Each email sent by that realm will be tagged with the learner's handle. Learners open the shared Mailpit URL and filter by their tag to see only their own messages.

If you cannot run Mailpit, 3B degrades to "fix the email address and confirm `VERIFY_EMAIL` is in the user's Required user actions" without verifying that the mail actually arrived.

### Demo app (claim dashboard)

`demo-app/` contains a small Node.js/Express app that learners log into during exercises. It is pinned to the single `support-sandbox` realm and runs as part of the local `docker compose` stack — there is no per-learner realm path. The browser and the demo-app server both reach Keycloak at `http://localhost:8080`, so the OIDC issuer URL is identical on both sides (the container uses `network_mode: host`, which requires Docker Desktop 4.34+ on Windows/Mac).

**Why it exists:** Without a live app, learners fix Keycloak config but can only verify results inside the admin UI. The claim dashboard is also the *subject* of Module 1 — the first exercise of the day fixes the demo app's redirect URI so login completes at all. From there: a previously-locked user reaches the dashboard after Module 3A, roles appear after Module 4, the email claim after Module 2A, the billing scope after 2B.

**How to run:** `docker compose up` from the repo root. The demo-app comes up alongside Keycloak and Mailpit. Open <http://localhost:3000>; it redirects to Keycloak login for the `support-sandbox` realm and lands on the claim dashboard after auth.

**What each module gains:**

| Module | What the claim dashboard shows |
|---|---|
| 1A — invalid redirect URI | Before fix: Keycloak's `Invalid parameter: redirect_uri` page. After fix: login completes and the dashboard renders for the first time. |
| 3A — bob locked out | After unlock, bob reaches the dashboard at all |
| 4A — role not in token | `editor` role chip appears under Realm roles once the role is mapped into the `internal-wiki-dedicated` client scope |
| 4B — wrong group | `marketing-author` role chip appears |
| 2A — email scope removed | Email row changes from **MISSING** to the user's address |
| 2B — billing scope optional | billing scope row changes from **MISSING** to present |

**Reset:** The app is stateless (sessions are in-memory). Restarting the container clears all sessions. No additional reset procedure is needed between cohorts.

---

## 4. Sync rule between this file, the realm export, and module READMEs

Whenever you change one of:

- A row in §2 above (broken-state inventory),
- A user / client / group / scope in `sandbox-realm/support-sandbox-realm.json`,
- A `Task` block in a module README,

…you must update the other two. The three artefacts together form a single contract:

```
TRAINER.md  ─── says what is broken
     │
     ▼
realm export ─ realizes the broken state
     │
     ▼
module README ─ tells the learner the symptom and verifies the fix
```

If a learner reaches a green-state assertion that does not hold, the failure is almost always in this sync. Check `TRAINER.md` first.

---

## 5. Day-of trainer checklist

Before each cohort:

- [ ] One realm provisioned per learner from the latest `support-sandbox-realm.json`.
- [ ] One realm-admin user per learner, scoped to their realm only, credentials handed out.
- [ ] `docker compose ps` shows `openldap` as `healthy` (the local LDAP backing Module 6 — no external host needed for the L1 day).
- [ ] Mailpit running and wired into each realm's SMTP settings (or 2B downgraded per §3 SMTP note).
- [ ] **For Module 1A** — Confirm the `web-app` client's **Valid redirect URIs** field in each learner's realm contains ONLY `https://demo-app.localdev/callback` and does NOT yet contain `http://localhost:3000/callback`. If a previous cohort left the localhost entry behind, delete it before the next cohort starts — otherwise the very first ticket of the day has no broken state to reproduce.
- [ ] Pre-seed admin events for Module 7B (disable + re-enable any test user).
- [ ] Verify `alice.healthy` is visible in every learner's realm (Module 0 sanity check).
- [ ] **Demo app** — Confirm `docker compose up` brings the `demo-app` container to `Up` and http://localhost:3000 renders the welcome card (the **Log in** button is expected to fail with `invalid_redirect_uri` before Module 1A; that is the seeded broken state).
