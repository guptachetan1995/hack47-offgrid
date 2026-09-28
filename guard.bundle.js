var GuardLocal = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // fake-data/seed-subscriptions.json
  var require_seed_subscriptions = __commonJS({
    "fake-data/seed-subscriptions.json"(exports, module) {
      module.exports = [
        {
          id: "sub_streamvault",
          service: "StreamVault Plus",
          status: "active",
          priceHistory: [
            { amount: 8.99, currency: "USD", effectiveFromDaysAgo: 450 },
            { amount: 12.99, currency: "USD", effectiveFromDaysAgo: 24 }
          ],
          renewalInDays: 6,
          lastUsedAtDaysAgo: 3,
          trialEndsInDays: null
        },
        {
          id: "sub_cloudbackup",
          service: "CloudBackup Pro",
          status: "active",
          priceHistory: [
            { amount: 9.99, currency: "USD", effectiveFromDaysAgo: 600 }
          ],
          renewalInDays: 20,
          lastUsedAtDaysAgo: 116,
          trialEndsInDays: null
        },
        {
          id: "sub_designtool",
          service: "PixelCraft Design",
          status: "trial",
          priceHistory: [
            { amount: 0, currency: "USD", effectiveFromDaysAgo: 11 }
          ],
          renewalInDays: null,
          lastUsedAtDaysAgo: 1,
          trialEndsInDays: 3,
          trialPrice: 14.99
        },
        {
          id: "sub_musicapp",
          service: "SonicStream",
          status: "active",
          priceHistory: [
            { amount: 5.99, currency: "USD", effectiveFromDaysAgo: 400 }
          ],
          renewalInDays: 40,
          lastUsedAtDaysAgo: 1,
          trialEndsInDays: null
        },
        {
          id: "sub_cloudstorage",
          service: "SafeVault Storage",
          status: "active",
          priceHistory: [
            { amount: 3.99, currency: "USD", effectiveFromDaysAgo: 380 }
          ],
          renewalInDays: 55,
          lastUsedAtDaysAgo: 2,
          trialEndsInDays: null
        }
      ];
    }
  });

  // src/store.js
  var require_store = __commonJS({
    "src/store.js"(exports, module) {
      var seed = require_seed_subscriptions();
      var DAY_MS = 24 * 60 * 60 * 1e3;
      var daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString();
      var daysFromNow = (n) => new Date(Date.now() + n * DAY_MS).toISOString();
      function materialize(entry) {
        return {
          id: entry.id,
          service: entry.service,
          status: entry.status,
          billing: entry.billing || "monthly",
          priceHistory: entry.priceHistory.map((p) => ({
            amount: p.amount,
            currency: p.currency,
            effectiveFrom: daysAgo(p.effectiveFromDaysAgo).slice(0, 10)
          })),
          renewalDate: entry.renewalInDays == null ? null : daysFromNow(entry.renewalInDays).slice(0, 10),
          lastUsedAt: entry.lastUsedAtDaysAgo == null ? null : daysAgo(entry.lastUsedAtDaysAgo),
          trialEndsAt: entry.trialEndsInDays == null ? null : daysFromNow(entry.trialEndsInDays),
          trialPrice: entry.trialPrice == null ? null : entry.trialPrice,
          draftAction: null,
          draftNote: null,
          draftedAt: null,
          acknowledged: [],
          decision: null
        };
      }
      var state = {
        subscriptions: seed.map(materialize),
        activityLog: []
      };
      function reset() {
        state.subscriptions = seed.map(materialize);
        state.activityLog = [];
      }
      function listSubscriptions(status) {
        return status ? state.subscriptions.filter((s) => s.status === status) : state.subscriptions;
      }
      function getSubscription(id) {
        const sub = state.subscriptions.find((s) => s.id === id);
        if (!sub) {
          throw new Error(`Subscription ${id} not found`);
        }
        return sub;
      }
      function addSubscriptions(records, { replace = false } = {}) {
        if (replace) {
          state.subscriptions = [];
        }
        state.subscriptions.push(...records);
        return records;
      }
      function updateSubscription(id, updates) {
        const sub = getSubscription(id);
        Object.assign(sub, updates);
        return sub;
      }
      var snapshot = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
      var ActivityLog = class {
        log(tool, args, actor, result) {
          const entry = { timestamp: (/* @__PURE__ */ new Date()).toISOString(), actor, tool, args: snapshot(args), result: snapshot(result) };
          state.activityLog.push(entry);
          return entry;
        }
        getAll() {
          return state.activityLog;
        }
      };
      var activityLog = new ActivityLog();
      module.exports = { listSubscriptions, getSubscription, addSubscriptions, updateSubscription, activityLog, state, reset };
    }
  });

  // src/rules.js
  var require_rules = __commonJS({
    "src/rules.js"(exports, module) {
      var PRICE_JUMP_THRESHOLD = 0.15;
      var QUIET_USAGE_DAYS = 60;
      var TRIAL_SOON_DAYS = 7;
      var DAY_MS = 24 * 60 * 60 * 1e3;
      var daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / DAY_MS);
      var money = (n) => `$${n.toFixed(2)}`;
      var dayCount = (n) => `${n} day${n === 1 ? "" : "s"}`;
      var chargesPerYear = (sub) => sub.billing === "yearly" ? 1 : 12;
      var perYear = (sub, amount) => Math.round(amount * chargesPerYear(sub) * 100) / 100;
      var latestPrice = (sub) => sub.priceHistory[sub.priceHistory.length - 1].amount;
      function checkPriceJump(sub) {
        const hist = sub.priceHistory;
        if (!Array.isArray(hist) || hist.length < 2) {
          return null;
        }
        const [prev, latest] = hist.slice(-2);
        if (!prev.amount) {
          return null;
        }
        const pct = (latest.amount - prev.amount) / prev.amount;
        if (pct <= PRICE_JUMP_THRESHOLD) {
          return null;
        }
        const pctStr = `${Math.round(pct * 100)}%`;
        const annualImpact = perYear(sub, latest.amount - prev.amount);
        return {
          rule: "price_jump",
          message: `Price rose ${pctStr} (${money(prev.amount)}\u2192${money(latest.amount)}) at the ${latest.effectiveFrom} renewal (+${money(annualImpact)}/yr).`,
          tokens: [money(prev.amount), money(latest.amount), pctStr],
          key: `${prev.amount}->${latest.amount}@${latest.effectiveFrom}`,
          annualImpact
        };
      }
      function checkQuietUsage(sub, now) {
        if (sub.status !== "active" || !sub.lastUsedAt) {
          return null;
        }
        const days = daysBetween(now, new Date(sub.lastUsedAt));
        if (days < QUIET_USAGE_DAYS) {
          return null;
        }
        const lastUsed = sub.lastUsedAt.slice(0, 10);
        const annualImpact = perYear(sub, latestPrice(sub));
        return {
          rule: "quiet_usage",
          message: `No usage seen since ${lastUsed} (${days} days); it costs ${money(annualImpact)}/yr.`,
          tokens: [lastUsed, dayCount(days)],
          key: lastUsed,
          annualImpact
        };
      }
      function checkTrialConverting(sub, now) {
        if (sub.status !== "trial" || !sub.trialEndsAt) {
          return null;
        }
        const msLeft = new Date(sub.trialEndsAt).getTime() - now.getTime();
        const days = Math.ceil(msLeft / DAY_MS);
        if (msLeft < 0 || days > TRIAL_SOON_DAYS) {
          return null;
        }
        const endsOn = sub.trialEndsAt.slice(0, 10);
        const hasPrice = typeof sub.trialPrice === "number";
        const annualImpact = hasPrice ? perYear(sub, sub.trialPrice) : null;
        return {
          rule: "trial_converting",
          message: `Trial converts to paid on ${endsOn} (${dayCount(days)} away)${hasPrice ? `, then ${money(annualImpact)}/yr` : ""}.`,
          tokens: hasPrice ? [endsOn, dayCount(days), money(sub.trialPrice)] : [endsOn, dayCount(days)],
          key: endsOn,
          annualImpact
        };
      }
      var CHECKS = [checkPriceJump, checkQuietUsage, checkTrialConverting];
      function reviewSubscription(sub, now = /* @__PURE__ */ new Date()) {
        return CHECKS.map((check) => check(sub, now)).filter(Boolean);
      }
      function annualAtStake(findings) {
        return findings.reduce((max, f) => Math.max(max, f.annualImpact || 0), 0);
      }
      function citesEvidence(note, tokens) {
        const text = String(note || "");
        return tokens.some((token) => {
          for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + 1)) {
            const before = text[at - 1] || "";
            const after = text[at + token.length] || "";
            if (!/[\w.]/.test(before) && !/\w/.test(after)) {
              return true;
            }
          }
          return false;
        });
      }
      module.exports = {
        reviewSubscription,
        annualAtStake,
        citesEvidence,
        checkPriceJump,
        checkQuietUsage,
        checkTrialConverting,
        PRICE_JUMP_THRESHOLD,
        QUIET_USAGE_DAYS,
        TRIAL_SOON_DAYS
      };
    }
  });

  // src/import.js
  var require_import = __commonJS({
    "src/import.js"(exports, module) {
      var COLUMNS = ["service", "prices", "renewalDate", "lastUsedAt", "trialEndsAt", "trialPrice", "billing"];
      var MAX_ROWS = 200;
      var DAY_MS = 24 * 60 * 60 * 1e3;
      var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      var AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
      function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = "";
        let quoted = false;
        const src = String(text).replace(/^\uFEFF/, "");
        for (let i = 0; i < src.length; i++) {
          const c = src[i];
          if (quoted) {
            if (c === '"' && src[i + 1] === '"') {
              field += '"';
              i++;
            } else if (c === '"') {
              quoted = false;
            } else {
              field += c;
            }
          } else if (c === '"') {
            quoted = true;
          } else if (c === ",") {
            row.push(field);
            field = "";
          } else if (c === "\n" || c === "\r") {
            if (c === "\r" && src[i + 1] === "\n") {
              i++;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
          } else {
            field += c;
          }
        }
        if (quoted) {
          throw new Error("CSV has an unclosed double quote.");
        }
        row.push(field);
        rows.push(row);
        return rows.filter((r) => r.some((f) => f.trim() !== ""));
      }
      function csvToRows(text) {
        const [header, ...data] = parseCsv(text);
        if (!header) {
          throw new Error("CSV is empty.");
        }
        const names = header.map((h) => {
          const name = COLUMNS.find((c) => c.toLowerCase() === h.trim().toLowerCase());
          if (!name) {
            throw new Error(`Unknown CSV column "${h.trim()}". Columns: ${COLUMNS.join(", ")}.`);
          }
          return name;
        });
        const repeated = names.find((n, i) => names.indexOf(n) !== i);
        if (repeated) {
          throw new Error(`CSV column "${repeated}" appears more than once in the header.`);
        }
        return data.map((cells) => Object.fromEntries(names.map((n, i) => [n, (cells[i] || "").trim()])));
      }
      function validDate(value, label, rowLabel) {
        if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || (/* @__PURE__ */ new Date(`${value}T00:00:00Z`)).toISOString().slice(0, 10) !== value) {
          throw new Error(`${rowLabel}: ${label} must be a YYYY-MM-DD date, got "${value}".`);
        }
        return value;
      }
      function parsePrices(value, rowLabel) {
        const entries = String(value || "").split(";").map((p) => p.trim()).filter(Boolean);
        if (entries.length === 0) {
          throw new Error(`${rowLabel}: prices is required, e.g. 8.99@2025-06-01;12.99@2026-09-01.`);
        }
        return entries.map((entry) => {
          const [amount, date] = entry.split("@").map((s) => (s || "").trim().replace(/^\$/, ""));
          if (!AMOUNT_RE.test(amount) || !date) {
            throw new Error(`${rowLabel}: each price must look like 12.99@2026-09-01, got "${entry}".`);
          }
          return { amount: Number(amount), currency: "USD", effectiveFrom: validDate(date, "a price date", rowLabel) };
        }).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      }
      var slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "item";
      function toSubscription(row, rowLabel, takenIds, today) {
        const service = String(row.service || "").trim();
        if (!service || service.length > 80) {
          throw new Error(`${rowLabel}: service is required (at most 80 characters).`);
        }
        const optionalDate = (key) => row[key] ? validDate(String(row[key]).trim(), key, rowLabel) : null;
        const billing = String(row.billing || "monthly").trim().toLowerCase();
        if (billing !== "monthly" && billing !== "yearly") {
          throw new Error(`${rowLabel}: billing must be monthly or yearly, got "${row.billing}".`);
        }
        const trialPriceText = String(row.trialPrice || "").trim().replace(/^\$/, "");
        if (trialPriceText && !AMOUNT_RE.test(trialPriceText)) {
          throw new Error(`${rowLabel}: trialPrice must be an amount like 14.99, got "${row.trialPrice}".`);
        }
        const trialEnds = optionalDate("trialEndsAt");
        if (trialEnds && trialEnds < today) {
          throw new Error(
            `${rowLabel}: trialEndsAt ${trialEnds} has already passed. If the trial became a paid plan, leave trialEndsAt empty and put the paid price in prices.`
          );
        }
        const lastUsed = optionalDate("lastUsedAt");
        let id = `sub_${slug(service)}`;
        for (let n = 2; takenIds.has(id); n++) {
          id = `sub_${slug(service)}_${n}`;
        }
        takenIds.add(id);
        return {
          id,
          service,
          status: trialEnds ? "trial" : "active",
          billing,
          priceHistory: parsePrices(row.prices, rowLabel),
          renewalDate: optionalDate("renewalDate"),
          lastUsedAt: lastUsed ? `${lastUsed}T00:00:00.000Z` : null,
          trialEndsAt: trialEnds ? `${trialEnds}T00:00:00.000Z` : null,
          trialPrice: trialPriceText ? Number(trialPriceText) : null,
          draftAction: null,
          draftNote: null,
          draftedAt: null,
          acknowledged: [],
          decision: null
        };
      }
      function importRecords({ csv, rows } = {}, existingIds = [], now = /* @__PURE__ */ new Date()) {
        if (csv === void 0 === (rows === void 0)) {
          throw new Error("import_subscriptions takes exactly one of csv (text) or rows (a list).");
        }
        const input = csv !== void 0 ? csvToRows(csv) : rows;
        if (!Array.isArray(input) || input.length === 0) {
          throw new Error("Nothing to import: no data rows.");
        }
        if (input.length > MAX_ROWS) {
          throw new Error(`At most ${MAX_ROWS} subscriptions per import, got ${input.length}.`);
        }
        const taken = new Set(existingIds);
        const first = csv !== void 0 ? 2 : 1;
        const today = now.toISOString().slice(0, 10);
        return input.map((row, i) => toSubscription(row || {}, `Row ${i + first}`, taken, today));
      }
      function sampleCsv(now = /* @__PURE__ */ new Date()) {
        const day = (offset) => new Date(now.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
        return [
          COLUMNS.join(","),
          `Fernhill Meal Box,59.99@${day(-400)};69.99@${day(-12)},${day(18)},${day(-2)},,,monthly`,
          `Orbitalk Language Club,12.99@${day(-300)},${day(9)},${day(-94)},,,monthly`,
          `Lumen Notebook Pro,0@${day(-9)},,${day(-1)},${day(5)},8.99,monthly`,
          `Tidewire VPN,59.99@${day(-200)},${day(165)},${day(-1)},,,yearly`
        ].join("\n") + "\n";
      }
      module.exports = { parseCsv, csvToRows, importRecords, sampleCsv, COLUMNS, MAX_ROWS };
    }
  });

  // src/invoke.js
  var require_invoke = __commonJS({
    "src/invoke.js"(exports, module) {
      var store = require_store();
      var { reviewSubscription, annualAtStake, citesEvidence } = require_rules();
      var { importRecords } = require_import();
      var VALID_ACTIONS = ["keep", "downgrade", "renegotiate", "cancel"];
      async function invoke(tool, args, actor) {
        if (!actor) {
          throw new Error("actor required");
        }
        let result;
        try {
          switch (tool) {
            case "list_subscriptions":
              result = store.listSubscriptions(args && args.status);
              break;
            case "review_subscriptions":
              result = reviewAll();
              break;
            case "get_subscription":
              result = store.getSubscription(args.id);
              break;
            case "apply_action":
              result = applyAction(args);
              break;
            case "approve_action":
              result = approveAction(args, actor);
              break;
            case "reject_action":
              result = rejectAction(args, actor);
              break;
            case "import_subscriptions":
              result = importSubscriptions(args, actor);
              break;
            default:
              throw new Error(`Unknown tool: ${tool}`);
          }
          store.activityLog.log(tool, args, actor, result);
          return {
            success: true,
            result,
            activity: store.activityLog.getAll()[store.activityLog.getAll().length - 1]
          };
        } catch (error) {
          const errorResult = { error: error.message };
          store.activityLog.log(tool, args, actor, errorResult);
          return {
            success: false,
            error: error.message,
            activity: store.activityLog.getAll()[store.activityLog.getAll().length - 1]
          };
        }
      }
      function isReviewable(sub) {
        return sub.status === "active" || sub.status === "trial";
      }
      function openFindings(sub, now) {
        const acknowledged = sub.acknowledged || [];
        return reviewSubscription(sub, now).filter(
          (f) => !acknowledged.some((a) => a.rule === f.rule && a.key === f.key)
        );
      }
      function reviewAll() {
        const now = /* @__PURE__ */ new Date();
        return store.listSubscriptions().filter(isReviewable).map((s) => {
          const firedRules = openFindings(s, now);
          return { id: s.id, service: s.service, firedRules, annualAtStake: annualAtStake(firedRules) };
        }).filter((r) => r.firedRules.length > 0);
      }
      function applyAction({ id, action, note, status } = {}) {
        if (status !== void 0) {
          throw new Error("apply_action cannot set status directly \u2014 only approve_action can.");
        }
        if (!VALID_ACTIONS.includes(action)) {
          throw new Error(`action must be one of ${VALID_ACTIONS.join("/")}, got "${action}"`);
        }
        const sub = store.getSubscription(id);
        if (!isReviewable(sub)) {
          throw new Error(`${id} is ${sub.status}, not active/trial \u2014 nothing to draft.`);
        }
        const fired = openFindings(sub, /* @__PURE__ */ new Date());
        if (fired.length === 0) {
          throw new Error(
            `${id} has no currently-fired rule (no price jump, no quiet usage, no trial converting, or the owner already approved keeping it as it is) \u2014 apply_action only drafts against a subscription review_subscriptions actually flagged.`
          );
        }
        const allTokens = fired.flatMap((f) => f.tokens);
        if (!citesEvidence(note, allTokens)) {
          throw new Error(
            `note must cite the specific evidence a fired rule produced (one of: ${allTokens.join(", ")}) \u2014 a note that doesn't reference what was actually found is refused.`
          );
        }
        return store.updateSubscription(id, {
          draftAction: action,
          draftNote: note,
          draftedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      function requireOwner(tool, actor, what) {
        if (actor !== "owner") {
          throw new Error(`${tool} is an owner-only action; no agent tool can ${what}.`);
        }
      }
      function approveAction({ id } = {}, actor) {
        requireOwner("approve_action", actor, "approve a draft");
        const sub = store.getSubscription(id);
        if (!sub.draftAction) {
          throw new Error(`${id} has no draft to approve.`);
        }
        const findings = openFindings(sub, /* @__PURE__ */ new Date());
        const nextStatus = {
          keep: "active",
          downgrade: "downgraded",
          renegotiate: "renegotiation_sent",
          cancel: "cancelled"
        }[sub.draftAction];
        const acknowledged = sub.draftAction === "keep" ? [...sub.acknowledged || [], ...findings.map((f) => ({ rule: f.rule, key: f.key }))] : sub.acknowledged || [];
        return store.updateSubscription(id, {
          status: nextStatus,
          acknowledged,
          decision: {
            action: sub.draftAction,
            annualAtStake: annualAtStake(findings),
            decidedAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          draftAction: null,
          draftNote: null,
          draftedAt: null
        });
      }
      function rejectAction({ id } = {}, actor) {
        requireOwner("reject_action", actor, "reject a draft");
        const sub = store.getSubscription(id);
        if (!sub.draftAction) {
          throw new Error(`${id} has no draft to reject.`);
        }
        return store.updateSubscription(id, { draftAction: null, draftNote: null, draftedAt: null });
      }
      function importSubscriptions({ csv, rows, replace = false } = {}, actor) {
        requireOwner("import_subscriptions", actor, "add subscriptions");
        const existing = replace ? [] : store.listSubscriptions().map((s) => s.id);
        const records = importRecords({ csv, rows }, existing);
        store.addSubscriptions(records, { replace: Boolean(replace) });
        return { added: records.map((r) => r.id), replaced: Boolean(replace), total: store.listSubscriptions().length };
      }
      module.exports = { invoke };
    }
  });

  // src/tools.js
  var require_tools = __commonJS({
    "src/tools.js"(exports, module) {
      var { invoke } = require_invoke();
      var OWNER_ONLY_CLAUSE = "Approve, Reject and Import are owner-only dashboard actions; no registered tool, including this one, can change a subscription's real status or add a subscription.";
      var tools = [
        {
          name: "list_subscriptions",
          description: "List tracked subscriptions, optionally filtered by status (active/trial/downgraded/cancelled/renegotiation_sent). Read-only. " + OWNER_ONLY_CLAUSE,
          inputSchema: {
            type: "object",
            properties: {
              status: { type: "string", description: "Optional status to filter by" }
            }
          },
          async execute(input, actor = "agent") {
            return await invoke("list_subscriptions", input, actor);
          }
        },
        {
          name: "review_subscriptions",
          description: "Run the three review rules (price jump over 15%, no usage in 60+ days, a trial converting within 7 days) against every active/trial subscription, and return only the ones that currently trip at least one rule, with the evidence for each finding and the yearly dollars it concerns (annualAtStake). Does NOT: draft an action, change any subscription, return anything for a subscription nothing is wrong with, or repeat a finding the owner already approved keeping (a new price change or a new quiet stretch still flags). " + OWNER_ONLY_CLAUSE,
          inputSchema: { type: "object", properties: {} },
          async execute(input, actor = "agent") {
            return await invoke("review_subscriptions", input, actor);
          }
        },
        {
          name: "get_subscription",
          description: "Full record for one subscription, including price history, usage, and any current draft. Read-only. " + OWNER_ONLY_CLAUSE,
          inputSchema: {
            type: "object",
            properties: { id: { type: "string", description: "Subscription id" } },
            required: ["id"]
          },
          async execute(input, actor = "agent") {
            return await invoke("get_subscription", input, actor);
          }
        },
        {
          name: "apply_action",
          description: `Draft one action (keep/downgrade/renegotiate/cancel) for a subscription that review_subscriptions actually flagged, with a note that quotes one of the figures that rule produced: a price ($8.99), the percentage (44%), the last-used date, the quiet day count (116 days), the trial end date or the days left (3 days). Does NOT: change the subscription's real status, apply to a subscription that is no longer active or on trial (already cancelled, downgraded or renegotiated) or has no open finding, or accept a note that quotes no figure \u2014 "cancel this" or "cancel this trial" is refused. ` + OWNER_ONLY_CLAUSE,
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Subscription id" },
              action: { type: "string", enum: ["keep", "downgrade", "renegotiate", "cancel"] },
              note: { type: "string", description: "Reasoned note citing the specific evidence a fired rule produced" }
            },
            required: ["id", "action", "note"]
          },
          async execute(input, actor = "agent") {
            return await invoke("apply_action", input, actor);
          }
        }
      ];
      module.exports = { tools };
    }
  });

  // src/api.js
  var require_api = __commonJS({
    "src/api.js"(exports, module) {
      var { invoke } = require_invoke();
      var store = require_store();
      var { tools } = require_tools();
      var { sampleCsv } = require_import();
      function getState() {
        return { subscriptions: store.listSubscriptions() };
      }
      function getActivityLog() {
        return store.activityLog.getAll();
      }
      function getTools() {
        return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
      }
      function getImportSample() {
        return { csv: sampleCsv(/* @__PURE__ */ new Date()) };
      }
      async function postInvoke(body = {}) {
        const { tool, args, actor } = body;
        if (!tool) {
          return { status: 400, body: { error: "tool required" } };
        }
        if (!actor) {
          return { status: 400, body: { error: "actor required" } };
        }
        return { status: 200, body: await invoke(tool, args || {}, actor) };
      }
      module.exports = { getState, getActivityLog, getTools, getImportSample, postInvoke };
    }
  });

  // src/browser-entry.js
  var require_browser_entry = __commonJS({
    "src/browser-entry.js"(exports, module) {
      var api = require_api();
      var viaJson = (v) => JSON.parse(JSON.stringify(v));
      var GET_ROUTES = {
        "/api/state": api.getState,
        "/api/activity-log": api.getActivityLog,
        "/api/tools": api.getTools,
        "/api/import-sample": api.getImportSample
      };
      async function get(path) {
        const route = GET_ROUTES[path];
        if (!route) {
          throw new Error(`No route: GET ${path}`);
        }
        return viaJson(route());
      }
      async function post(path, body = {}) {
        if (path !== "/api/invoke") {
          throw new Error(`No route: POST ${path}`);
        }
        const { body: resBody } = await api.postInvoke(viaJson(body));
        return viaJson(resBody);
      }
      module.exports = { get, post };
    }
  });
  return require_browser_entry();
})();
