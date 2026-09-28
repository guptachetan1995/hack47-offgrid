// Turns the owner's own subscriptions (a pasted CSV, or one row from the dashboard's add
// form) into store records. Pure: no store, no clock except the `now` passed in, no I/O —
// the live demo runs it in the page, so an import never leaves the browser.
//
// CSV header (any order, case-insensitive; only `service` and `prices` are required):
//   service,prices,renewalDate,lastUsedAt,trialEndsAt,trialPrice,billing
// `prices` is the price history, oldest first or not: amount@YYYY-MM-DD;amount@YYYY-MM-DD

const COLUMNS = ['service', 'prices', 'renewalDate', 'lastUsedAt', 'trialEndsAt', 'trialPrice', 'billing'];
const MAX_ROWS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

// RFC 4180 fields: commas and newlines inside double quotes, "" for a literal quote.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, '');
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
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (quoted) {
    throw new Error('CSV has an unclosed double quote.');
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// Header-keyed objects, one per data row.
function csvToRows(text) {
  const [header, ...data] = parseCsv(text);
  if (!header) {
    throw new Error('CSV is empty.');
  }
  const names = header.map((h) => {
    const name = COLUMNS.find((c) => c.toLowerCase() === h.trim().toLowerCase());
    if (!name) {
      throw new Error(`Unknown CSV column "${h.trim()}". Columns: ${COLUMNS.join(', ')}.`);
    }
    return name;
  });
  // Otherwise the later column would silently overwrite the earlier one in every row.
  const repeated = names.find((n, i) => names.indexOf(n) !== i);
  if (repeated) {
    throw new Error(`CSV column "${repeated}" appears more than once in the header.`);
  }
  return data.map((cells) => Object.fromEntries(names.map((n, i) => [n, (cells[i] || '').trim()])));
}

function validDate(value, label, rowLabel) {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`${rowLabel}: ${label} must be a YYYY-MM-DD date, got "${value}".`);
  }
  return value;
}

function parsePrices(value, rowLabel) {
  const entries = String(value || '').split(';').map((p) => p.trim()).filter(Boolean);
  if (entries.length === 0) {
    throw new Error(`${rowLabel}: prices is required, e.g. 8.99@2025-06-01;12.99@2026-09-01.`);
  }
  return entries
    .map((entry) => {
      const [amount, date] = entry.split('@').map((s) => (s || '').trim().replace(/^\$/, ''));
      if (!AMOUNT_RE.test(amount) || !date) {
        throw new Error(`${rowLabel}: each price must look like 12.99@2026-09-01, got "${entry}".`);
      }
      return { amount: Number(amount), currency: 'USD', effectiveFrom: validDate(date, 'a price date', rowLabel) };
    })
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item';

// One validated store record. `takenIds` is the set of ids already in use; the new id is
// added to it so a batch never collides with itself either. `today` is now's UTC date.
function toSubscription(row, rowLabel, takenIds, today) {
  const service = String(row.service || '').trim();
  if (!service || service.length > 80) {
    throw new Error(`${rowLabel}: service is required (at most 80 characters).`);
  }
  const optionalDate = (key) => (row[key] ? validDate(String(row[key]).trim(), key, rowLabel) : null);
  const billing = String(row.billing || 'monthly').trim().toLowerCase();
  if (billing !== 'monthly' && billing !== 'yearly') {
    throw new Error(`${rowLabel}: billing must be monthly or yearly, got "${row.billing}".`);
  }
  const trialPriceText = String(row.trialPrice || '').trim().replace(/^\$/, '');
  if (trialPriceText && !AMOUNT_RE.test(trialPriceText)) {
    throw new Error(`${rowLabel}: trialPrice must be an amount like 14.99, got "${row.trialPrice}".`);
  }
  const trialEnds = optionalDate('trialEndsAt');
  // A trial that has already ended is a paid subscription now (or a cancelled one), and
  // importing it as `trial` would show a status that is no longer true.
  if (trialEnds && trialEnds < today) {
    throw new Error(
      `${rowLabel}: trialEndsAt ${trialEnds} has already passed. If the trial became a paid ` +
      'plan, leave trialEndsAt empty and put the paid price in prices.'
    );
  }
  const lastUsed = optionalDate('lastUsedAt');

  let id = `sub_${slug(service)}`;
  for (let n = 2; takenIds.has(id); n++) {
    id = `sub_${slug(service)}_${n}`;
  }
  takenIds.add(id);

  return {
    id,
    service,
    status: trialEnds ? 'trial' : 'active',
    billing,
    priceHistory: parsePrices(row.prices, rowLabel),
    renewalDate: optionalDate('renewalDate'),
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

// Every row is checked before any is returned, so a bad row 7 never leaves rows 1-6
// half-imported.
function importRecords({ csv, rows } = {}, existingIds = [], now = new Date()) {
  if ((csv === undefined) === (rows === undefined)) {
    throw new Error('import_subscriptions takes exactly one of csv (text) or rows (a list).');
  }
  const input = csv !== undefined ? csvToRows(csv) : rows;
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Nothing to import: no data rows.');
  }
  if (input.length > MAX_ROWS) {
    throw new Error(`At most ${MAX_ROWS} subscriptions per import, got ${input.length}.`);
  }
  const taken = new Set(existingIds);
  // Row 1 is the header in a CSV, so its data rows are numbered the way a spreadsheet shows them.
  const first = csv !== undefined ? 2 : 1;
  const today = now.toISOString().slice(0, 10);
  return input.map((row, i) => toSubscription(row || {}, `Row ${i + first}`, taken, today));
}

// A ready-to-import example whose dates sit relative to `now`, so it trips the same three
// rules on whatever day it's loaded: a price rise, a quiet stretch, a trial about to
// convert, and one healthy yearly plan. Every service name is fictional.
function sampleCsv(now = new Date()) {
  const day = (offset) => new Date(now.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
  return [
    COLUMNS.join(','),
    `Fernhill Meal Box,59.99@${day(-400)};69.99@${day(-12)},${day(18)},${day(-2)},,,monthly`,
    `Orbitalk Language Club,12.99@${day(-300)},${day(9)},${day(-94)},,,monthly`,
    `Lumen Notebook Pro,0@${day(-9)},,${day(-1)},${day(5)},8.99,monthly`,
    `Tidewire VPN,59.99@${day(-200)},${day(165)},${day(-1)},,,yearly`
  ].join('\n') + '\n';
}

module.exports = { parseCsv, csvToRows, importRecords, sampleCsv, COLUMNS, MAX_ROWS };
