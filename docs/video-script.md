# hack47-offgrid Demo Video — Script & Shot List

This is the script for the demo video: narration text, shot list, the exact seeded state to
start from, and the timing budget. **The agent-produced video is the final video.** It is
rendered from this script as a frame-exact slideshow (each beat's real on-screen state
captured and held for its scripted duration, with synthesized narration muxed over it), and
there is no owner re-recording. The owner's only part is uploading the finished file to
YouTube as Public and pasting the link back.

## Target runtime

**Scripted length: 2:10 (130.0s) across 9 beats. Rendered: 129.998s** (`ffprobe` on the
final H.264/AAC file, 1600×900, 25 fps, rendered 2026-09-26). **No stated cap:** HACK47's own "What to Submit" list only says "Demo Video — show
the project working, explain what was built", and no length ceiling was found on the rules
page (checked live 24 Sep 2026). It is kept tight anyway. Every action here resolves
instantly against an in-memory store, with no network- or provider-bound wait, so the pacing
below follows the narration and the clicks alone. Three beats (1, 3, 8) run slightly longer
than their first-draft narration needed. They were widened after the narration step warned
the TTS would otherwise overrun and get cut off mid-word, and the times below are the
widened, final numbers.

## Recording setup — exact seeded state

One terminal, one browser tab:

```bash
npm install
PORT=3178 npm start   # Subscription/Renewal Guard on http://127.0.0.1:3178
```

Pick a port nothing else on the machine is using (check first with `lsof -i :3178`). The
store is in-memory and changes as the demo runs, so start a fresh instance on its own port
right before recording.

Open `http://127.0.0.1:3178` in a browser window wide enough that no card wraps
awkwardly. Do not click anything before recording starts. The seeded state that must be on
screen at 0:00 is 5 subscriptions, all with no draft and no evidence banner:

| Service | Status | Latest price | Renews / trial ends | Last used |
|---|---|---|---|---|
| StreamVault Plus | Active | $12.99 (was $8.99) | renews 2026-10-01 | 2026-09-22 |
| CloudBackup Pro | Active | $9.99 | renews 2026-10-15 | 2026-06-01 |
| PixelCraft Design | Trial | $0.00 | trial ends 2026-09-28 | 2026-09-24 |
| SonicStream | Active | $5.99 | renews 2026-11-04 | 2026-09-24 |
| SafeVault Storage | Active | $3.99 | renews 2026-11-19 | 2026-09-23 |

The seed stores dates as offsets from today, so the absolute dates above (captured
2026-09-25) move forward with the recording date, and the relationships stay the same.

## Findings from the dry run that shaped this script

These were confirmed before writing any narration, by starting the server fresh
(`PORT=3177`, then a second fresh instance on `PORT=3178` for the browser pass) and walking
the full path, both through direct `POST /api/invoke` calls and in a real browser tab:

- **Exactly 3 of 5 subscriptions trip a rule, as the demo script in the
  [README](../README.md#demo-walkthrough) says**: StreamVault Plus (price jump),
  CloudBackup Pro (quiet usage) and PixelCraft Design (trial converting). SonicStream and
  SafeVault Storage are untouched. `review_subscriptions` returns nothing for them, not a
  "looks fine" placeholder. This is the beat that shows the agent doesn't invent work.
- **Evidence text is copied verbatim from the live API response**, not invented (re-captured
  2026-09-26, after the trial countdown was fixed to round up): `"Price rose 44%
  ($8.99→$12.99) at the 2026-09-02 renewal."`, `"No usage seen since 2026-06-02 (116
  days)."`, `"Trial converts to paid on 2026-09-29 (3 days away)."` The dates, the 116-day
  and the 3-day figures are computed from the real clock at review time, so they move with
  the actual recording date. Read whatever the running app shows, and don't hardcode
  these exact numbers into the narration.
- **The dashboard's own `Reject` button clears the draft without touching `status`.** After
  rejecting CloudBackup Pro's cancel suggestion, its badge reads `Active` again, the same
  as before the draft. The evidence line (`No usage seen since...`) and the action buttons
  come back underneath, because the underlying rule still fires. Only the *draft* was
  cleared.
- **An approved card stops offering actions.** After StreamVault Plus is approved, its badge
  reads "Renegotiation sent", and the evidence line and the Keep/Downgrade/Renegotiate/Cancel
  buttons disappear. The dashboard only shows them for a subscription that is still active
  or on trial. The chokepoint enforces the same rule on its own: `apply_action` on that
  subscription is refused with `sub_streamvault is renegotiation_sent, not active/trial —
  nothing to draft.`, so an approved subscription can't be reopened by a later draft.
- **Both refusal beats can be shown two ways.** The dashboard's own "Try it as the agent"
  panel, below the subscription cards, has two buttons that send the same two calls as
  `actor: "agent"` through the same `invoke()`: **Agent: set status directly** (an
  `apply_action` with a smuggled `status`) and **Agent: approve a draft**. The refusal shows
  in the red alert at the top of the page and in the activity log. The shot list below uses
  a terminal `curl` against the same running server for beats 6–7, because beat 7 also
  needs the `GET /api/tools` listing, which only a direct call shows. The panel also
  appears in any dashboard shot that scrolls below the cards.
- **Exact text confirmed live against a freshly started server (2026-09-25)**:
  - `apply_action` with `status: "cancelled"` smuggled into its own args returns
    `{"success": false, "error": "apply_action cannot set status directly — only
    approve_action can."}`, and the subscription's real `status` is untouched afterward.
  - `approve_action` called with `actor: "agent"` returns `{"success": false, "error":
    "approve_action is an owner-only action; no agent tool can approve a draft."}`.
  - `GET /api/tools` lists exactly 4 tools (`list_subscriptions`, `review_subscriptions`,
    `get_subscription`, `apply_action`). `approve_action` and `reject_action` never appear,
    and every listed tool's description ends with the same sentence: *"Approve and Reject
    are owner-only dashboard actions; no registered tool, including this one, can move a
    subscription out of its drafted state."*
  - The activity log after the full walkthrough shows 7 entries in order: `agent
    review_subscriptions`, `agent apply_action` (draft), `owner approve_action`, `agent
    apply_action` (second draft), `owner reject_action`, `agent apply_action` (refused,
    smuggled status), `agent approve_action` (refused, wrong actor). Each one is attributed
    to the actor that actually made it.

## Shot list & narration

| # | Time | Visual | Action | Narration (verbatim) |
|---|------|--------|--------|------------------------|
| 1 | 0:00–0:11.5 | Browser, idle seeded page, 5 subscriptions, no banners | Hold, no action | "Subscription/Renewal Guard watches your subscriptions for a price hike, quiet usage, or a trial about to convert. Nothing changes until you click Approve. Watch." |
| 2 | 0:11.5–0:26.5 | Browser, click **Run Review**; 3 of 5 cards grow a yellow evidence line and four action buttons | Click Run Review | "Five subscriptions, one click. Three trip a rule — the other two are left alone, because nothing's wrong with them. Each flag carries its own evidence: the exact price change, the exact quiet-usage date, the exact trial deadline." |
| 3 | 0:26.5–0:42.5 | Browser, click **Renegotiate** on StreamVault Plus; draft banner appears with the note and Approve/Reject | Click Renegotiate | "StreamVault Plus jumped 44% at its last renewal — $8.99 to $12.99 — and it's still used weekly. The agent drafts a renegotiate action citing those exact numbers. It's still just a draft." |
| 4 | 0:42.5–0:52.5 | Browser, click **Approve**; badge changes from Active to Renegotiation sent, and the card's evidence line and action buttons go away | Click Approve | "One click to approve, and only now does the real status change — Renegotiation sent. That's the only moment anything about this subscription actually moved." |
| 5a | 0:52.5–1:00.5 | Browser, click **Cancel** on CloudBackup Pro; draft banner with the quiet-usage note | Click Cancel | "CloudBackup Pro hasn't been touched in 116 days — the agent drafts cancel." |
| 5b | 1:00.5–1:12.5 | Browser, click **Reject** on that same draft; badge stays Active, draft banner clears | Click Reject | "But maybe that's wrong: we're on an extended trip, not churned. Reject clears the draft. Status stays Active. No charge either way." |
| 6 | 1:12.5–1:32.5 | Terminal — run the smuggled-status `curl` call, zoom on the `"error"` field | Run the command, pause on the output | "Now try to cheat: call `apply_action` directly, with a `status` field smuggled into the same request. Refused — apply_action can only ever draft. Only approve_action can change a real status, and it's never a tool an agent can call at all." |
| 7 | 1:32.5–1:50.5 | Terminal — run the `GET /api/tools` call, show all 4 tool names, then one description's last sentence | Run the two commands | "Check the agent's own tool list — four tools, and approve_action isn't one of them. Tool discovery can't even see it. Every description ends with the same sentence, so there's no ambiguity about what this system will never let an agent do." |
| 8 | 1:50.5–2:01.5 | Terminal — `npm test` from the entry root, scrolled to the summary line (`Tests: 59 passed, 59 total`) | Run the command, hold on the green summary | "Fifty-nine tests hold this gate from every angle — the rules, the refusals, the real HTTP layer. One button an agent can never press for itself: Approve." |
| 9 | 2:01.5–2:10 | End card: a plain card listing the live demo URL `https://guptachetan1995.github.io/hack47-offgrid/` and the repository URL `https://github.com/guptachetan1995/hack47-offgrid`, no other motion | Hold, no action | "Try it yourself — the live demo runs right in your browser, and the code is open source. Links are in the description." |

Beat 8's terminal lines are captured from a real `npm test` run, never typed by hand. If the
test count changes again, re-capture the shot and update the spoken number to match.

## Timing contingency

Every segment above is either a fixed narration read or a near-instant tool call, with no
real-world step of variable length. If a take runs long, trim in this order without
dropping any of the four required beats (review flags real evidence, a draft gets approved,
a draft gets rejected, a direct-API refusal is shown) or the end card:

1. Shorten Scene 8's line to its first clause ("Fifty-nine tests hold this gate from every
   angle.").
2. Shorten Scene 2's narration by cutting the second sentence. The three evidence lines are
   still readable on screen without being narrated one by one.

## What this script does not show

- `downgrade` and `keep`. Both are real and tested (`tests/invoke.test.js`,
  `tests/approval-gate.test.js`), but the demo walkthrough only exercises `renegotiate` and
  `cancel`. A third or fourth action click would push past the strongest-two-minutes
  framing without adding a beat the demo needs.
- `get_subscription`. It is a read-only agent tool the dashboard never calls, because the
  dashboard reads every subscription from `GET /api/state`, so calling it on camera shows
  nothing new.
- A price-jump, quiet-usage or trial-converting boundary case (14% vs 15%, 59 vs 60 days,
  8 vs 7 days). These are covered by the boundary tests in `tests/rules.test.js`, not a
  visual demo beat.

## Dry-run verification

The full path above was walked end to end against two freshly started server instances
(`PORT=3177` for the direct-API pass, `PORT=3178` for the browser pass, both via
`node src/server.js` after a clean `npm install`):

1. Idle page: 5 subscriptions, no banners.
2. Run Review: 3 of 5 flagged, with evidence text matching the live API response verbatim.
3. Renegotiate drafted on StreamVault Plus.
4. Approve: badge → "Renegotiation sent".
5. Cancel drafted on CloudBackup Pro.
6. Reject: badge back to "Active", draft cleared.
7. Direct `apply_action` call with a smuggled `status` field: refused, exact error text
   quoted above.
8. Direct `approve_action` call as `actor: "agent"`: refused, exact error text quoted above.
9. `GET /api/tools`: 4 tools, `approve_action`/`reject_action` absent.
10. Activity log: 7 entries, each attributed correctly.

Every screenshot, JSON body and log line quoted above is copied from that live run, not
invented. Four browser screenshots were captured (idle page, review-flagged page,
StreamVault draft-with-evidence panel, and final state with activity log), confirming that
the dashboard renders exactly what the API returns.

`npm test` (59 tests, 6 suites) and `bash verify.sh` both pass. The
[README](../README.md#run-locally) has the captured output.

**Render pipeline.** The shots are captured from a freshly started, uniquely ported server
instance. The narration is synthesized per beat, with no overrun warnings after widening
beats 1, 3 and 8 (beat 8's "Fifty-nine" read overran its first 10.5s budget by 80ms, so it
took 0.5s from the end card, whose 7.0s narration still fits its 8.5s). Video and
narration are then muxed; the final file measures 129.998s against the 130.0s shot-list
sum. The browser beats select buttons by exact text (`button:text-is('Approve')`), because
a substring match would also hit the "Agent: approve a draft" button in the agent panel.
