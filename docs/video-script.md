# Subscription/Renewal Guard demo video — script and shot list

The narration, shot list and on-screen sources for the demo video. It is rendered as a
frame-exact slideshow: each beat's real on-screen state is captured with a headless
browser and held for the beat's scripted duration, with synthesized narration laid over
it. Every screen is the running app or the real output of a command; nothing on screen is
typed in by hand.

This is the script for the second cut. The first cut (2:10) opened on an idle list and had
no model in the agent seat. This one opens on the flagged state, adds the recorded MCP
session, an owner's keep, the yearly figures and bringing your own subscriptions, and uses
larger terminal text.

## Target runtime

**Scripted length: 2:19 (139.0 s) across 10 beats**, 11 shots. Every duration is
a whole number of 40 ms frames (25 fps), so the rendered file should match the sum. HACK47
states no length cap: its "What to Submit" list says only "Demo Video — show the project
working, explain what was built" (checked 24 Sep 2026).

## Recording setup

Two fresh servers, each on a free loopback port and each started with `npm start`'s own
code (`src/server.js`), with one difference: the process clock starts at the recorded MCP
session's start, `2026-09-27T23:22:01.405Z`, and runs on from there. The seed stores its
dates as offsets from "now", so both servers show exactly the dates that session saw, and
Claude's notes (which quote those dates) match the cards they sit on.

- **Server A** is fresh: beat 1 clicks Run Review on it, and beat 8's two direct HTTP calls
  go to it.
- **Server B** first receives the session's client messages from
  [`mcp-transcript.jsonl`](./mcp-transcript.jsonl), replayed byte for byte through
  `src/mcp.js`. That recreates Claude's three drafts (renegotiate StreamVault Plus, cancel
  CloudBackup Pro, keep PixelCraft Design) and its refused `approve_action`. The render
  stops if any replayed draft fails, if the approve isn't refused, or if the drafts differ.
  Beats 3 to 7 run on server B through the owner link.

Captured before recording, from real commands:

- Beat 2: `node scripts/mcp-relay.js --digest docs/mcp-transcript.jsonl`, one line per
  message of the recorded session.
- Beat 8: two `curl` calls to server A: `approve_action` as `actor: "agent"`, then as
  `actor: "owner"` with no owner token.
- Beat 9: `npm test`. Its test count is the number spoken in that beat's narration.

The hook's spoken figures (44%, six days to renewal, a trial in three days, 116 quiet
days, $48.00 a year) are checked against the recorded session's `review_subscriptions`
response before anything is captured.

## Shot list and narration

| # | Time | On screen | Action | Narration (verbatim) |
|---|------|-----------|--------|----------------------|
| 1 | 0:00–0:18 | Server A, straight to the flagged state: At stake in open flags $347.76/yr, three cards with evidence and yearly figures | Open, click **Run Review** | "A forty-four percent price rise, renewing in six days. A trial that turns paid in three. A backup nobody has opened in a hundred and sixteen days. Subscription/Renewal Guard finds all three, and changes nothing until you click Approve." |
| 2 | 0:18–0:42 | Terminal, font 17: the transcript digest, revealed line by line. Four tools listed, Claude's three `apply_action` notes, then `← error -32602: Unknown tool: approve_action…` | Run the digest command | "This is a real model in the agent's seat: Claude, driving the four agent tools over MCP. It reviews, reads two records, and drafts three actions in its own words. Then, on purpose, it calls approve action, and the server answers: no such tool. There is nothing for it to call." |
| 3 | 0:42–0:50 | Server B through the owner link: Claude's three drafts with its notes, every badge unchanged, $347.76/yr at stake | Open, click **Run Review** | "Its drafts land on the owner's dashboard, and wait. Every status still reads the same." |
| 4 | 0:50–1:01 | StreamVault Plus → **Renegotiation sent**; Decided by you $48.00/yr | Click **Approve** on StreamVault Plus | "One click from the owner, and only now does a status change: renegotiation sent. Forty-eight dollars a year, decided by you." |
| 5 | 1:01–1:10 | CloudBackup Pro's draft cleared, badge still Active, its evidence line back | Click **Reject** on CloudBackup Pro | "The backup might still be backing something up. Reject clears the draft, and nothing is cancelled." |
| 6 | 1:10–1:23 | PixelCraft Design approved as kept: badge Active, Decided by you $227.88/yr; after a second review only CloudBackup Pro is flagged | Click **Approve** on PixelCraft Design, then **Run Review** | "Approve the keep, and the trial becomes a plan you chose. The next review leaves it alone." |
| 7a | 1:23–1:36 | The import panel open, the sample CSV loaded, Replace ticked | Open **Add or import…**, click **Load sample**, tick **Replace the demo subscriptions** | "Bring your own subscriptions: paste a CSV, or add a row. It stays on your machine, and importing is the owner's action, never the agent's." |
| 7b | 1:36–1:41 | The four imported subscriptions reviewed: three flagged, $383.76/yr at stake | Click **Import CSV**, then **Run Review** | (silent) |
| 8 | 1:41–1:56 | Terminal, font 28: `approve_action` as agent → `"approve_action is an owner-only action; no agent tool can approve a draft."` (HTTP 200, `success: false`); as owner with no token → `HTTP 403` | Two `curl` calls | "Skip MCP and post to the server directly? As the agent, approve is refused inside invoke. Claiming to be the owner without this run's owner link gets a four-oh-three." |
| 9 | 1:56–2:07 | Terminal, font 24: `npm test`, 9 suites, all passing | Run `npm test` | "140 tests hold this gate from every angle: the rules, the refusals, the MCP server, the real HTTP layer." (the count is read from the captured run) |
| 10 | 2:07–2:19 | End card: live demo URL, repository URL, MCP transcript link | Hold | "Try it yourself. The live demo runs in your browser, and the code and the transcript are open source. Links are in the description." |

Each narration line was synthesized with `say -r 140` (the render's own voice and rate) on
2026-09-28 and measured. Every line fits its beat with at least 2.3 s to spare; the
tightest are beat 1 (15.5 s of 18 s) and beat 9 (8.7 s of 11 s). The render still warns
if a line runs over. Beat 7b is a silent continuation: the still changes after a click
while the previous line has already finished.

## Timing contingency

If a narration line runs long at render time, trim in this order, keeping the four
required moments (flags with evidence, a real model refused at approve, an owner decision,
a direct-HTTP refusal) and the end card:

1. Beat 1: drop the backup sentence ("A backup nobody has opened…").
2. Beat 2: drop "It reviews, reads two records, and".
3. Beat 9: drop "the MCP server, the real HTTP layer".

## What this script does not show

- `downgrade`, and cancelling for real. Both are tested (`tests/invoke.test.js`,
  `tests/approval-gate.test.js`); the story needs one approve, one reject and one keep.
- The add-one-row form. The CSV path shows the same owner-only import.
- A keep acknowledged on a subscription that stays active. Kept, the trial in beat 6
  becomes a paid plan, so the trial rule stops firing for that reason. The acknowledgement
  itself (the same price rise kept, not flagged again, a new one flagged) is step 8 of the
  README walkthrough and is tested in `tests/invoke.test.js` and
  `tests/pages-build.test.js`.
- The static live demo. It runs the same code bundled into the page, and
  `tests/pages-build.test.js` replays the demo story, the import and a sticky keep against
  the built bundle.
- Threshold boundaries (14% vs 15%, 59 vs 60 days, 8 vs 7 days). `tests/rules.test.js`
  covers them.

## Dry-run verification

On 2026-09-28 the whole capture ran in its preflight mode, without recording: both
servers started with the pinned clock, the transcript replay produced the three drafts
and the refused approve, the three commands were captured, and every browser beat was
driven headless and screenshotted at 1600×900. Checked against
those stills: beat 1 shows $347.76/yr and the three evidence lines; beat 3 shows Claude's
three drafts with every badge unchanged; beat 4 shows Renegotiation sent and $48.00/yr
decided; beat 5 shows CloudBackup Pro Active with its evidence line back; beat 6 shows
PixelCraft Design Active with $227.88/yr decided and only CloudBackup Pro flagged; beat 7b
shows Fernhill Meal Box, Orbitalk Language Club and Lumen Notebook Pro flagged with
$383.76/yr at stake. The terminal beats' final frames, drawn with the recorder's own
terminal page, fill 762 (beat 2), 720 (beat 8) and 768 (beat 9) of the frame's 900 px. No
video or narration was rendered in that pass.
