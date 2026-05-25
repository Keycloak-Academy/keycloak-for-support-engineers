# Module 3: User Account Rescue (The Bread & Butter)

- **The Scenario:** "I forgot my password," "My account is locked," or "I never got the welcome email."
- **Keycloak Feature:** Users > Details & Credentials tabs.

This module addresses the highest-volume ticket category every Keycloak support queue sees: a user is locked out or stuck and needs an L1 to put them back in a working state. By the end you will have worked two distinct "I can't get in" tickets — one where the account is disabled, and one where the user never received their welcome email — and you will have learned to diagnose each from the symptoms alone before reaching for a fix.

---

## Prerequisites

Before starting this module, confirm:

- [ ] You completed [`module-0-sandbox-access`](../module-0-sandbox-access/) and [`module-1-demo-app-invalid-redirect`](../module-1-demo-app-invalid-redirect/), and can log in to the `support-sandbox` realm at http://localhost:8080/admin/.
- [ ] Mailpit is reachable at http://localhost:8025. The local `docker-compose.yml` already wires the realm's SMTP to it — every email Keycloak sends from this module lands there.

---

## Background

### The three places to look on a "I can't get in" ticket

| Symptom the user reports | First place to look | Why |
|---|---|---|
| "It says my account is temporarily disabled" | Users → user → Details: *User enabled* toggle and the lockout banner | Brute-force protection has tripped, OR an admin disabled the account |
| "It just rejects my password" | Users → user → Credentials | Wrong password, expired password, or no password credential set |
| "I never got the verification / reset email" | Users → user → Details: *Email* and *Email verified*; then **Events** to see if the email actually got sent | Wrong email on file, email-sending broken, or user never triggered the action |

### Required actions — the L1 lever

The **Required user actions** field on the Details tab is the safest tool in your kit. Attaching a required action (e.g. `UPDATE_PASSWORD`, `VERIFY_EMAIL`, `CONFIGURE_TOTP`) forces the user through a specific flow the next time they log in, without you needing to set anything sensitive yourself. Prefer required actions over directly setting passwords whenever the user has access to their email.

The sandbox also has the realm-level **Verify email** flag enabled (Realm settings → Login → *Verify email = On*). Effect: any user whose `Email verified` is `Off` is automatically forced through the verify-email flow on their next login — independent of whether `VERIFY_EMAIL` is attached to their record. The L1 still attaches the action and sends the email so the user has a working link in their inbox, but the realm flag is the safety net that prevents an unverified user from slipping past.

### Brute-force protection

The sandbox realm has brute-force protection enabled with a low `failureFactor` (10 failures). Two effects:

1. After 10 failed logins, the account enters *Temporarily disabled* state.
2. There is an **Unlock users** button on the realm-wide brute-force settings page that clears all locked users at once.

> **Note:** Brute-force protection is realm-wide, not per-user. Be aware that hitting "Unlock users" unlocks every locked account in the realm, not just the one you came for.

---

## Task 1 — Exercise 3A: The Brute Force Lockout

> Estimated time: 8–12 min | Tools: admin console

**Ticket #4827:** `bob@acme.test` reports he has been locked out since this morning. "I tried my password a bunch of times because I wasn't sure if I'd changed it, and now it just says my account is disabled." He needs access by end of day for a customer demo.

<details>
<summary>Hint — where the lockout state lives</summary>

A lockout shows up in two places: the User enabled state on the user's Details tab, and the realm-wide brute-force settings page that controls the policy. Decide whether you are toggling the user back on, or clearing the lockout that the policy applied — they look similar but reach different controls.

</details>

<details>
<summary>Hint — what to verify before closing the ticket</summary>

Bob's correct password is the same as every other sandbox user's. You can test the fix by attempting a login through the account console at the realm's root URL.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Left nav → **Users** → search `bob`. Open `bob.bruteforce`.
2. On the Details tab, notice that **User enabled** is `Off`. This is the seeded state — the account was manually disabled to simulate a lockout scenario.
3. Toggle **User enabled** to `On` and click **Save**.
4. (Second scenario — brute-force lockout, different control.) Left nav → **Realm settings** → **Security defenses** tab → **Brute force detection**. Click **Unlock users** to clear policy-applied lockouts realm-wide. Use this when the account's **User enabled** toggle is still `On` but the user sees "temporarily disabled" — meaning brute-force protection tripped, not a manual disable.
5. Verify: open a private browser window, go to http://localhost:8080/realms/support-sandbox/account/, and log in as `bob.bruteforce` with password `Password123!`. The login should succeed.

> **Note:** The **User enabled** toggle and the **Unlock users** button address two distinct conditions. A manual disable (`User enabled = Off`) requires the toggle. A brute-force temporary lockout (`User enabled` stays `On`, login shows "temporarily disabled") requires **Unlock users**. In production, confirm which state the account is actually in before choosing your control.

</details>

---

## Task 2 — Exercise 3B: The Welcome Email That Never Came

> Estimated time: 8–10 min | Tools: admin console, Mailpit

**Ticket #5041:** `erin@acmm.test` reports she registered last week but never received an email verification link. "I keep waiting but nothing arrives — I double-checked my work address when I signed up." She cannot complete account setup until the link comes through.

<details>
<summary>Hint — read what is on the record before changing anything</summary>

Before touching any field, read the address at the top of the ticket and the email on her Details tab letter-by-letter. Compare both against the company's standard `@acme.test` domain that every other sandbox user uses. Tickets like this are almost always typos — the trick is being slow enough to notice.

</details>

<details>
<summary>Hint — fix first, send second</summary>

You need to (a) correct the email address, (b) confirm the verified flag is off, and (c) save — only then (d) trigger the verification email. Sending before saving means the email goes to the wrong address.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Left nav → **Users** → search `erin` → open `erin.no-welcome`.
2. On the **Details** tab, notice **Email** is `erin@acmm.test` — a double-`m` typo.
3. Change **Email** to `erin@acme.test`.
4. Confirm **Email verified** is `Off`. If it is `On`, toggle it `Off`.
5. Click **Save**.
6. **Credentials** tab → **Credential Reset** → select **Verify Email** → click **Send email**.
7. Open Mailpit at http://localhost:8025 and confirm a verification email arrived addressed to `erin@acme.test`. Click the message to see the action-token link — it is the same URL Keycloak would normally email straight to the user.

> **Note:** The "Send email" button fires the email to whatever address is currently saved on the user record. Saving the corrected address (step 5) must happen before sending (step 6).

</details>

---

## Lab Checkpoint

Verify that all of the following are true before marking this module complete:

- [ ] `bob.bruteforce` shows **User enabled = On** and a login with his correct password succeeds.
- [ ] `erin.no-welcome` shows email `erin@acme.test`, **Email verified = Off**, and a verification email is in the SMTP catcher addressed to `erin@acme.test`.

---

## Going Further

- Open **Realm settings → Security defenses → Brute force detection** and read the policy values (failureFactor, waitIncrementSeconds, maxFailureWaitSeconds). What would you change for a high-value admin realm vs. a public-facing consumer realm?
- Search the Events log for `LOGIN_ERROR` and notice the rows from before Bob was unlocked. What error code did his repeated failures register as? (You will use this skill heavily in module 7.)
- The Credential Reset section also supports `VERIFY_EMAIL`, `CONFIGURE_TOTP`, and several other actions in one email. When would you bundle multiple actions into one email?
