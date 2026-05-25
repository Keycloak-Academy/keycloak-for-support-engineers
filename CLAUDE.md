# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A curriculum of hands-on **labs** that teach support engineers how to troubleshoot Keycloak. There is no application to build, lint, or test — content is Markdown only.

Two parallel tracks live here:

- **L1 support track (primary)** — `module-0-sandbox-access/` through `module-7-sleuthing-and-escalation/`. A 1-day curriculum for Level 1 support agents who only use the Keycloak admin UI. Designed to run against a **local** Keycloak that each learner brings up with `docker compose up` from the repo root. The realm `support-sandbox` is auto-imported from `sandbox-realm/support-sandbox-realm.json` on first start, and `docker-compose.yml` also runs Mailpit (SMTP catcher) and the `demo-app` claim dashboard.
- **Appendix** — `appendix-a-environment-setup/` is a deeper-dive install lab kept for learners who want to provision Keycloak manually (without compose). It is **not** part of the L1 day; the L1 day starts at `module-0-sandbox-access`.

New labs MUST follow `lab-template.md` at the repo root verbatim, with the module-header convention below.

## Authoring a module (L1 track)

Each module directory's `README.md` starts with a fixed header block, in this exact shape:

```
# Module N: <Title>

- **The Scenario:** "<one or two quoted user-voice ticket lines>"
- **Keycloak Feature:** <where this module lives in the admin UI, e.g. "Users > Credentials tab.">
```

The header is the module's identity — it tells a learner in 3 lines what real ticket they're learning to resolve and which UI surface they will live in for the next 45 minutes. The Scenario and Keycloak Feature lines come from the curriculum plan and must not be paraphrased between revisions.

After the header, the module follows the standard lab template (Prerequisites → Background → Tasks → Lab Checkpoint → Going Further).

### Each exercise = one Task block

Inside a module, each lettered **Exercise** (1A, 1B, 1C…) becomes one `Task N` block in the lab template. Use the exercise letter in the task title, e.g. `## Task 1 — Exercise 1A: The Brute Force Lockout`.

Every exercise opens with a **simulated ticket** as the first line of the task body:

```
**Ticket #<random>:** <user>@acme.test reports that <symptom>.
```

The ticket is the only context the learner has. Hints and Solution drive the investigation from there.

## Authoring a lab (template)

Every lab `README.md` has these sections, in this order, with `---` separators between them:

1. **Title + one-paragraph framing** — describe the *problem* the lab addresses and what the learner will have demonstrated by the end. Do NOT preview the steps ("you will learn to do X by...").
2. **Prerequisites** — checkbox list of *observable* preconditions (e.g., "You can log in to your sandbox realm"), followed by a pointer to the prior lab.
3. **Background** — pure reference material (concept tables, protocol diagrams, "why this matters"). No tasks live here. A learner should be able to return after the tasks to consolidate understanding.
4. **Tasks** — numbered, each with the structure below.
5. **Lab Checkpoint** — checkbox list of observable end-state assertions, plus an optional CLI verification snippet.
6. **Going Further** — open-ended extensions with no hints or solutions.

### Task structure (strict)

Each task block:

```
## Task N — [Exercise NX: Title]

> Estimated time: N–N min | Tools: [admin console / curl / kcadm / OIDC playground / ...]

**Ticket #<random>:** <user>@acme.test reports that <symptom>. <Optional extra context — what they've tried, when it started.>

<details><summary>Hint — [conceptual area]</summary> ... </details>
<details><summary>Hint — [different angle, optional]</summary> ... </details>
<details><summary>Solution — step-by-step walkthrough</summary> ... </details>
```

**Hint vs. solution discipline (load-bearing):**
- **Hints** point the learner toward the right *area* of the product and pose orienting questions. They MUST NOT name exact UI paths, field names, or values. Multiple hints attack the same task from different angles (e.g., "where" vs. "what value and why").
- **Solutions** are exact: precise menu paths, exact field names, complete commands. Include verification steps and a cleanup note (`> **Note:** ...`) whenever the task mutates shared configuration.

### Cross-platform commands

Tasks involving the shell MUST provide both Linux/macOS and Windows (PowerShell) variants when behavior differs. Notable Windows gotcha already encoded in the appendix: when a CLI runs in a *separate* container from the Keycloak server, use `host.docker.internal` instead of `localhost` for host-to-container traffic on Docker Desktop. When the CLI runs *inside* the Keycloak container (`docker exec`), use `localhost`.

### Keycloak runtime conventions

- Default image: `quay.io/keycloak/keycloak:26.5.0`.
- The L1 track runs against the **local docker-compose stack** in the repo root (Keycloak + Mailpit + demo-app). Module 0 is the only module that contains install / start-up steps; modules 1–7 assume the stack is already up and reference fixed `http://localhost:8080` URLs. Do not re-introduce per-learner realm naming (`support-l1-<handle>`) or "trainer-provisioned" framing into the L1 READMEs — the realm is always `support-sandbox`.
- The realm export must import cleanly with no manual edits. That means: no `_comment_*` keys (Keycloak's parser rejects unknown fields), no placeholder values that fail at runtime (e.g. an enabled LDAP federation provider with a placeholder URL — ship it `enabled=false` by default), realm-level flags set so the Module 3B verify-email flow works out of the box (`verifyEmail: true`), and **login + admin events enabled** (`eventsEnabled: true`, `adminEventsEnabled: true`, `adminEventsDetailsEnabled: true`) so Module 1's `invalid_redirect_uri` reproduction, Module 3's "Going Further", and all of Module 7 have data to query.
- Keycloak runs in `start-dev` mode (H2, no HTTPS enforcement). Any lab that starts the server must carry a `> **Note:**` warning that `start-dev` is never for production.
- Default bootstrap creds for labs: `admin` / `admin` via `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD`. Real password discipline is taught as a "Going Further" exercise, not as a baseline requirement (since these are throwaway local environments).
- Admin CLI access in labs uses a host-side `kcadm` alias that wraps `docker exec` into the running container — not a bare-metal Java install. This is intentional (zero JDK dependency for learners).

## Sandbox-realm / TRAINER.md sync rule

Every broken-state user, client, group, or client-scope that a module exercise references **must** be listed in `TRAINER.md` under the matching exercise. `TRAINER.md` is the source of truth for what the sandbox realm contains; `sandbox-realm/support-sandbox-realm.json` is the deliverable that realizes it. Adding a new exercise = adding a row to `TRAINER.md` *and* updating the realm export *and* writing the task block. The three drift out of sync trivially if you skip any of the three.

## Writing tone

- Active voice, action verbs, present tense.
- Frame goals as outcomes the learner can *see*, not steps they should *follow*.
- A learner reading just the **Ticket** should know what success looks like without opening the Solution — write the ticket so the symptom and the desired end-state are both implicit.
