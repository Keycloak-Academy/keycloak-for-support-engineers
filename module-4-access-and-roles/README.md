# Module 4: Access & Role Troubleshooting

- **The Scenario:** "I logged in, but the application says I don't have permission to view this page."
- **Keycloak Feature:** Users > Role Mappings & Groups tabs.

This module addresses the L1 ticket that masquerades as a Keycloak problem but is actually a permissions problem: the user authenticated successfully, but the downstream app told them no. By the end you will have distinguished a realm-level role from a client-level role, and used group membership to grant permissions the "right way" — without sprinkling individual role assignments across user records.

---

## Prerequisites

Before starting this module, confirm:

- [ ] You completed [`module-0-sandbox-access`](../module-0-sandbox-access/).
- [ ] You can log in to your sandbox realm.

---

## Background

### Realm role vs. client role

| Concept | Lives on | Granted to a user via | Typical naming |
|---|---|---|---|
| **Realm role** | Realm-wide | Direct assignment, OR via a group's role mapping | Things like `editor`, `viewer`, `marketing-author`, `support-engineer` |
| **Client role** | One specific client (app) | Direct assignment to a user, OR via a group, OR via a composite realm role that includes the client role | Things like `manage-users` (on `realm-management`), `billing-read` (on `billing-api`) |

The distinction matters because:

- A **realm role** is visible in every app's token (subject to the client's scope configuration). Granting realm-level access is broad — an `editor` realm role applies anywhere that checks it.
- A **client role** only appears in tokens for that specific client. Granting `manage-users` on `realm-management` does not give the user any privileges on `billing-api`.

A user who reports "no app trusts me" is telling you they are missing a foundational realm role (or group). A user who reports "I can act in app X but not app Y" is telling you the role they need is scoped to one app and missing on the other.

### Direct assignment vs. group inheritance

Three ways a user can end up with a role:

1. **Direct assignment** on the user's Role mapping tab. Quick fix, but creates per-user drift over time.
2. **Via a group** the user is a member of. The group has roles mapped to it; every member inherits them.
3. **Via a composite role** that the user has (a role that itself includes other roles).

**L1 default: prefer group membership for permissions.** It is auditable, reversible, and reflects the business structure (Marketing, Finance, Engineering). Direct role assignment to individual users is a code smell — it suggests someone reached for the quick fix instead of asking which group should grant this.

### The Evaluate tab — your X-ray for "what does this user really have"

When you do not know whether a user has a given role, you have two screens:

- **Users → \<user\> → Role mapping** shows direct + inherited roles, separated.
- **Clients → \<client\> → Client scopes → \<client\>-dedicated → Evaluate** shows the *effective* set of roles, claims, and audiences that a generated token for this user-on-this-client would contain. This is the screen the application sees. When in doubt, trust Evaluate.

---

## Task 1 — Exercise 4A: Missing role

> Estimated time: 12–15 min | Tools: admin console

**Ticket #5302:** `karl@acme.test` reports he can log in to the company portal but the Internal Wiki returns "You do not have permission to edit this page" when he clicks Edit. He says his manager told him he should have editor access.

<details>
<summary>Hint — what does the user actually have?</summary>

Open Karl's Role mapping tab and look at his realm roles. If the role the wiki is asking for is already there, the problem is not the user — it is what the wiki *sees about* the user. The role list on the user and the access token the app receives are not always the same set.

</details>

<details>
<summary>Hint — what does the app actually see?</summary>

The wiki only acts on what arrives in the token it gets from Keycloak. There is a screen on the wiki's client that lets you generate a token *as Karl* and inspect every claim and role it would contain. If a role exists on the user but does not appear in that token, the gap is on the client's scope configuration, not on the user.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Left nav → **Users** → open `karl.dawson` → **Role mapping** tab. Confirm `editor` is already listed under **Realm roles** as a direct assignment. The role itself is not missing — the diagnosis lives elsewhere.
2. Left nav → **Clients** → open `internal-wiki` → **Client scopes** tab → click `internal-wiki-dedicated` → **Evaluate** sub-tab.
3. In the **Users** picker, choose `karl.dawson`, then click **Generated access token**. In the JSON, look at `realm_access.roles` — `editor` is **not** there. That is exactly what the wiki sees, which is why Edit is refused.
4. Open the `internal-wiki` client's **Settings** tab and note that **Full scope allowed** is **Off**. With that switch off, tokens for this client carry only the roles explicitly mapped to its dedicated scope, so realm roles assigned to the user are filtered out. This is a deliberate hardening: the wiki's token should not be able to vouch for roles unrelated to the wiki.
5. **Clients → internal-wiki → Client scopes → internal-wiki-dedicated → Scope** → **Assign role** → **Realm roles** → `editor` → **Assign**.
6. Return to the **Evaluate** sub-tab, re-generate the access token for `karl.dawson`, and confirm `editor` now appears in `realm_access.roles`. Karl can sign out of the wiki and back in, and the Edit action will succeed.

> **Note:** Do **not** "fix" this by toggling Full scope allowed back on. That removes the boundary for every realm role on every user of this client. Map the specific roles the app needs into its dedicated scope instead — that is the supported pattern for narrowing what an app's tokens are allowed to assert.

</details>

---

## Task 2 — Exercise 4B: Group Inheritance

> Estimated time: 10–12 min | Tools: admin console

**Ticket #5377:** `lara@acme.test` joined the Marketing team last week. She reports she can log in but the Marketing CMS will not let her publish posts. Other Marketing team members can publish fine.

<details>
<summary>Hint — start by looking at someone who works</summary>

Before changing Lara, look at any Marketing user who can publish. Open their Groups tab. Open their Role mapping tab. The pattern they show you is the pattern Lara is missing.

</details>

<details>
<summary>Hint — Direct vs. Inherited</summary>

After you add Lara to the group, look at her Role mapping tab. The new role should show up under a section that makes clear she got it via the group, not via a direct assignment. If it shows up as direct, you assigned the role itself instead of joining the group.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. (Optional but instructive) Left nav → **Groups** → open `Marketing` → **Role mapping** tab. Confirm the group has `marketing-author` mapped to it.
2. Left nav → **Users** → open `lara.wrong-group`.
3. **Groups** tab → **Join group**.
4. Pick `/Marketing` from the tree. Click **Join**.
5. **Role mapping** tab on Lara. In the **Inherited roles** section, you should now see `marketing-author` with the source listed as the Marketing group.
6. Verify the Lara case looks identical to a healthy Marketing user — same inherited role, same group path.

> **Note:** Do NOT also assign `marketing-author` directly to Lara. If you do, when she eventually leaves Marketing and is removed from the group, she will keep the role through the direct assignment — a common cause of "this person still has access they should not have" tickets.

</details>

---

## Lab Checkpoint

Verify that all of the following are true before marking this module complete:

- [ ] The `internal-wiki-dedicated` client scope has the `editor` realm role mapped under its **Scope** tab.
- [ ] An Evaluate run for `karl.dawson` on the `internal-wiki` client lists `editor` in `realm_access.roles`, and **Full scope allowed** on the client is still **Off**.
- [ ] `lara.wrong-group` is a member of `/Marketing` AND has `marketing-author` under **Inherited roles** (not Direct).

---

## Going Further

- Look at the `account` client and `admin-cli` client. Both have realm roles attached. What is the difference between a realm role and a client role on the `account` client specifically?
- The realm has a `default-roles-<realm>` composite role assigned to every user automatically. Open it and see what it contains. Why is that mechanism useful for "every user should have X" cases?
- Imagine Lara also needs read-only access to one specific dashboard client. Would you add her to another group, assign a direct client role, or create a composite role? What are the trade-offs?
