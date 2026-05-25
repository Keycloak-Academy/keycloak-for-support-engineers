# Module 7: Sleuthing (The Audit Trail)

- **The Scenario:** "I swear I am typing my password right, but it's giving me a weird error."
- **Keycloak Feature:** Events (Realm settings).

This module addresses the meta-skill on which every other module depends: reading the audit trail to figure out what actually happened before deciding what to do about it. By the end you will have decoded the most common login-error codes, built a timeline from Admin Events that explains a user-visible symptom, and produced an escalation report that gives L2 enough context to act without asking back.

---

## Prerequisites

Before starting this module, confirm:

- [ ] You completed Modules 1, 2, and 3 — those modules generated the Events history this module reads.
- [ ] You can log in to your sandbox realm.

---

## Background

### Two event streams, two purposes

| Stream | Records | Filter knobs | What L1 uses it for |
|---|---|---|---|
| **Login events** (also called User events) | Every login, logout, token refresh, registration, password change, MFA registration, account update | User, Client, Event type (LOGIN, LOGIN_ERROR, LOGOUT…), Date range | "What happened to this user's login attempts in the last 24h?" |
| **Admin events** | Every admin action — toggling a user's enabled flag, editing a client, changing realm settings | Operation type (CREATE, UPDATE, DELETE), Resource type (USER, CLIENT, GROUP…), Auth user (who did it), Date range | "Did an admin change something that explains this user's complaint?" |

The two streams are separate UI pages and have separate filters. The trick is using them together — Login events tells you what the user saw, Admin events tells you what someone did to cause it.

### The login error codes you will see most

| Error code | What it usually means | First L1 reaction |
|---|---|---|
| `invalid_user_credentials` | Wrong password | Confirm with user; do not reset on first-fail. Could be a typo. |
| `user_not_found` | Username does not match any user | Did the user mis-type? Did the user move to a different realm? Did LDAP fail to sync them (module 6)? |
| `user_disabled` | The account's `Enabled` flag is `Off` | Check Admin events for when/why it was disabled. Module 3A territory. |
| `user_temporarily_disabled` | Brute force lockout | Module 3A. |
| `account_disabled` | Same as user_disabled in newer Keycloak versions; check both | Same as above. |
| `client_not_found` | The app sent an unknown client ID | The app is mis-configured (wrong client ID in their config). NOT a Keycloak fix. |
| `invalid_redirect_uri` | The redirect_uri the app sent does not match the client's allowed list | The app's deploy URL changed; client config needs to follow. |
| `not_allowed` | The action requires consent the user denied, or a flow refused them | Read the surrounding events for context. |
| `invalid_grant` | An OAuth token exchange failed — expired auth code, used refresh token, etc. | Usually transient; only investigate if it spikes. |

### How to build a timeline

For a "this happened to me at 9:23am" ticket:

1. Open **Login events**. Filter by user. Set the date range to cover 9:00–9:45.
2. Find the LOGIN_ERROR (or whatever event you are investigating) closest to 9:23.
3. Note the timestamp, the error, and the client.
4. Open **Admin events** in a second tab. Same date range, broader (8:00–9:30 to catch the *cause* event).
5. Filter by Resource type = USER and the user's ID. Look for any UPDATE shortly before 9:23.
6. Combine into a sentence: "At 8:51 admin@acme.test set this user's Enabled to false. At 9:23 the user attempted a login from client web-app and got user_disabled."

That sentence is what L2 needs. The two screens alone are not.

---

## Task 1 — Exercise 7A: Reading the Login Events

> Estimated time: 10–12 min | Tools: admin console

**Ticket #6011:** A user reports getting different error messages on different login attempts and wants to know what is happening. "Sometimes it just says wrong password, sometimes it says my account is disabled, and now it says my account is temporarily disabled. Are these the same thing?"

<details>
<summary>Hint — narrow the time range first</summary>

The unfiltered Login events page can be overwhelming. Set a date range that covers when you did Modules 1, 2, and 3, and filter Event type to `LOGIN_ERROR` to surface just the failures.

</details>

<details>
<summary>Hint — the error column hides one level deep</summary>

Each `LOGIN_ERROR` row has a Details section (clickable / expandable) that contains the specific error code. The top-line just says "Login error" — the useful information is the `error` field inside Details.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Left nav → **Events** (or Realm settings → Events → User events tab, depending on Keycloak version).
2. Filter: **Event type** = `LOGIN_ERROR`. Set the date range to cover your earlier modules.
3. For each error row, expand the Details. Note the `error` field.
4. You should find at least:
   - `invalid_user_credentials` from any wrong-password attempt.
   - `user_disabled` from attempts to log in as `bob.bruteforce` while he was disabled (Module 3A pre-fix).
   - `invalid_redirect_uri` from your earlier work on the demo app in Module 1.
   - `user_temporarily_disabled` if you (or another learner cohort) triggered brute-force lockout live.
5. For each, write down or say aloud what condition triggers it. Cross-check against the table in Background.

> **Note:** If you do not see `user_temporarily_disabled` in your log, your sandbox may not have had a real lockout event. That is fine — you can demonstrate it by failing 11 password attempts on a test user, then reviewing the log.

</details>

---

## Task 2 — Exercise 7B: Cross-referencing Admin Events

> Estimated time: 10–12 min | Tools: admin console

**Ticket #6055:** A user reports they were happily working all morning, then around 11:00 the wiki suddenly told them they did not have permission to edit. They have not changed anything on their end.

<details>
<summary>Hint — start from the symptom, not the cause</summary>

You do not know what the admin did, but you know what the user saw. Find the user-side event first (the wiki access failure), note its timestamp and client, then look at Admin events for changes to that user's roles or groups in the minutes BEFORE the user-side event.

</details>

<details>
<summary>Hint — Admin events has its own filters</summary>

Admin events has separate filter knobs from Login events. Filter Resource type to USER, set Operation type to UPDATE, and filter by Auth client / Auth user if you want to narrow further. The Resource path column tells you which user or which group was changed.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Have your trainer set up the scenario if it has not been pre-seeded: an admin removes a role or group from a test user, then the user attempts the wiki, sees the error, the error appears in Login events, and you investigate. (Trainer notes in `TRAINER.md` cover this.)
2. Left nav → **Events** → **User events** tab. Filter to the test user and the time of the symptom. Find the failed attempt — note timestamp, client (`internal-wiki`), and the relevant error.
3. Left nav → **Events** → **Admin events** tab. Filter to the time range 10:30–11:00, Resource type = USER. Find the UPDATE on the test user.
4. Combine: "At 10:51, admin@acme.test removed the realm role `editor` from karl.dawson. At 10:57, karl attempted to edit the wiki and received an `insufficient_permission` response."

> **Note:** Admin events only fire if the realm has Admin events enabled (it usually is by default in dev/test realms). If the Admin events tab is empty, check **Realm settings → Events** to ensure the **Save events** toggle for Admin events is on.

</details>

---

## Task 3 — Exercise 7C: Building an Escalation Report

> Estimated time: 12–15 min | Tools: admin console + your notes

**Ticket #6088:** Pick any user you investigated in a previous module — `bob.bruteforce`, `karl.dawson`, `lara.wrong-group`, etc. — and produce a complete escalation report as if you were handing the ticket to L2.

<details>
<summary>Hint — L2 has zero context</summary>

Imagine the L2 engineer is reading your report at 2am. They have never met your user. They know nothing about your ticket. Write everything they need to find the user record (user ID), reproduce the symptom (client ID, error code), see what already happened (timestamps), and not duplicate your work (what you tried).

</details>

<details>
<summary>Hint — pulling the user ID</summary>

Users → \<user\> → Details tab. The user ID (UUID) is visible near the top of the page in newer Keycloak versions, or in the URL bar. Session IDs are on the Sessions tab. Client IDs are on the client's Settings tab.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Pick your user. Open their Details page.
2. Open a text editor or the ticket comment box and start with the template:

   ```
   ESCALATION TO L2 — Ticket #6088
   -----------------------------------------
   Realm:           support-l1-<your-handle>
   User:            <username>
   User ID (UUID):  <copy from Details URL or page>
   Email:           <email>
   Client involved: <client ID, e.g. web-app>
   Session ID:      <copy from Sessions tab if relevant; "n/a" if not>

   Symptom (from user):
     <one-sentence quote of what the user reported>

   Observed events:
     - <timestamp>  <event type>  error=<code>  client=<id>
     - <timestamp>  <event type>  ...

   L1 steps attempted:
     - <each thing you did>
     - <each thing you ruled out>

   Hypothesis: <what you think is going on; can be "uncertain">

   Screenshots attached: <yes/no — describe what they show>
   ```
3. Fill it in. Attach a screenshot of the user's Details page and the failing event row from the Events log.
4. Have a peer (or your trainer) read it cold and tell you whether they could act on it.

> **Note:** Do not put plaintext passwords, full session token contents, or anything from the user's Credentials tab into the report. Session IDs and timestamps are fine; tokens and credentials are not.

</details>

---

## Lab Checkpoint

Verify that all of the following are true before marking this module complete:

- [ ] You can name at least three distinct `LOGIN_ERROR` codes you found in the Events log and explain when each fires.
- [ ] You produced a one-sentence cross-referenced timeline tying an Admin event to a Login event.
- [ ] You produced an escalation report containing user UUID, client ID, timestamps, error code(s), L1 steps attempted, and a hypothesis.

---

## Going Further

- Open **Realm settings → Events** and look at the **Event listeners** list. What does the `jboss-logging` listener do, and how would you (or an L2) use it?
- Find an event where a user changed their own password (`UPDATE_PASSWORD`). What is in the Details section? Why is the absence of a password value there a good thing?
- Imagine the realm had an Event listener configured to send events to a SIEM (e.g. Splunk). How would your escalation report change — what would you no longer need to include?
