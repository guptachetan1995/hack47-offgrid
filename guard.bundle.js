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
          trialEndsInDays: 3
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
          priceHistory: entry.priceHistory.map((p) => ({
            amount: p.amount,
            currency: p.currency,
            effectiveFrom: daysAgo(p.effectiveFromDaysAgo).slice(0, 10)
          })),
          renewalDate: entry.renewalInDays == null ? null : daysFromNow(entry.renewalInDays).slice(0, 10),
          lastUsedAt: entry.lastUsedAtDaysAgo == null ? null : daysAgo(entry.lastUsedAtDaysAgo),
          trialEndsAt: entry.trialEndsInDays == null ? null : daysFromNow(entry.trialEndsInDays),
          draftAction: null,
          draftNote: null,
          draftedAt: null
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
      module.exports = { listSubscriptions, getSubscription, updateSubscription, activityLog, state, reset };
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
        return {
          rule: "price_jump",
          message: `Price rose ${pctStr} (${money(prev.amount)}\u2192${money(latest.amount)}) at the ${latest.effectiveFrom} renewal.`,
          tokens: [money(prev.amount), money(latest.amount), pctStr]
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
        return {
          rule: "quiet_usage",
          message: `No usage seen since ${sub.lastUsedAt.slice(0, 10)} (${days} days).`,
          tokens: [sub.lastUsedAt.slice(0, 10), `${days} days`]
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
        return {
          rule: "trial_converting",
          message: `Trial converts to paid on ${sub.trialEndsAt.slice(0, 10)} (${days} day${days === 1 ? "" : "s"} away).`,
          tokens: [sub.trialEndsAt.slice(0, 10), "trial"]
        };
      }
      var CHECKS = [checkPriceJump, checkQuietUsage, checkTrialConverting];
      function reviewSubscription(sub, now = /* @__PURE__ */ new Date()) {
        return CHECKS.map((check) => check(sub, now)).filter(Boolean);
      }
      module.exports = {
        reviewSubscription,
        checkPriceJump,
        checkQuietUsage,
        checkTrialConverting,
        PRICE_JUMP_THRESHOLD,
        QUIET_USAGE_DAYS,
        TRIAL_SOON_DAYS
      };
    }
  });

  // src/invoke.js
  var require_invoke = __commonJS({
    "src/invoke.js"(exports, module) {
      var store = require_store();
      var { reviewSubscription } = require_rules();
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
      function reviewAll() {
        const now = /* @__PURE__ */ new Date();
        return store.listSubscriptions().filter(isReviewable).map((s) => ({ id: s.id, service: s.service, firedRules: reviewSubscription(s, now) })).filter((r) => r.firedRules.length > 0);
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
        const fired = reviewSubscription(sub, /* @__PURE__ */ new Date());
        if (fired.length === 0) {
          throw new Error(
            `${id} has no currently-fired rule (no price jump, no quiet usage, no trial converting) \u2014 apply_action only drafts against a subscription review_subscriptions actually flagged.`
          );
        }
        const allTokens = fired.flatMap((f) => f.tokens);
        const noteText = String(note || "");
        const citesEvidence = allTokens.some((token) => noteText.includes(token));
        if (!citesEvidence) {
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
      function approveAction({ id } = {}, actor) {
        if (actor !== "owner") {
          throw new Error("approve_action is an owner-only action; no agent tool can approve a draft.");
        }
        const sub = store.getSubscription(id);
        if (!sub.draftAction) {
          throw new Error(`${id} has no draft to approve.`);
        }
        const nextStatus = {
          keep: "active",
          downgrade: "downgraded",
          renegotiate: "renegotiation_sent",
          cancel: "cancelled"
        }[sub.draftAction];
        return store.updateSubscription(id, {
          status: nextStatus,
          draftAction: null,
          draftNote: null,
          draftedAt: null
        });
      }
      function rejectAction({ id } = {}, actor) {
        if (actor !== "owner") {
          throw new Error("reject_action is an owner-only action; no agent tool can reject a draft.");
        }
        const sub = store.getSubscription(id);
        if (!sub.draftAction) {
          throw new Error(`${id} has no draft to reject.`);
        }
        return store.updateSubscription(id, { draftAction: null, draftNote: null, draftedAt: null });
      }
      module.exports = { invoke };
    }
  });

  // src/tools.js
  var require_tools = __commonJS({
    "src/tools.js"(exports, module) {
      var { invoke } = require_invoke();
      var OWNER_ONLY_CLAUSE = "Approve and Reject are owner-only dashboard actions; no registered tool, including this one, can move a subscription out of its drafted state.";
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
          description: "Run the three review rules (price jump over 15%, no usage in 60+ days, a trial converting within 7 days) against every active/trial subscription, and return only the ones that currently trip at least one rule, with the evidence for each. Does NOT: draft an action, change any subscription, or return anything for a subscription nothing is wrong with. " + OWNER_ONLY_CLAUSE,
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
          description: `Draft one action (keep/downgrade/renegotiate/cancel) for a subscription that review_subscriptions actually flagged, with a note citing the specific evidence (the exact price figures, the quiet-usage date, or the trial date) that rule produced. Does NOT: change the subscription's real status, apply to a subscription that is no longer active or on trial (already cancelled, downgraded or renegotiated) or has no currently-fired rule, or accept a note that doesn't cite real evidence \u2014 a bare "cancel this" is refused. ` + OWNER_ONLY_CLAUSE,
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
      function getState() {
        return { subscriptions: store.listSubscriptions() };
      }
      function getActivityLog() {
        return store.activityLog.getAll();
      }
      function getTools() {
        return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
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
      module.exports = { getState, getActivityLog, getTools, postInvoke };
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
        "/api/tools": api.getTools
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
