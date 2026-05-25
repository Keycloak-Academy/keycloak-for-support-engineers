# Module 0: Sandbox Access & Orientation

- **The Scenario:** "I just cloned the repo — what am I looking at?"
- **Keycloak Feature:** Admin Console navigation.

This warm-up addresses the gap between "I have a running Keycloak" and "I can act on a ticket." By the end you will have started your local sandbox, logged in to the admin console, found every left-nav surface the rest of the day depends on, and confirmed a known healthy user is visible.

---

## Prerequisites

Before starting this module, confirm:

- [ ] Docker (Engine 24+) and the Docker Compose plugin are installed and you can run `docker compose version` without an error.
- [ ] A modern browser (Chrome, Firefox, Edge — anything current).
- [ ] You have cloned this repository and your terminal is in the repo root (the directory containing `docker-compose.yml`).

This is the first module; there is no prior module to complete.

---

## Background

### What "L1, UI-only" means in this course

For the rest of the day, you will resolve real-world Keycloak tickets using **only the admin console**. You will not run `kcadm`, you will not read server logs, you will not touch the database. Everything you need to investigate a ticket lives in one of five places in the left navigation:

| Where to look | What lives there | Modules that use it heavily |
|---|---|---|
| **Users** | Per-user details, credentials, sessions, role mappings, group membership, IdP links | 3, 4, 5 |
| **Groups** | Group tree and the realm/client roles each group inherits | 4 |
| **Clients** | Apps that delegate authentication to Keycloak — their scopes, mappers, redirect URIs, consent | 1, 2, 4 |
| **User federation** | LDAP / Kerberos providers; sync controls | 6 |
| **Events** (under Realm settings → Events tab in older UIs, or top-level on newer) | Login events and Admin events — the audit trail | 1, 3, 7 |
| **Sessions** | Realm-wide and per-user active sessions | 5 |

If you get lost during any module, come back to this table.

### Components running locally

`docker compose up` brings up four containers, all on one Docker network:

| Service | Purpose | URL the browser uses |
|---|---|---|
| `keycloak` | Keycloak 26.5 in `start-dev` mode with the `support-sandbox` realm pre-imported from `sandbox-realm/support-sandbox-realm.json` | http://localhost:8080 |
| `mailpit` | SMTP catcher — Keycloak's realm SMTP is wired here so every email the admin actions trigger is captured | http://localhost:8025 |
| `demo-app` | Small claim-dashboard web app — Module 1 is the first ticket to touch it (fixing its redirect URI), and Modules 4 onward use it to make role/scope fixes immediately visible | http://localhost:3000 |
| `openldap` | Local LDAP directory backing Module 6's federation providers, seeded from `sandbox-realm/ldap/*.ldif` | not used directly — Keycloak talks to it at `ldap://openldap:1389` |

> **Note:** Keycloak runs in `start-dev` mode (H2 in-memory database, no HTTPS). This is fine for a throwaway training environment and never appropriate for production. Tearing the stack down (`docker compose down -v`) drops all state; bringing it back up re-imports the seeded broken state from the realm export.

### Quick links

Keep these tabs open for the day. Everything below assumes the stack is up and the admin console has the realm switcher set to `support-sandbox`.

| What | URL | Used in |
|---|---|---|
| Admin console (login as `admin` / `admin`) | http://localhost:8080/admin/ | Every module |
| User account console (how end-users see their own profile) | http://localhost:8080/realms/support-sandbox/account/ | 3B |
| Mailpit web UI (every email Keycloak sends lands here) | http://localhost:8025 | 3B |
| Demo app (claim dashboard — the app users are trying to reach) | http://localhost:3000 | 1, 2, 3A, 4 |
| OIDC discovery doc for the sandbox realm | http://localhost:8080/realms/support-sandbox/.well-known/openid-configuration | Reference only |

### Sandbox users

The realm seeds one **working** account and several **broken** accounts. The only one you should compare against as "what healthy looks like" is `alice.healthy` — every other named user is deliberately misconfigured in some way you will learn to fix later. Do not click around on the broken users in this module; you will meet them one at a time.

| Username | State | First seen in | Email |
|---|---|---|---|
| **`alice.healthy`** | **Working — the healthy reference. Enabled, email verified, in `app-users`, password set.** | **Module 0 (this module); used as the test login throughout Modules 1, 2, 4** | `alice@acme.test` |
| `bob.bruteforce` | Broken — login lockout | Module 3 | `bob@acme.test` |
| `erin.no-welcome` | Broken — verification email never arrived | Module 3 | (intentionally typo'd — find it in 3B) |
| `grace.forgotpass` | Broken — credentials issue (reserved) | Module 3 (extension) | `grace@acme.test` |
| `karl.dawson` | Broken — missing realm role | Module 4 | `karl@acme.test` |
| `lara.wrong-group` | Broken — missing group membership | Module 4 | `lara@acme.test` |

> **Note:** When you are debugging a broken user later and are not sure whether something looks broken or just unfamiliar, open `alice.healthy` in a second tab and compare field by field. She is the only account guaranteed to be in a green state.

---

## Task 1 — Exercise 0A: Start the sandbox and log in

> Estimated time: 3–5 min | Tools: terminal, browser

**Ticket #4001 (IT onboarding):** You were just added to the L1 support rotation. The on-call lead emailed: "Spin up the training sandbox on your laptop and confirm you can reach the admin console before your first shift today; tickets are already queueing up."

<details>
<summary>Hint — where the admin console actually lives</summary>

The admin console is served at a path that includes the **master** realm even though you will then switch to the `support-sandbox` realm using the realm switcher in the top-left corner. The initial bootstrap admin you log in with lives in the master realm.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. From the repo root, run:
   ```bash
   docker compose up -d
   ```
   The first run pulls images and can take a couple of minutes. Wait until `docker compose ps` shows `keycloak` as `healthy`.
2. Open http://localhost:8080/admin/ in a browser.
3. Log in with the bootstrap admin credentials: **username `admin`, password `admin`**.
4. In the top-left realm switcher, change from **master** to **support-sandbox**. From here on, every module operates inside `support-sandbox` — if you ever notice you are on `master`, switch back.

> **Note:** If port 8080, 8025, or 3000 is already in use on your machine, `docker compose up` will fail with a port-binding error. Stop the conflicting service or edit `docker-compose.yml` to remap the host-side port (`"18080:8080"`, etc.) and use the remapped port in the URLs below.

</details>

---

## Task 2 — Exercise 0B: Locate the support surfaces

> Estimated time: 5–8 min | Tools: admin console

**Ticket #4002 (IT onboarding):** Same on-call lead, follow-up note: "Before you take a real ticket, run the first-day walkthrough — find the Users list, the Sessions page, the Events log, the Clients list, and User federation. Pull up the test user `alice.healthy` (we use her as the 'is this thing on?' check) and confirm her record looks normal. If anything is missing, ping me before you start."

<details>
<summary>Hint — the left navigation is grouped</summary>

The left nav has two collapsible sections — "Manage" (everyday operational screens) and "Configure" (settings and providers). The five surfaces in the Background table are spread across both. Click each top-level item once to see what it contains.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. In the left nav, click **Users**. The list should include `alice.healthy` and several other users — leave the others alone for now.
2. Click `alice.healthy` and look at the tabs across the top of her detail page: Details, Credentials, Role mapping, Groups, Consents, Identity provider links, Sessions. You will use most of these tabs in modules 2–4.
3. Click **Groups** in the left nav. You should see `app-users` and `Marketing` listed.
4. Click **Sessions** in the left nav. It will show a realm-wide list of active sessions; it may be empty or near-empty right now.
5. Click **Clients** in the left nav. You should see `web-app` and `internal-wiki` along with the built-in clients (`account`, `admin-cli`, etc.).
6. In the left nav, scroll to **User federation** and confirm two providers are listed: `corp-ldap` (enabled) and `partner-ldap` (shipped disabled — Module 6 turns it on). You will not touch either until module 6.
7. Find **Events** in the left nav (it may be under **Realm settings → Events** in some Keycloak versions, or a top-level item in others). The Login events tab is what you will live in for module 7.

> **Note:** Do not modify anything on `alice.healthy` or any other user during this module. The point is just to know where things live.

</details>

---

## Lab Checkpoint

Verify that all of the following are true before marking this module complete:

- [ ] `docker compose ps` shows `keycloak` and `mailpit` running.
- [ ] You are logged in to the `support-sandbox` realm in the admin console at http://localhost:8080/admin/.
- [ ] You can locate Users, Groups, Sessions, Clients, User federation, and Events in the left navigation without referring back to the Background table.
- [ ] `alice.healthy` appears in the Users list with email `alice@acme.test`.

---

## Going Further

These extension tasks have no hints or solutions. They are for learners who want to explore beyond the module's core objectives.

- Open Mailpit at http://localhost:8025 — it should be empty right now. Keep this tab open; from Module 3 onward you will see every email Keycloak sends land here.
- Open **Realm settings → General** and note the realm display name. What is the difference between the realm `name` (URL slug) and `displayName` (login screen heading)?
- Open `alice.healthy` → Sessions and note that it is empty. What does that imply about whether alice is "logged in" right now?
- Run `docker compose down -v` then `docker compose up -d` and confirm that the broken-state users are back to their seeded state. Why is `-v` important?
