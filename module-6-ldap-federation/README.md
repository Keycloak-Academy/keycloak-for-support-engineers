# Module 6: User Federation / LDAP Sync

- **The Scenario:** "The new hire is in the corporate directory but Keycloak says they don't exist," or "I changed my LDAP password but Keycloak still rejects the new one."
- **Keycloak Feature:** User Federation > LDAP provider.

This module addresses the L1 ticket category that crosses a system boundary: Keycloak is mirroring an external LDAP directory, the two are out of sync, and the user notices. The L1 job is *not* to redesign the LDAP integration — it is to know what the integration is, trigger the right kind of sync, and recognize the cases that need to go to L2 rather than being guessed at. By the end you will have inspected an LDAP provider configuration without changing it, run both kinds of sync, and written a clean escalation note for an out-of-sync case L1 cannot fix.

---

## Prerequisites

Before starting this module, confirm:

- [ ] You completed [`module-0-sandbox-access`](../module-0-sandbox-access/).
- [ ] `docker compose ps` shows `openldap` as `healthy` (the local LDAP directory that backs this module's two federation providers).
- [ ] `partner-ldap` is **enabled** in User federation. The realm ships it disabled so a fresh `docker compose up` does not hold an always-failing provider open. Toggle it on from **User federation → partner-ldap → Settings → Enabled → Save** before starting Exercise 6C. `corp-ldap` is already enabled and you do not need to touch it.

---

## Background

### What LDAP federation does in Keycloak

The sandbox ships two federation providers — both pointing at the same local OpenLDAP container (`ldap://openldap:1389`), backed by `dc=acme,dc=test`:

| Provider | What it represents | State |
|---|---|---|
| `corp-ldap` | The main corporate directory. Bind DN healthy. | Working — sync succeeds. |
| `partner-ldap` | A partner-org directory whose sync started misbehaving overnight. | Broken — diagnose in 6C. |

Treat each provider as independent: failures on one do not imply anything about the other.

When the `corp-ldap` provider is configured against an LDAP directory:

- **Authentication** is delegated to LDAP. When a user types their username and password into the Keycloak login screen, Keycloak binds to LDAP with those credentials. If LDAP accepts, the user is logged in.
- **User identities** are imported into Keycloak so they show up in the Users list, can be assigned roles, etc. The import happens at sync time, not at login time (depending on the import settings).
- **Edit mode** controls whether Keycloak can write back to LDAP (`WRITABLE`), can only read (`READ_ONLY`), or can store some overlay attributes locally (`UNSYNCED`). The sandbox uses `READ_ONLY` — Keycloak cannot modify the LDAP entries.

### The two sync buttons

The LDAP provider page has two sync controls:

| Button | What it does | When to use |
|---|---|---|
| **Synchronize changed users** | Pulls only LDAP entries whose `modifyTimestamp` is newer than the last sync. Fast. | Routine — "the user changed their LDAP password / a new hire was just added." This is the default L1 action. |
| **Synchronize all users** | Pulls the entire `usersDn` subtree. Slow on large directories; can hammer LDAP. | After a directory restore, after fixing the LDAP filter, or when "Synchronize changed users" produces no result and you want to rule out missed updates. Coordinate with the LDAP admin before using in production. |

> **Note:** A sync brings LDAP changes *into* Keycloak. It does not push Keycloak changes *out* — that is what edit mode controls. If a user reports "I updated my LDAP password and Keycloak still rejects it," neither sync helps directly: Keycloak does not cache passwords. The cause is likely an unhealthy connection at login time, not a stale sync. (That diagnosis is for module 7.)

### When to escalate instead of syncing

If you sync and the user still does not appear, your two L2 escalation patterns are:

1. **The LDAP entry exists but does not match the realm's user filter.** L2 needs to compare the LDAP entry's attributes to the federation provider's *Custom user LDAP filter* and *User object classes*. L1 should not edit these — they are realm-wide.
2. **The LDAP entry's username collides with an existing local user in Keycloak.** Imports do not silently overwrite — they fail. L1 should gather: the LDAP DN, the username, the timestamp of the sync attempt, and any error in the Server log (which L1 cannot see — L2 will check).

---

## Task 1 — Exercise 6C: Diagnosing a Sync Problem

> Estimated time: 8–12 min | Tools: admin console

**Ticket #5944:** Several tickets are piling up this morning — "I can't find the new partner-org user in Keycloak," "the sync I ran an hour ago did nothing," "is the partner directory down?" The partner team confirms they added new entries last night and that their directory is up. Your job: figure out where the Keycloak → partner-LDAP integration is failing and escalate cleanly with enough evidence for the owning team to act on.

<details>
<summary>Hint — what kind of failure this is</summary>

LDAP sync failures fall into two broad camps:

1. **Cannot authenticate to LDAP at all** — the bind step itself fails (wrong password, expired credential, TLS handshake failure, and so on). The sync never gets as far as reading user entries. In current Keycloak, this case is reported as a *silent no-op*: a green "Sync finished successfully" banner with zero counts. The bind exception is logged on the server but not shown to L1.
2. **Authenticated, but the data did not import** — wrong filter, missing object class, username collision, malformed attribute. Here the banner shows non-zero counts including a non-zero **failed** count.

The clean diagnostic that disambiguates camp 1 from camp 2 is **Test authentication** on the provider's Settings tab. Unlike Synchronize, Test authentication shows the bind error directly in a red banner.

</details>

<details>
<summary>Solution — step-by-step walkthrough</summary>

1. Left nav → **User federation** → `partner-ldap` → **Synchronize changed users**.
2. The banner says *Sync of users finished successfully. 0 users added, 0 users updated, 0 users removed, 0 users failed.* Looks benign — but in 6B on `corp-ldap` the same button imported 4 users on a fresh sync. A silent "0 across the board" against a directory the partner team says has new entries is a tell, not an all-clear.
3. On `partner-ldap`'s **Settings** tab, scroll to the **Connection and authentication settings** section and click **Test authentication**. Red banner: *Error! Authentication failure.* That is the unambiguous bind-stage failure.
4. Read the **Bind DN** field on the same tab — it is `cn=admin,dc=acme,dc=test`. That is the service account whose credentials Keycloak just tried (and failed) to authenticate with.
5. Do **not** edit the **Bind credential** field. Do not retry Test authentication or Sync repeatedly to "see if it clears" — every failed bind may push the locked account deeper.
6. Write the escalation:

   ```
   ESCALATION TO IT OPS — Ticket #5944
   ----------------------------------------
   Realm:               support-sandbox
   Federation provider: partner-ldap
   Bind DN failing:     cn=admin,dc=acme,dc=test
   Symptom:             "Synchronize changed users" silently imports
                        zero users at <timestamp>. "Test authentication"
                        on the same provider returns: "Authentication
                        failure."

   Hypothesis: The Bind DN service account is locked or its password
   was rotated overnight without Keycloak's Bind credential being updated.

   Request: please confirm the account state in AD. If it is locked,
   unlock it (we have not retried, to avoid pushing the lockout counter).
   If the password was rotated, coordinate with us before updating
   Keycloak's Bind credential.
   ```

7. Group the related tickets ("new hire missing," "sync did nothing") under this same parent incident in your ticketing system — they almost certainly share the same root cause and will resolve together once IT Ops fixes the bind account.

> **Note:** A locked Bind DN does NOT lock individual LDAP users out of *logging in* to Keycloak — each user's own LDAP credentials are used for the login bind, not the service account's. The visible symptom is "new hires not appearing" and "previously-synced users still log in fine." If end-users also report they cannot log in at all, the root cause is elsewhere (network, TLS, or the LDAP server itself being down) — that is a different ticket.

</details>

---

## Lab Checkpoint

Verify that all of the following are true before marking this module complete:

- [ ] On `partner-ldap` you observed that **Synchronize changed users** reports "0 imported" silently, then used **Test authentication** to surface the underlying *Authentication failure*. You produced an escalation note naming the Bind DN, the realm, the timestamp, and a hypothesis.

---

## Going Further

- Open the **Mappers** tab on `corp-ldap`. Find the mapper that puts the LDAP `mail` attribute into the Keycloak `email` field. What would you change to also map an LDAP `department` attribute into a Keycloak user attribute?
- Read the Keycloak docs on **Edit mode**. What changes for L1 troubleshooting when the realm uses `WRITABLE` instead of `READ_ONLY`?
- If the realm switched from LDAP to SCIM (a different federation protocol), would any of this module's L1 workflow change? Why or why not?
