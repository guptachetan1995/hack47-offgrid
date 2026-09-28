# Devpost submission copy — Subscription/Renewal Guard

**Hackathon:** [HACK47: OFFGRID](https://hack47-offgrid.devpost.com/) ·
**Deadline:** 15 Oct 2026, 12:00 AM EDT (~9:30 AM IST)

This file is the text for each field of the Devpost project page, followed by the HACK47
"What to Submit" checklist it answers. Every figure in it comes from the code, the test
run, the recorded MCP session or a linked public source.

## Devpost field: Project name

Subscription/Renewal Guard

## Devpost field: Elevator pitch

An agent flags subscription price hikes, quiet usage and converting trials, and drafts one action with the evidence. Any MCP agent can draft; only your click approves.

## Devpost field: About the project

The story field, under Devpost's own headings.

### Inspiration

Subscriptions fail in two directions, and the wrong one is the one nobody notices. In a
2022 C+R Research survey of 1,000 consumers, 42% said they had stopped using a
subscription but forgot they were still paying for it, and people who estimated their
subscription spend at $86 a month were spending $219 once it was itemized
([source](https://www.crresearch.com/blog/subscription-service-statistics-and-costs/)).
The person who would notice a price hike is the same person too busy to open twelve
billing pages a year. And the two ways an automated fix can go wrong don't cost the same:
auto-cancel something still in use and the failure is total (data loss, a locked-out
account); let a renewal that just jumped 44% go through and the failure is silent (the
card is charged, and the cancellation window has passed by the time anyone notices).

An agent for this already exists, and it asks before acting. Rocket Money's Rowan,
announced on 25 Aug 2026, texts a member before a trial turns paid, and cancels it when the
member replies "cancel"
([press release](https://www.prnewswire.com/news-releases/rocket-moneys-rowan-rewrites-what-ai-can-do-in-personal-finance-302859522.html)).
There, the go-ahead is a reply in the same conversation the agent reads. This project takes
the other route: the approval is not something the agent can be told, because approving is
not something it has a tool for.

### What it does

Subscription/Renewal Guard reviews your subscriptions against three rules: a price rise of
more than 15% since the last renewal, no usage in 60+ days, and a free trial converting
within 7 days. For each subscription that trips one, it shows the evidence and what it is
worth a year, for example "Price rose 44% ($8.99→$12.99) at the 2026-09-03 renewal
(+$48.00/yr)", and the agent drafts one action: keep, downgrade, renegotiate or cancel.
The dashboard totals what is at stake in open flags and what you have decided.
Subscriptions with nothing wrong get nothing back.

Drafting never changes a subscription. apply_action can only write a draft: a status field
smuggled into its arguments is refused and logged, and a note that doesn't quote one of the
rule's own figures is refused too ("cancel this trial" cites nothing). Approve, Reject and
Import are owner-only and are never registered as tools, so no agent can call them, whether
it is the dashboard's own agent buttons or a real model over MCP. An approved keep stays
quiet until something new happens; an approved cancel, downgrade or renegotiate can't be
reopened by a later draft.

It is local-first, which is the OFFGRID half of the idea: no bank login, no account, no
aggregator. You can try it on your own subscriptions: the live demo takes a pasted CSV, or
one row at a time, parses it in the browser and never sends it anywhere.

### How we built it

No model is bundled, and that is deliberate. The agent's side is a four-tool registry
(list, review, get, draft) that any tool-calling model can drive, served over the Model
Context Protocol by a small stdio server (node src/mcp.js). It is a thin front on the
dashboard server: tools/list is the registry, and tools/call posts to the same
invoke(tool, args, actor) chokepoint the dashboard's buttons use, with the actor fixed to
"agent". The repo includes a recorded session with Claude (Anthropic) in that seat, run in
Claude Code, the same AI coding agent that wrote the code, so it is a demonstration rather
than an independent test. It reviewed the subscriptions and drafted three actions in its
own words. Then, having just seen that approve_action is not in its tool list, it called
it on purpose and was refused, and its drafts waited on the dashboard for the owner. On
the dashboard itself, Run Review and the draft buttons make the same calls as the agent.

Under that: an in-memory store seeded with 5 fictional subscriptions, a rules engine with
the three thresholds and their yearly figures, a CSV and form importer that validates every
row before adding any, and one invoke() that every write goes through, with an activity
log recording each call's actor, refusals included. Stack: Node.js 20 and Express (one
POST /api/invoke plus read-only routes, all answered by one api.js), a plain React 18
dashboard script served as-is with no build step, and esbuild to bundle the same src/ code
into the page for the GitHub Pages live demo, which runs with no server at all. 140 Jest
tests and ESLint. The code was written with Claude Code, Anthropic's AI coding agent.

### Challenges we ran into

The owner-only gate had to be more than a prompt instruction, since an agent will
eventually see real subscription data. It is structural: approve, reject and import are
absent from the agent's tool registry, so neither GET /api/tools nor the MCP server can
surface them, and invoke() refuses any actor but owner even when called directly. An
earlier version still had a hole over HTTP: actor was just a field in the request, so a
local process could post actor "owner" and approve. Now owner actions over HTTP also need
a random per-run token that npm start prints only inside the owner link's #fragment,
which browsers never send to the server. That is a single-user local check, not accounts:
whoever can read that terminal is the owner.

The other challenge was running the demo in the browser without forking the logic. The
in-memory store hands out live object references, which HTTP serializes away but which,
in-page, would make React skip re-rendering. Every in-page response is JSON round-tripped
exactly as HTTP would, so both transports behave the same.

### Accomplishments that we're proud of

A real model sat in the agent seat and could not approve its own draft, and the reason is
structural: the tool doesn't exist for it. The recorded session shows the exact refusal.
The dashboard and the agent share one invoke chokepoint, so auditing one function covers
both. Every draft cites the numbers that produced it, and anyone can bring their own
subscriptions to the live demo instead of taking the seeded ones on faith. 140 tests hold
it: the rules and their boundaries, the refusals, the real HTTP layer, the MCP server over
stdio, and the demo story replayed against the built bundle the live demo serves.

### What we learned

The two failure directions for a subscriptions agent, auto-cancel (total, immediate) and
auto-approving a bad renewal (silent, delayed), aren't symmetric, and treating them as if
they were is how a "helpful" agent causes real harm. The fix isn't more automation, it's a
structural gate that makes the irreversible click a human's alone. And an actor field is
only a gate inside one process: over HTTP it is a claim, which is why owner actions there
now need the per-run owner token.

### What's next for Subscription/Renewal Guard

The first real data source is the one people already have, a card or bank statement CSV
export, so nothing needs a bank login. The first users are households, and small
businesses paying for many SaaS seats, where one quiet price rise repeats across every
seat.

- A mapper from common card and bank CSV exports to the import format, still in the browser.
- Renewal and receipt emails, parsed locally, to fill in price history and renewal dates.
- A read-only adapter for one real billing provider behind the same invoke() chokepoint:
  real price and usage history, every state change still owner-only.
- Persistence for subscriptions, drafts, decisions and the activity log.
- Real owner authentication for a hosted, multi-device version, replacing the per-run owner link.

## Devpost field: Built with

esbuild, eslint, express.js, github-pages, javascript, jest, model-context-protocol,
node.js, react, claude

## Devpost field: "Try it out" links

- https://guptachetan1995.github.io/hack47-offgrid/ (live demo)
- https://github.com/guptachetan1995/hack47-offgrid (source)
- https://github.com/guptachetan1995/hack47-offgrid/blob/main/docs/mcp-transcript.md (the recorded MCP session)

## Devpost field: Video demo link

https://youtu.be/hkDpW_DNd00

## Devpost field: Image gallery

Thumbnail: [`docs/media/gallery-card.png`](./media/gallery-card.png) (1500×1000, 3:2),
rendered from [`docs/media/gallery-card.html`](./media/gallery-card.html).

Images, with captions:

| Image | Caption |
|---|---|
| [`gallery-card.png`](./media/gallery-card.png) | The agent drafts. Only the owner's click approves, and no agent has an approve tool. |
| [`review-with-money-at-stake.png`](./media/review-with-money-at-stake.png) | One review on the live demo: 3 of 5 flagged, each with its evidence and yearly figure. $347.76/yr at stake in open flags. |
| [`mcp-drafts-awaiting-owner.png`](./media/mcp-drafts-awaiting-owner.png) | Claude (Anthropic), run in Claude Code, drove the four agent tools over MCP and drafted these three actions in its own words. It then called approve_action on purpose and was refused; the drafts wait for the owner. |
| [`import-your-own-csv.png`](./media/import-your-own-csv.png) | Bring your own subscriptions: paste a CSV or add a row. It is parsed in the browser and never leaves the page. |

## HACK47 "What to Submit" checklist

Read live 24 Sep 2026 from <https://hack47-offgrid.devpost.com/>, and where each item is
answered on the Devpost page:

| Item | Answered by |
|---|---|
| Project Name | [Project name](#devpost-field-project-name) |
| Short Description — what you built, in 1-2 sentences | [Elevator pitch](#devpost-field-elevator-pitch) |
| Problem — what problem, who experiences it | [Inspiration](#inspiration) |
| Solution — how the project solves it | [What it does](#what-it-does) |
| Demo Link — a working demo whenever possible | ["Try it out" links](#devpost-field-try-it-out-links): the live demo |
| Source Code — link to the GitHub/GitLab repository | ["Try it out" links](#devpost-field-try-it-out-links): the repository |
| Demo Video — show the project working, explain what was built | [Video demo link](#devpost-field-video-demo-link) |
| Tech Stack — major technologies, APIs, models, tools used | [How we built it](#how-we-built-it) and [Built with](#devpost-field-built-with) |
| Build Process — what was built during OFFGRID, and what you'd improve next | [How we built it](#how-we-built-it) and [What's next](#whats-next-for-subscriptionrenewal-guard) |

## Judging criteria — where to look

| Criterion | Where the evidence is |
|---|---|
| Originality | The approval gate an agent can't be talked into: approve is not in its tool list, shown by a real model over MCP ([transcript](./mcp-transcript.md)); contrasted with reply-to-approve agents in [Inspiration](#inspiration) |
| Impact | [Inspiration](#inspiration): the C+R Research figures and the asymmetric cost of the two failure directions; each flag's yearly figure and the at-stake total on the dashboard |
| Execution | 140 tests passing, lint clean, `verify.sh` runs the real suite, and a working [live demo](https://guptachetan1995.github.io/hack47-offgrid/) that also takes your own CSV — [README § Run locally](../README.md#run-locally) |
| Product Thinking | Bring-your-own subscriptions, a keep that sticks, yearly figures, and one `invoke` chokepoint for the dashboard and the agent — [README § Demo walkthrough](../README.md#demo-walkthrough) |
| Technical Depth | The gate is structural (tool-registry exclusion, actor check, per-run owner token over HTTP), and the MCP server is a thin front on the same chokepoint — [`tests/approval-gate.test.js`](../tests/approval-gate.test.js), [`tests/mcp.test.js`](../tests/mcp.test.js), [README § Architecture](../README.md#architecture) |
| Potential | [What's next](#whats-next-for-subscriptionrenewal-guard): statement CSV exports first, then receipts and a read-only billing adapter, for households and many-seat small businesses |

## What this entry does not claim

- **No real billing provider, no payment method, ever.** Seeded fictional subscriptions
  ([`fake-data/seed-subscriptions.json`](../fake-data/seed-subscriptions.json)) or ones the
  owner types or pastes in; nothing is read from a bank or an inbox.
- **No persistence across restarts.** The store is in-memory; a server restart or a reload
  of the live demo resets to the seeded fixtures.
- **The live demo is static.** GitHub Pages serves the page and the bundled domain code;
  there is no hosted server, and nothing leaves the browser. The MCP server needs the
  local server (`npm start`).
- **No bundled language model.** The agent surface is the four-tool registry
  ([`src/tools.js`](../src/tools.js)), served over MCP by [`src/mcp.js`](../src/mcp.js).
  The recorded session is one run of Claude through a small relay client
  ([`scripts/mcp-relay.js`](../scripts/mcp-relay.js)), in Claude Code, which also wrote the
  code; the MCP server has not been tried with Claude Desktop or other clients.
- **The owner check is single-user and local.** The per-run owner link stops an agent or
  script that doesn't have it; it is not multi-user authentication.
- **Yearly figures are estimates from the price history**, monthly unless marked yearly,
  and describe what a finding concerns, not a promised saving.
