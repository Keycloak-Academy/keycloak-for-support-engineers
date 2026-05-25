# Module 2: OAuth / OIDC Scope Issues

- **The Scenario:** "The app says I'm missing a permission," or an app team says "the token doesn't contain the user's email."
- **Keycloak Feature:** Clients > Client Scopes & Evaluate tab.

This module addresses the family of tickets where the user is in the right groups and has the right roles, but the application still says no — because what is actually missing is a *scope* on the client. By the end you will have used the Evaluate tab to inspect the effective token Keycloak produces for a user-on-a-client, identified two distinct scope-related failure modes, and applied UI-only fixes for each.

---

## Prerequisites

Before starting this module, confirm:

- [ ] You completed [`module-0-sandbox-access`](../module-0-sandbox-access/) and [`module-4-access-and-roles`](../module-4-access-and-roles/) (you have used the Evaluate tab once before).
- [ ] You can log in to your sandbox realm.

---

## Background

### Client scopes in 90 seconds

A **client scope** is a bundle of claims, audiences, and protocol mappers that gets included in tokens for a client. Each client has two lists:

- **Default client scopes** — always included in every token for this client.
- **Optional client scopes** — only included when the application explicitly requests them via the OAuth `scope` parameter.

There is also a realm-wide **defaultDefaultClientScopes** list that pre-populates new clients, but for an existing client what matters is the per-client list.

### When to look at scopes vs. roles

| Symptom | Where to look first |
|---|---|
| App says "you do not have permission to do X" with a 403 | Roles (module 4). The user is missing the role the app checks. |
| App says "you do not have permission to do X" with `insufficient_scope` in the error | **Scopes (this module).** The user might have the role, but it is not making it into the token because the scope is missing. |
| App says "we could not find your email" or "your name is missing" | **Scopes (this module).** The user has the data, but the scope that carries it is not assigned. |

### The Evaluate tab — your X-ray, again

For each scope problem in this module, the workflow is the same:

1. Open the client → **Client scopes** sub-tab → **Evaluate**.
2. Pick a user.
3. Click **Generate access token** (and/or **Generated user info**).
4. Look at what is and is not in the generated JSON.

The Evaluate tab is what the application sees. If a claim is missing here, it is missing in production too.

### L1 / L2 boundary

The fixes in this module are UI-only and safe for L1: **assigning an existing scope** to a client and **moving a scope between Default and Optional**. What is NOT in scope for L1 in this module: authoring new **protocol mappers**, editing an existing mapper's expression, or creating a new client scope from scratch. Those changes affect token contract for every user and belong to L2.

> **Note:** Both exercises in this module break the same `web-app` client. Re-toggle one break at a time and re-Evaluate between fixes — otherwise the failures mask each other.

---

## Task 1 — Exercise 2A: The Missing Claim

> Estimated time: 12–15 min | Tools: admin console

**Ticket #5501:** The marketing team reports a new bug in `web-app`. After login, the profile dropdown shows "Email on file: none" for every user. They confirmed the affected users have an email set in Keycloak (and the username still renders correctly in the header). Application logs show `id_token.email` is undefined.

<details>
<summary>Hint — start from the symptom, not the user</summary>

The ticket says the user has an email in Keycloak (you can verify on alice.healthy's Details tab — she does). So the user data is fine. The Evaluate tab will tell you whether the data is reaching the token. If the email is not in the token, the missing piece is between "user" and "token" — and that piece is the client scope wiring.

</details>

<details>
<summary>Hint — what the app team says it needs</summary>

Per the `web-app` team's integration contract, the application only sends `scope=openid` at authorization time and depends on the `web-app` client in Keycloak having every other scope it needs already wired into **Default client scopes**, so the claims arrive automatically. The full set the client must have configured:

| Scope | Why the app needs it |
|---|---|
| `openid` | Required by every OIDC client to receive an ID token. |
| `profile` | Carries `preferred_username`, `name`, `given_name`, `family_name`. |
| `email` | Carries `email` and `email_verified`. |
| `roles` | Carries `realm_access.roles` so the app can render role-gated UI. |
| `billing` | Drives the "View bill" feature (the subject of Exercise 2B). |

Open `web-app` → **Client scopes** → **Setup** and compare that list against what is currently assigned (Default + Optional). The gap is your answer.

</details>

<details>
<summary>Hint — what carries the email claim</summary>

The built-in `email` client scope is the one that carries the `email` and `email_verified` claims into ID tokens and userinfo. Look at the client's Client scopes list and see what is missing.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Left nav → **Clients** → open `web-app`.
2. **Client scopes** sub-tab → **Setup** view (the default).
3. Note the Default and Optional lists. The `email` scope is absent from both — that is the seeded break.
4. Click **Add client scope** → check **email** → from the **Add** dropdown choose **Default**.
5. Verify with Evaluate. Same sub-tab, switch to **Evaluate**. Pick **alice.healthy** in the **Users** field. Click **Generate ID token**. Confirm the JSON contains `"email": "alice@acme.test"`.

> **Note:** If you mis-add `email` as Optional instead of Default, the Evaluate tab will only include it when the **Scope parameter** field at the top of Evaluate also lists `email`. Default is the right choice for this ticket.

</details>

---

## Task 2 — Exercise 2B: The `insufficient_scope` Error

> Estimated time: 12–15 min | Tools: admin console

**Ticket #5588:** A user reports that when they click "View bill" in `web-app`, the page shows an error: `insufficient_scope: required scope billing.read`. The user can see every other page in the app. The billing team confirmed the user *should* have billing access.

<details>
<summary>Hint — re-read the error code</summary>

`insufficient_scope` is an OAuth-standardized error meaning "the access token does not carry the scope this API requires." That tells you the *scope* is the missing piece, not a role and not a claim. It also tells you the scope likely exists somewhere — otherwise the app team would have asked for a new one.

</details>

<details>
<summary>Hint — Default vs Optional</summary>

A scope in Optional only gets included when the app explicitly requests it in the `scope` parameter at authorization time. A scope in Default is always included. If the app team designed the feature assuming the scope was always present, the right L1 fix is to flip the scope from Optional to Default — not to ask the app team to change their request.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Left nav → **Clients** → open `web-app` → **Client scopes** sub-tab.
2. In the Optional list, find `billing`. (It is there because the realm shipped with a custom `billing` scope.)
3. Click the row's overflow menu (⋮) → **Change to default**. The scope moves from Optional to Default.
4. Verify with Evaluate. Pick `alice.healthy`. Click **Generate access token**. In the JSON, find the `scope` claim and confirm it contains `billing`.

> **Note:** Optional vs Default is a contract decision: if other apps share this client and break when `billing` is always present, the right answer is for the *app* to request the scope, not for L1 to default it. Confirm with the app team owner before flipping in production.

</details>

---

## Lab Checkpoint

Verify that all of the following are true before marking this module complete:

- [ ] `web-app` has `email` in its Default client scopes; Evaluate produces an `email` claim for `alice.healthy`.
- [ ] `web-app` has `billing` in its Default client scopes; Evaluate access-token shows `billing` in `scope`.

---

## Going Further

- Open the **Client scopes** top-level page (left nav → Client scopes). Find the built-in `email` scope and look at its protocol mappers. Which mapper actually puts the `email` claim into the token? (You do not need to edit it — just locate it. This is the L2 surface.)
- Use the Evaluate tab to generate the **userinfo** view alongside the access token. When would an application call userinfo instead of just reading the access token?
- The `web-app` is configured as a confidential client with a secret. What would change in scope behavior if it were a public client (e.g. a single-page app)?
