# Devpost submission copy — Subscription/Renewal Guard

**Hackathon:** [HACK47: OFFGRID](https://hack47-offgrid.devpost.com/) ·
**Deadline:** 15 Oct 2026, 12:00 AM EDT (~9:30 AM IST)

This file is the copy for the submission form, the checklist it answers, and the split of
who does what before submitting (see [Who does what before submitting](#who-does-what-before-submitting)).

## Project Name

Subscription/Renewal Guard

## Short Description

An agent watches your subscriptions for a price hike, quiet usage, or a trial about to
convert — and drafts one specific action with the evidence behind it. Nothing changes until
you click Approve.

## Problem

Subscriptions fail in two directions, and the wrong one is the one nobody notices. A
household or small business collects recurring charges the way a drawer collects loose
change — a design tool a contractor set up and never handed off, a backup service whose
price quietly doubled when its promotional rate expired. The person who'd notice the price
hike is the same person too busy to open twelve billing pages a year to check. And the two
ways an automated fix can go wrong don't cost the same: auto-cancel something still in use
and the failure is total (data loss, a locked-out account); auto-approve a renewal that just
jumped 40% and the failure is silent (the card gets charged, and the cancellation window has
already passed by the time anyone notices). A calendar reminder doesn't fix this — it's
inert, carries no evidence, and gets ignored the third time it fires for something that was
fine.

## Solution

Subscription/Renewal Guard reviews tracked subscriptions against three signals — a price
jump since the last renewal, a usage trail gone quiet, a free trial about to convert — and
for anything that trips a threshold, drafts one specific action (keep, downgrade,
renegotiate, or cancel) with the exact evidence that produced it: the price history, the
last-seen usage date, the rule that fired.

Nothing about a subscription's real state changes because the agent drafted something.
`apply_action` can only ever write a *draft* — attempting to smuggle a `status` field into
its own arguments is refused and logged, not silently dropped. Turning a draft into a real
state change is `approve_action`, and it is never registered as a tool an agent can call —
the same structural gate this portfolio's
[CALL-E entry](https://devpost.com/software/supplier-quote-agent) uses for `approve_task`,
applied here to a different kind of irreversible click.

## Demo Link

https://guptachetan1995.github.io/hack47-offgrid/

The full dashboard running in the browser: the same `src/` domain code (`invoke`, store,
rules, tools) bundled into the page, on fictional seeded data. Nothing is sent anywhere, and
reloading resets it. The [demo walkthrough](../README.md#demo-walkthrough) is the path to
click through.

## Source Code

https://github.com/guptachetan1995/hack47-offgrid

## Demo Video

The demo video is linked from this project's Devpost submission. Its script and shot list
are in [`docs/video-script.md`](./video-script.md).

## Tech Stack

- **Node.js 20 LTS**, npm
- **Express** — the local server; one `POST /api/invoke` chokepoint every tool call and
  every dashboard button goes through, plus `GET /api/state`, `GET /api/activity-log` and
  `GET /api/tools`, all answered by [`src/api.js`](../src/api.js)
- **Plain HTML/JS dashboard** — CDN React 18.2.0 via `React.createElement`, served as-is by
  Express, mirrored by a readable JSX source ([`src/dashboard.jsx`](../src/dashboard.jsx))
  kept in sync by hand for review
- **esbuild** (pinned) — bundles the same `src/` domain code into `guard.bundle.js` for the
  static live demo ([`scripts/build-pages.js`](../scripts/build-pages.js))
- **GitHub Pages** — hosts the static live demo from a `gh-pages` branch, pushed manually
  (no CI, no GitHub Actions)
- **In-memory store**, seeded from fictional subscription records — no real billing
  provider, no payment method, no network calls from the domain code
- **Jest** — 59 tests across 6 suites; **ESLint** — lint, clean

## Build Process

Built for a fully open brief ("no fixed theme, no mandatory stack — build what you want to
exist"). The core is four pieces: an in-memory store seeded with 5 fictional subscriptions,
a rules engine evaluating three thresholds (price jump over 15%, usage quiet 60+ days, trial
converting within 7 days), the `invoke(tool, args, actor)` chokepoint every write goes
through, and a dashboard that calls the exact same chokepoint the agent's tools call — there
is no separate code path for the human's Approve/Reject clicks. The owner-only gate
(`approve_action`/`reject_action`) is demonstrated structurally: it's absent from
`GET /api/tools` (agent tool discovery can't even see it), and it refuses any actor but
`owner` even when called directly against the internal `invoke()` function, tested at both
the unit level and over a real HTTP socket.

The live demo came last and reuses that core rather than re-implementing it: the four HTTP
routes were pulled into one module (`src/api.js`) that both Express and an in-browser
transport call, and esbuild bundles it for GitHub Pages. The page's own "Try it as the
agent" panel sends the two calls an over-reaching agent might make (a smuggled `status`, an
agent-actor approve) through that same chokepoint, so both refusals are visible without a
terminal. `tests/pages-build.test.js` runs the full demo story against the built bundle.

What I'd improve next:

- A read-only adapter for one real billing provider behind the same `invoke()` chokepoint,
  so the three rules run on real price and usage history while every state change stays
  owner-only.
- Real authentication for the owner actor. Today `actor` is a request field, which is only
  safe because the server accepts loopback connections alone.
- Persistence for drafts and the activity log across restarts.
- Exposing the four-tool registry over MCP so any tool-calling agent can drive it directly.

## Judging criteria — where to look

| Criterion | Where the evidence is |
|---|---|
| Originality | The evidence-cited draft note (`apply_action` refuses a note that doesn't reference the rule's own numbers) — [README § Tools](../README.md#tools), [`src/invoke.js`](../src/invoke.js) |
| Impact | [Problem](#problem) above — a concrete household/small-business scenario and the asymmetric cost of getting either failure direction wrong |
| Execution | 59 tests passing, lint clean, `verify.sh` runs the real suite, and a working [live demo](https://guptachetan1995.github.io/hack47-offgrid/) — [README § Run locally](../README.md#run-locally) |
| Product Thinking | The dashboard and the agent share one `invoke` chokepoint; `review_subscriptions` doesn't manufacture work on healthy subscriptions — [README § Demo walkthrough](../README.md#demo-walkthrough) |
| Technical Depth | The owner-only gate is structural (tool-registry exclusion + actor check), not a prompt instruction — [`tests/approval-gate.test.js`](../tests/approval-gate.test.js), [README § Architecture](../README.md#architecture) |
| Potential | [README § Architecture](../README.md#architecture) — the same chokepoint pattern extends to any recurring-decision domain, not just subscriptions |

## What this entry does not claim

- **No real billing provider, no payment method, ever.** Only fictional, seeded in-memory
  subscription records — [`fake-data/seed-subscriptions.json`](../fake-data/seed-subscriptions.json).
- **No persistence across restarts.** The store is in-memory; a server restart or a reload
  of the live demo resets to the seeded fixtures.
- **The live demo is static.** GitHub Pages serves the page and the bundled domain code;
  there is no hosted server, and nothing leaves the browser.
- **No bundled language model.** The agent surface is the four-tool registry
  ([`src/tools.js`](../src/tools.js)); the dashboard's Run Review and draft buttons send the
  same calls as `actor: "agent"`.
- **The demo runs against fictional data only.** Evidence that the plumbing and the approval
  gate work, not a real subscription-tracking integration.

## Submission checklist

HACK47's "What to Submit" list (read live 24 Sep 2026 from
<https://hack47-offgrid.devpost.com/>), and where each item is answered:

| Item | Answered by |
|---|---|
| Project Name | [Project Name](#project-name) |
| Short Description — what you built, in 1-2 sentences | [Short Description](#short-description) |
| Problem — what problem, who experiences it | [Problem](#problem) |
| Solution — how the project solves it | [Solution](#solution) |
| Demo Link — a working demo whenever possible | [Demo Link](#demo-link) |
| Source Code — link to the GitHub/GitLab repository | [Source Code](#source-code) |
| Demo Video — show the project working, explain what was built | [Demo Video](#demo-video) |
| Tech Stack — major technologies, APIs, models, tools used | [Tech Stack](#tech-stack) |
| Build Process — what was built during OFFGRID, and what you'd improve next | [Build Process](#build-process) |

## Who does what before submitting

The agent does everything except two steps, and the owner does exactly those two.

**Agent:**

| # | Step |
|---|---|
| 1 | Produce the final demo video from [`docs/video-script.md`](./video-script.md). The agent-produced video is the one submitted, with no owner re-recording, and it is handed over with its YouTube title, description, tags, category and visibility (Public) |
| 2 | Publish this repository publicly at https://github.com/guptachetan1995/hack47-offgrid |
| 3 | Deploy the live demo to https://guptachetan1995.github.io/hack47-offgrid/ and walk the demo path on the live URL |
| 4 | Fill the whole Devpost draft from this file: every field above, the "Try it out" links (repo and live demo), the thumbnail and gallery screenshots |
| 5 | After the owner pastes the YouTube link: add it to the draft, then verify every [checklist](#submission-checklist) line against the live draft, the live demo and the public repo before handing back |

**Owner:**

| # | Step |
|---|---|
| 1 | Upload the agent-produced video to YouTube with visibility **Public**, and paste the link back |
| 2 | Once the agent reports the draft verified: tick the agreement box and click **Submit**, before 15 Oct 2026, 12:00 AM EDT |
