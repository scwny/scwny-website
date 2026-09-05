# Raffle Results Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken raffle results page with a dependency-free, mobile-first page that reads a new Google Sheet through a new Apps Script and highlights the visitor's winning baskets.

**Architecture:** A static page on GitHub Pages fetches JSON from a Google Apps Script web app that dumps a Google Sheet's "Baskets" and "Settings" tabs verbatim. All presentation logic lives in the page: pure modules parse ticket input and normalize rows, and one DOM module renders, polls, and persists the visitor's ticket numbers in `localStorage`. The old page is kept as `raffle/legacy.html`.

**Tech Stack:** Plain HTML, CSS, and ES modules. No runtime dependencies. Node 22 built-in test runner (`node --test`) for unit tests. Google Apps Script (V8 runtime) for the feed. Python `http.server` for local preview.

**Spec:** `docs/superpowers/specs/2026-09-04-raffle-rebuild-design.md`

## Global Constraints

- No third-party JavaScript or CSS. Drop jQuery, DataTables, and Moment.js.
- `raffle/index.html` must be renamed to `raffle/legacy.html`, not deleted. `raffle/RaffleResults.css` stays untouched.
- Never call `alert`. Errors render inline.
- All Sheet content is rendered via `textContent`; URLs only go into `src` and `href` and must start with `http://` or `https://`.
- Sheet headers, exact text: `Basket`, `Description`, `Winning Ticket`, `Details`, `Donated By`, `Photo`. Settings keys: `Title`, `Message`.
- JSON contract: `{ ok, updated, settings: {…}, rows: [{…}] }` with all values as strings; failure is `{ ok: false, error }`.
- Default refresh 30s, exponential backoff to a max of 120s, requests use `cache: 'no-store'`.
- `localStorage` key: `scwny.raffle.myTickets`. All storage access wrapped in try/catch.
- Ticket parsing caps: 1000 numbers per range, 5000 total.
- Cards below 720px wide, table at 720px and above.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
  ```
- Working directory for every command: `C:/Users/Patrick/OneDrive/SCWNY/git/scwny-website`.

## File Structure

| File | Responsibility |
| --- | --- |
| `raffle/legacy.html` | The old page, renamed. Untouched content. |
| `.nojekyll` | Tells GitHub Pages to serve files as-is without a Jekyll build. |
| `package.json` | Declares ES modules and the `npm test` script. No dependencies. |
| `raffle/tickets.js` | Pure: `parseTickets(text)`, `ticketMatches(cell, numbers)`. |
| `raffle/data.js` | Pure: header mapping, sorting, settings, photo URL rewriting, counts. |
| `raffle/config.js` | `DATA_URL`, `REFRESH_SECONDS`. The only file edited after a redeploy. |
| `raffle/sample-data.json` | Demo payload in the JSON contract shape. |
| `raffle/index.html` | New page markup. |
| `raffle/raffle.css` | Mobile-first styles; responsive table. |
| `raffle/raffle.js` | DOM, fetch, polling, storage, URL params. Imports the pure modules. |
| `raffle/apps-script/Code.gs` | Apps Script source for the feed. |
| `raffle/apps-script/SETUP.md` | Human checklist to create the Sheet and deploy the script. |
| `tests/tickets.test.mjs` | Unit tests for `tickets.js`. |
| `tests/data.test.mjs` | Unit tests for `data.js`. |
| `README.md`, `CLAUDE.md` | Updated to describe the new structure. |

---

### Task 1: Preserve the old page and set up the repo for tests

**Files:**
- Rename: `raffle/index.html` → `raffle/legacy.html`
- Create: `.nojekyll`
- Create: `package.json`

**Interfaces:**
- Produces: `npm test` runs `node --test "tests/**/*.test.mjs"`. Every later task's tests run through it.

- [ ] **Step 1: Rename the old page with git so history follows it**

```bash
git mv raffle/index.html raffle/legacy.html
```

- [ ] **Step 2: Add `.nojekyll` and `package.json`**

`.nojekyll` is an empty file. GitHub Pages runs Jekyll unless this exists; we want plain static hosting.

```bash
touch .nojekyll
```

`package.json`:

```json
{
  "name": "scwny-website",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/**/*.test.mjs\""
  }
}
```

- [ ] **Step 3: Verify the test runner works with no tests yet**

Run: `npm test`
Expected: exits 0 and reports `tests 0` (Node prints a summary with zero tests). If it errors with "no test files found", that's also acceptable at this point; Task 2 adds the first test.

- [ ] **Step 4: Verify the legacy page still references files that exist**

Run: `grep -n "RaffleResults.css\|SCWNYLOGO.png" raffle/legacy.html`
Expected: both filenames appear, and both files still exist in `raffle/`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Keep old raffle page as legacy.html and add test scaffolding

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

---

### Task 2: Ticket parsing and matching module (TDD)

**Files:**
- Create: `raffle/tickets.js`
- Test: `tests/tickets.test.mjs`

**Interfaces:**
- Produces:
  - `parseTickets(text: unknown): { numbers: Set<number>, invalid: string[] }` — never throws.
  - `ticketMatches(cell: unknown, numbers: Set<number>): boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/tickets.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTickets, ticketMatches } from '../raffle/tickets.js';

const nums = (text) => [...parseTickets(text).numbers].sort((a, b) => a - b);

test('single numbers separated by commas and spaces', () => {
  assert.deepEqual(nums('104, 7 250'), [7, 104, 250]);
});

test('range is inclusive', () => {
  assert.deepEqual(nums('97-104'), [97, 98, 99, 100, 101, 102, 103, 104]);
});

test('reversed range is swapped', () => {
  assert.deepEqual(nums('5-3'), [3, 4, 5]);
});

test('en dash, "to", and spaced hyphen all work as range separators', () => {
  assert.deepEqual(nums('3\u20135'), [3, 4, 5]);
  assert.deepEqual(nums('3 to 5'), [3, 4, 5]);
  assert.deepEqual(nums('3 - 5'), [3, 4, 5]);
});

test('semicolons and newlines separate tokens', () => {
  assert.deepEqual(nums('1;2\n3'), [1, 2, 3]);
});

test('duplicates collapse', () => {
  assert.deepEqual(nums('4, 4, 3-5'), [3, 4, 5]);
});

test('leading zeros are ignored', () => {
  assert.deepEqual(nums('0104'), [104]);
});

test('invalid tokens are reported and parsing does not throw', () => {
  const result = parseTickets('12, abc, 5-x, 0');
  assert.deepEqual([...result.numbers], [12]);
  assert.deepEqual(result.invalid, ['abc', '5-x', '0']);
});

test('non-string input yields an empty result', () => {
  const result = parseTickets(undefined);
  assert.equal(result.numbers.size, 0);
  assert.deepEqual(result.invalid, []);
});

test('a range over 1000 numbers is rejected as invalid', () => {
  const result = parseTickets('1-2000');
  assert.equal(result.numbers.size, 0);
  assert.deepEqual(result.invalid, ['1-2000']);
});

test('more than 5000 numbers in total is rejected', () => {
  const result = parseTickets('1-1000 1001-2000 2001-3000 3001-4000 4001-5000 5001-5001');
  assert.equal(result.numbers.size, 5000);
  assert.deepEqual(result.invalid, ['5001-5001']);
});

test('ticketMatches matches any run of digits in the cell', () => {
  const numbers = parseTickets('104').numbers;
  assert.equal(ticketMatches('104', numbers), true);
  assert.equal(ticketMatches('104 (Jane)', numbers), true);
  assert.equal(ticketMatches('0104', numbers), true);
  assert.equal(ticketMatches('1040', numbers), false);
  assert.equal(ticketMatches('', numbers), false);
  assert.equal(ticketMatches(null, numbers), false);
  assert.equal(ticketMatches(undefined, numbers), false);
});

test('ticketMatches is false with no saved numbers', () => {
  assert.equal(ticketMatches('104', new Set()), false);
  assert.equal(ticketMatches('104', undefined), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. Error mentions `Cannot find module` for `raffle/tickets.js`.

- [ ] **Step 3: Write the implementation**

`raffle/tickets.js`:

```js
// Pure helpers for the "My tickets" feature. No DOM, no side effects.

const MAX_RANGE = 1000;
const MAX_TOTAL = 5000;

/**
 * Parse free text like "97-104, 241, 250 to 252" into a Set of integers.
 * Never throws. Unparseable tokens are returned in `invalid`.
 */
export function parseTickets(text) {
  const numbers = new Set();
  const invalid = [];
  if (typeof text !== 'string') return { numbers, invalid };

  const normalized = text
    .replace(/[\u2013\u2014]/g, '-')   // en dash, em dash
    .replace(/\s+to\s+/gi, '-')        // "97 to 104"
    .replace(/\s*-\s*/g, '-');         // "97 - 104"

  const tokens = normalized.split(/[\s,;]+/).filter(Boolean);

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n > 0 && numbers.size < MAX_TOTAL) numbers.add(n);
      else invalid.push(token);
      continue;
    }

    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      let lo = Number(range[1]);
      let hi = Number(range[2]);
      if (lo > hi) [lo, hi] = [hi, lo];
      const count = hi - lo + 1;
      if (lo <= 0 || count > MAX_RANGE || numbers.size + count > MAX_TOTAL) {
        invalid.push(token);
        continue;
      }
      for (let n = lo; n <= hi; n += 1) numbers.add(n);
      continue;
    }

    invalid.push(token);
  }

  return { numbers, invalid };
}

/**
 * True when any run of digits in `cell` is one of the visitor's numbers.
 * Tolerates cells like "104" and "104 (Jane)". Blank cells never match.
 */
export function ticketMatches(cell, numbers) {
  if (!numbers || numbers.size === 0) return false;
  if (cell === null || cell === undefined) return false;
  const runs = String(cell).match(/\d+/g);
  if (!runs) return false;
  return runs.some((run) => numbers.has(Number(run)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all 13 tests PASS, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add raffle/tickets.js tests/tickets.test.mjs
git commit -m "$(cat <<'EOF'
Add ticket parsing and matching module with tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

---

### Task 3: Row and settings normalization module (TDD)

**Files:**
- Create: `raffle/data.js`
- Test: `tests/data.test.mjs`

**Interfaces:**
- Produces:
  - `normalizeRow(raw: object): Row` where `Row = { basket, description, ticket, details, donatedBy, photo }`, all strings, trimmed.
  - `normalizeRows(rawRows: unknown): Row[]` — normalized and sorted by `compareBaskets`.
  - `compareBaskets(a: Row, b: Row): number` — numeric when both baskets are integers, else locale compare with numeric collation.
  - `normalizeSettings(raw: unknown): { title: string, message: string }` — defaults `title` to `'Raffle Results'`.
  - `photoUrls(url: unknown): { thumb: string, full: string } | null` — null for non-http(s) input.
  - `summarize(rows: Row[]): { total: number, drawn: number }`.

- [ ] **Step 1: Write the failing tests**

`tests/data.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRow,
  normalizeRows,
  compareBaskets,
  normalizeSettings,
  photoUrls,
  summarize,
} from '../raffle/data.js';

test('normalizeRow maps headers case-insensitively, trims, and accepts the Winner alias', () => {
  const row = normalizeRow({
    ' basket ': ' 7 ',
    DESCRIPTION: 'Italian Night',
    Winner: '104',
    'Donated  By': 'Wegmans',
  });
  assert.deepEqual(row, {
    basket: '7',
    description: 'Italian Night',
    ticket: '104',
    details: '',
    donatedBy: 'Wegmans',
    photo: '',
  });
});

test('normalizeRow prefers Winning Ticket over Winner when both exist', () => {
  const row = normalizeRow({ 'Winning Ticket': '9', Winner: '4' });
  assert.equal(row.ticket, '9');
});

test('normalizeRow ignores unknown columns and null values', () => {
  const row = normalizeRow({ Basket: '1', Color: 'red', Details: null });
  assert.equal(row.basket, '1');
  assert.equal(row.details, '');
  assert.equal(Object.keys(row).length, 6);
});

test('normalizeRows tolerates non-array input', () => {
  assert.deepEqual(normalizeRows(undefined), []);
  assert.deepEqual(normalizeRows('nope'), []);
});

test('normalizeRows sorts integers numerically and labels after them', () => {
  const rows = normalizeRows([{ Basket: '10' }, { Basket: '2' }, { Basket: 'B' }, { Basket: 'A' }]);
  assert.deepEqual(rows.map((r) => r.basket), ['2', '10', 'A', 'B']);
});

test('compareBaskets is numeric for integer baskets', () => {
  assert.ok(compareBaskets({ basket: '9' }, { basket: '10' }) < 0);
  assert.ok(compareBaskets({ basket: '10' }, { basket: '9' }) > 0);
  assert.equal(compareBaskets({ basket: '5' }, { basket: '5' }), 0);
});

test('normalizeSettings applies defaults and trims', () => {
  assert.deepEqual(normalizeSettings({}), { title: 'Raffle Results', message: '' });
  assert.deepEqual(normalizeSettings(undefined), { title: 'Raffle Results', message: '' });
  assert.deepEqual(
    normalizeSettings({ TITLE: ' 2026 Meat Raffle ', message: ' Doors at 6 ' }),
    { title: '2026 Meat Raffle', message: 'Doors at 6' },
  );
  assert.equal(normalizeSettings({ Title: '   ' }).title, 'Raffle Results');
});

test('photoUrls rewrites Google Drive links to the thumbnail endpoint', () => {
  assert.deepEqual(photoUrls('https://drive.google.com/file/d/abc_123-XYZ/view?usp=sharing'), {
    thumb: 'https://drive.google.com/thumbnail?id=abc_123-XYZ&sz=w400',
    full: 'https://drive.google.com/thumbnail?id=abc_123-XYZ&sz=w1600',
  });
  assert.equal(
    photoUrls('https://drive.google.com/open?id=abc').thumb,
    'https://drive.google.com/thumbnail?id=abc&sz=w400',
  );
  assert.equal(
    photoUrls('https://drive.google.com/uc?export=view&id=abc').thumb,
    'https://drive.google.com/thumbnail?id=abc&sz=w400',
  );
});

test('photoUrls passes other http(s) URLs through and rejects everything else', () => {
  assert.deepEqual(photoUrls(' https://example.com/a.jpg '), {
    thumb: 'https://example.com/a.jpg',
    full: 'https://example.com/a.jpg',
  });
  assert.equal(photoUrls('javascript:alert(1)'), null);
  assert.equal(photoUrls('data:image/png;base64,AAAA'), null);
  assert.equal(photoUrls(''), null);
  assert.equal(photoUrls(undefined), null);
});

test('summarize counts drawn baskets', () => {
  assert.deepEqual(summarize([{ ticket: '1' }, { ticket: '' }, { ticket: '9' }]), { total: 3, drawn: 2 });
  assert.deepEqual(summarize([]), { total: 0, drawn: 0 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. Error mentions `Cannot find module` for `raffle/data.js`. The 13 ticket tests still pass.

- [ ] **Step 3: Write the implementation**

`raffle/data.js`:

```js
// Pure helpers that turn the Apps Script payload into display-ready rows.
// No DOM, no fetch.

// Sheet header (lower-cased, whitespace collapsed) -> Row field.
const HEADER_TO_FIELD = {
  'basket': 'basket',
  'description': 'description',
  'winning ticket': 'ticket',
  'winner': 'ticket', // older sheet layout
  'details': 'details',
  'donated by': 'donatedBy',
  'photo': 'photo',
};

// Preferred header per field when a sheet has more than one alias.
const PREFERRED_HEADER = { ticket: 'winning ticket' };

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/\s+/g, ' ');
}

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeRow(raw) {
  const row = { basket: '', description: '', ticket: '', details: '', donatedBy: '', photo: '' };
  const filledBy = {};
  for (const [key, value] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const normalizedKey = normalizeKey(key);
    const field = HEADER_TO_FIELD[normalizedKey];
    if (!field) continue;
    // First header wins, unless a later header is the preferred alias for the field.
    if (filledBy[field] !== undefined && normalizedKey !== PREFERRED_HEADER[field]) continue;
    row[field] = asText(value);
    filledBy[field] = normalizedKey;
  }
  return row;
}

export function compareBaskets(a, b) {
  const aNumeric = /^\d+$/.test(a.basket);
  const bNumeric = /^\d+$/.test(b.basket);
  if (aNumeric && bNumeric) return Number(a.basket) - Number(b.basket);
  return a.basket.localeCompare(b.basket, undefined, { numeric: true, sensitivity: 'base' });
}

export function normalizeRows(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows.map(normalizeRow).sort(compareBaskets);
}

export function normalizeSettings(raw) {
  const settings = { title: 'Raffle Results', message: '' };
  for (const [key, value] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const normalizedKey = normalizeKey(key);
    const text = asText(value);
    if (normalizedKey === 'title' && text) settings.title = text;
    if (normalizedKey === 'message') settings.message = text;
  }
  return settings;
}

const DRIVE_LINK = /drive\.google\.com\/(?:file\/d\/([\w-]+)|(?:open|uc)\?(?:[^#]*&)?id=([\w-]+))/i;

export function photoUrls(url) {
  const text = asText(url);
  if (!/^https?:\/\//i.test(text)) return null;
  const match = DRIVE_LINK.exec(text);
  const id = match && (match[1] || match[2]);
  if (id) {
    return {
      thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
      full: `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
    };
  }
  return { thumb: text, full: text };
}

export function summarize(rows) {
  const drawn = rows.filter((row) => row.ticket !== '').length;
  return { total: rows.length, drawn };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all 23 tests PASS, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add raffle/data.js tests/data.test.mjs
git commit -m "$(cat <<'EOF'
Add row and settings normalization module with tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

---

### Task 4: Apps Script source and setup checklist

**Files:**
- Create: `raffle/apps-script/Code.gs`
- Create: `raffle/apps-script/SETUP.md`

**Interfaces:**
- Produces: a web app URL that returns the JSON contract. The page (Task 6) consumes `payload.ok`, `payload.settings`, `payload.rows`.

There is no automated test for Apps Script. The verification is the `debugPayload` function run inside the Apps Script editor, described in `SETUP.md`.

- [ ] **Step 1: Write the script**

`raffle/apps-script/Code.gs`:

```js
/**
 * SCWNY raffle results feed.
 *
 * Reads the "Baskets" and "Settings" tabs of the bound spreadsheet and returns
 * them as JSON. Every column in Baskets is returned keyed by its header text, so
 * adding a column to the sheet never requires changing or redeploying this script.
 *
 * Deploy: Deploy > New deployment > type "Web app",
 *         Execute as "Me", Who has access "Anyone".
 * Update: Deploy > Manage deployments > pencil > Version "New version" > Deploy.
 *         The URL stays the same.
 */

var BASKETS_SHEET = 'Baskets';
var SETTINGS_SHEET = 'Settings';
var CACHE_KEY = 'payload-v1';
var CACHE_SECONDS = 5;

function doGet() {
  var cache = CacheService.getScriptCache();
  var body = cache.get(CACHE_KEY);
  if (!body) {
    body = JSON.stringify(buildPayload());
    try {
      cache.put(CACHE_KEY, body, CACHE_SECONDS);
    } catch (err) {
      // Cache values are limited to 100 KB. Serving uncached is fine.
    }
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function buildPayload() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return {
      ok: true,
      updated: new Date().toISOString(),
      settings: readSettings(ss.getSheetByName(SETTINGS_SHEET)),
      rows: readRows(ss.getSheetByName(BASKETS_SHEET)),
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function readRows(sheet) {
  if (!sheet) throw new Error('Sheet tab "' + BASKETS_SHEET + '" not found');
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  return values
    .slice(1)
    .filter(function (row) {
      return row.some(function (cell) { return String(cell).trim() !== ''; });
    })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (header, i) {
        if (header) obj[header] = String(row[i] == null ? '' : row[i]).trim();
      });
      return obj;
    });
}

function readSettings(sheet) {
  var settings = {};
  if (!sheet) return settings;
  sheet.getDataRange().getDisplayValues().forEach(function (row) {
    var key = String(row[0] == null ? '' : row[0]).trim();
    if (key) settings[key] = String(row[1] == null ? '' : row[1]).trim();
  });
  return settings;
}

/** Run this from the editor (select "debugPayload", press Run) to see the JSON in the log. */
function debugPayload() {
  Logger.log(JSON.stringify(buildPayload(), null, 2));
}
```

- [ ] **Step 2: Write the setup checklist**

`raffle/apps-script/SETUP.md`:

````markdown
# Setting up the raffle results feed

Takes about ten minutes. You need a Google account that will own the Sheet.

## 1. Create the Sheet

1. Go to https://sheets.new while signed in. Name it **SCWNY Raffle Results**.
2. Rename the first tab to **Baskets** (double-click the tab name at the bottom).
3. In row 1, type these headers, one per column, exactly:

   | A | B | C | D | E | F |
   | --- | --- | --- | --- | --- | --- |
   | Basket | Description | Winning Ticket | Details | Donated By | Photo |

   Only the first three matter. Leave the others blank until you want them.
4. Add a second tab named **Settings**. Fill it like this:

   | A | B |
   | --- | --- |
   | Title | 2026 Meat Raffle |
   | Message | Drawing starts at 7:00 PM |

   Title is the page heading. Message is an optional banner. Clear B2 to hide it.

## 2. Add the script

1. In the Sheet, open **Extensions > Apps Script**.
2. Delete everything in the editor and paste the contents of `Code.gs` from this folder.
3. Press **Ctrl+S** to save. Name the project **Raffle Feed** if asked.
4. In the toolbar, choose the function **debugPayload** from the dropdown and press **Run**.
5. The first run asks for permission. Choose your account, then **Advanced > Go to Raffle Feed (unsafe)**, then **Allow**. This warning is normal for a script you wrote yourself.
6. Open **Execution log** at the bottom. You should see JSON with `"ok": true` and your headers.

## 3. Deploy as a web app

1. Click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Description: `Raffle feed`. Execute as: **Me**. Who has access: **Anyone**.
   It must be "Anyone", not "Anyone with Google account".
4. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.
5. Paste the URL into a new browser tab. You should see the same JSON.

## 4. Connect the page

Either send the URL to whoever maintains the site, or edit `raffle/config.js` and paste
it between the quotes of `DATA_URL`. The site maintainer can test the URL before publishing
by serving the repo locally and opening `http://localhost:8765/raffle/?data=PASTE_URL_HERE`.
The live site ignores the `?data=` parameter on purpose, so a shared link cannot swap in
someone else's data.

## During the event

- Give volunteers **edit** access to the Sheet. They do not need access to the script.
- Type each winning ticket number into the **Winning Ticket** column as it is drawn.
- The page re-checks every 30 seconds. A change shows up on phones within about 35 seconds.

## If you ever change the script

Use **Deploy > Manage deployments**, click the pencil, set Version to **New version**,
and click **Deploy**. The URL stays the same. Creating a *new deployment* instead makes
a new URL and the page will need updating.
````

- [ ] **Step 3: Sanity-check the script parses as JavaScript**

Apps Script is JavaScript; Node can at least parse it. Run:

```bash
node --check raffle/apps-script/Code.gs 2>&1 || node -e "new Function(require('fs').readFileSync('raffle/apps-script/Code.gs','utf8')); console.log('parses')"
```

Expected: no syntax error (`node --check` may refuse the `.gs` extension; the fallback prints `parses`).

- [ ] **Step 4: Commit**

```bash
git add raffle/apps-script/Code.gs raffle/apps-script/SETUP.md
git commit -m "$(cat <<'EOF'
Add Apps Script feed source and setup checklist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

---

### Task 5: Page shell, styles, config, and sample data

**Files:**
- Create: `raffle/index.html`
- Create: `raffle/raffle.css`
- Create: `raffle/config.js`
- Create: `raffle/sample-data.json`

**Interfaces:**
- Produces: element ids used by Task 6: `title`, `message`, `status`, `error`, `tickets`, `tickets-help`, `wins`, `wins-heading`, `wins-list`, `search`, `results`. CSS classes used by Task 6: `basket`, `win`, `num`, `desc`, `desc-title`, `badge`, `ticket`, `pending`, `thumb`, `donor`, `empty`, `list`.
- Produces: `config.js` exports `DATA_URL` (string, empty for now) and `REFRESH_SECONDS` (number, 30).

- [ ] **Step 1: Write the markup**

`raffle/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SCWNY Raffle Results</title>
  <meta name="description" content="Live basket raffle results for the Skating Club of Western New York.">
  <link rel="icon" href="./SCWNYLOGO.png">
  <link rel="stylesheet" href="./raffle.css">
</head>
<body>
  <header class="site-header">
    <img class="logo" src="./SCWNYLOGO.png" alt="Skating Club of Western New York">
    <h1 id="title">Raffle Results</h1>
    <p id="message" class="banner" hidden></p>
  </header>

  <main>
    <p id="status" class="status" aria-live="polite">Loading results…</p>
    <p id="error" class="error" role="alert" hidden></p>

    <section class="panel">
      <label for="tickets">My ticket numbers</label>
      <input id="tickets" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
             placeholder="e.g. 97-104, 241, 250-252">
      <p id="tickets-help" class="help"></p>
    </section>

    <section id="wins" class="panel wins" hidden>
      <h2 id="wins-heading"></h2>
      <ul id="wins-list"></ul>
    </section>

    <section class="panel">
      <label for="search" class="visually-hidden">Search baskets</label>
      <input id="search" type="search" autocomplete="off" placeholder="Search baskets…">
    </section>

    <section id="results" class="results" aria-busy="true"></section>
  </main>

  <footer class="site-footer">Skating Club of Western New York</footer>

  <script type="module" src="./raffle.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the styles**

`raffle/raffle.css`:

```css
:root {
  --bg: #f4f6f8;
  --card: #ffffff;
  --text: #1b1f24;
  --muted: #5f6b7a;
  --line: #dfe4ea;
  --accent: #0b5cad;
  --accent-soft: #e8f1fb;
  --win-bg: #fff4c2;
  --win-border: #e6b800;
  --error-bg: #fde8e8;
  --error-text: #8a1c1c;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text);
  background: var(--bg);
}

.site-header { text-align: center; padding: 16px 16px 4px; }
.logo { width: 260px; max-width: 60%; height: auto; }
h1 { font-size: 1.6rem; margin: 8px 0 4px; }

.banner {
  margin: 8px auto 0;
  max-width: 640px;
  padding: 10px 14px;
  background: var(--accent-soft);
  border: 1px solid #bcd4ee;
  border-radius: 8px;
}

main { max-width: 960px; margin: 0 auto; padding: 0 12px 32px; }

.status { text-align: center; color: var(--muted); margin: 8px 0 12px; min-height: 1.4em; }

.error {
  background: var(--error-bg);
  color: var(--error-text);
  padding: 10px 14px;
  border-radius: 8px;
  margin: 0 0 12px;
}

.panel {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

label { display: block; font-weight: 600; margin-bottom: 6px; }

input[type="text"],
input[type="search"] {
  width: 100%;
  font: inherit;
  font-size: 1.05rem;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

.help { margin: 6px 0 0; color: var(--muted); font-size: 0.9rem; }
.help .invalid { color: var(--error-text); }

.wins { background: var(--win-bg); border-color: var(--win-border); }
.wins h2 { margin: 0 0 8px; font-size: 1.2rem; }
.wins ul { margin: 0; padding-left: 1.2em; }
.wins li { margin: 2px 0; }

.results { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.results[aria-busy="true"] { min-height: 120px; }

.empty { text-align: center; color: var(--muted); padding: 24px; margin: 0; }

table.list { width: 100%; border-collapse: collapse; }
.basket.win { background: var(--win-bg); }
.num { font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.desc-title { font-weight: 600; }
.ticket { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ticket.pending { color: var(--muted); font-style: italic; font-weight: 400; }

.badge {
  display: inline-block;
  background: var(--win-border);
  color: #000;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  margin-left: 6px;
  vertical-align: middle;
}

details { margin-top: 4px; }
details summary { cursor: pointer; color: var(--accent); font-size: 0.95rem; }
details p { margin: 6px 0 0; }
.donor { color: var(--muted); }

.thumb img { display: block; width: 120px; max-width: 100%; height: auto; border-radius: 8px; }

.site-footer { text-align: center; color: var(--muted); font-size: 0.85rem; padding: 12px 0 24px; }

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Phones: each row becomes a card. */
@media (max-width: 719.98px) {
  table.list, table.list tbody { display: block; }
  table.list thead { display: none; }
  tr.basket {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      "num desc ticket"
      "num thumb thumb";
    gap: 4px 12px;
    align-items: start;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  tr.basket:last-child { border-bottom: 0; }
  tr.basket td { display: block; padding: 0; }
  td.num { grid-area: num; font-size: 1.15rem; min-width: 2.5ch; }
  td.desc { grid-area: desc; }
  td.ticket { grid-area: ticket; text-align: right; font-weight: 600; }
  td.thumb { grid-area: thumb; margin-top: 6px; }
  td.thumb:empty { display: none; }
}

/* Wide screens: a regular table. */
@media (min-width: 720px) {
  table.list th,
  table.list td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }
  table.list th { background: #eef2f6; font-weight: 600; }
  table.list tr:last-child td { border-bottom: 0; }
  td.num { width: 5rem; }
  th.ticket, td.ticket { text-align: right; width: 10rem; }
  td.thumb { width: 140px; }
}
```

- [ ] **Step 3: Write the config and the sample data**

`raffle/config.js`:

```js
// Paste the Apps Script web app URL (it ends in /exec) between the quotes.
// See raffle/apps-script/SETUP.md for how to get it.
export const DATA_URL = '';

// How often, in seconds, the page re-checks for new results while open.
export const REFRESH_SECONDS = 30;
```

`raffle/sample-data.json`:

```json
{
  "ok": true,
  "updated": "2026-09-04T23:10:00.000Z",
  "settings": {
    "Title": "2026 Meat Raffle (demo)",
    "Message": "This is sample data. Drawing starts at 7:00 PM."
  },
  "rows": [
    { "Basket": "1", "Description": "Italian Night", "Winning Ticket": "104", "Details": "Pasta, sauce, olive oil, and a gift card to Chef's.", "Donated By": "The Lupiani Family", "Photo": "" },
    { "Basket": "2", "Description": "Movie Night", "Winning Ticket": "17", "Details": "", "Donated By": "", "Photo": "https://picsum.photos/seed/scwny2/400/300" },
    { "Basket": "3", "Description": "Coffee Lover", "Winning Ticket": "", "Details": "Two pounds of beans, a grinder, and two mugs.", "Donated By": "Spot Coffee", "Photo": "" },
    { "Basket": "4", "Description": "Grill Master", "Winning Ticket": "250 (Jane)", "Details": "", "Donated By": "", "Photo": "" },
    { "Basket": "5", "Description": "Spa Day", "Winning Ticket": "", "Details": "", "Donated By": "", "Photo": "" },
    { "Basket": "10", "Description": "Bills Fan Pack", "Winning Ticket": "9", "Details": "Signed mini helmet and two tickets.", "Donated By": "", "Photo": "https://picsum.photos/seed/scwny10/400/300" },
    { "Basket": "5A", "Description": "Kids Craft Corner", "Winning Ticket": "", "Details": "", "Donated By": "", "Photo": "" },
    { "Basket": "6", "Description": "Wine and Cheese", "Winning Ticket": "241", "Details": "", "Donated By": "Premier Wine", "Photo": "" }
  ]
}
```

- [ ] **Step 4: Verify the shell renders and the sample data is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('raffle/sample-data.json','utf8')); console.log('valid json')"`
Expected: `valid json`.

Start a local server in the background: `python -m http.server 8765` (from the repo root), then open `http://localhost:8765/raffle/?demo=1` in a browser. Expected: logo, "Raffle Results" heading, "Loading results…" status, the two inputs, and an empty results box. The browser console shows a 404 for `raffle.js`, which Task 6 fixes. Stop the server afterwards or leave it for Task 6.

- [ ] **Step 5: Commit**

```bash
git add raffle/index.html raffle/raffle.css raffle/config.js raffle/sample-data.json
git commit -m "$(cat <<'EOF'
Add new raffle page shell, styles, config, and sample data

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

---

### Task 6: Page logic: fetch, render, refresh, my tickets

**Files:**
- Create: `raffle/raffle.js`

**Interfaces:**
- Consumes: `parseTickets`, `ticketMatches` from `./tickets.js`; `normalizeRows`, `normalizeSettings`, `photoUrls`, `summarize` from `./data.js`; `DATA_URL`, `REFRESH_SECONDS` from `./config.js`; element ids and classes from Task 5.
- Produces: the working page. Verified manually in Task 7.

- [ ] **Step 1: Write the module**

`raffle/raffle.js`:

```js
import { DATA_URL, REFRESH_SECONDS } from './config.js';
import { parseTickets, ticketMatches } from './tickets.js';
import { normalizeRows, normalizeSettings, photoUrls, summarize } from './data.js';

const STORAGE_KEY = 'scwny.raffle.myTickets';
const MAX_BACKOFF_SECONDS = 120;

const el = {
  title: document.getElementById('title'),
  message: document.getElementById('message'),
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  tickets: document.getElementById('tickets'),
  ticketsHelp: document.getElementById('tickets-help'),
  wins: document.getElementById('wins'),
  winsHeading: document.getElementById('wins-heading'),
  winsList: document.getElementById('wins-list'),
  search: document.getElementById('search'),
  results: document.getElementById('results'),
};

const state = {
  rows: [],
  settings: normalizeSettings({}),
  updated: null,
  loadedOnce: false,
  myNumbers: new Set(),
  invalidTokens: [],
  search: '',
  timer: null,
  backoffSeconds: REFRESH_SECONDS,
};

// ---------- data source ----------

function resolveDataUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') return './sample-data.json';
  const override = params.get('data');
  if (override && /^https?:\/\//i.test(override)) return override;
  return DATA_URL;
}

const dataUrl = resolveDataUrl();

// ---------- storage ----------

function loadSavedTickets() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveTickets(text) {
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Storage unavailable (private mode, blocked). The feature still works for this visit.
  }
}

// ---------- fetching and refresh ----------

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

function clearError() {
  el.error.hidden = true;
  el.error.textContent = '';
}

function scheduleNext(seconds) {
  window.clearTimeout(state.timer);
  if (document.visibilityState !== 'visible') return;
  state.timer = window.setTimeout(fetchData, seconds * 1000);
}

async function fetchData() {
  window.clearTimeout(state.timer);

  if (!dataUrl) {
    showError('No data source is configured yet. Add the Apps Script URL to raffle/config.js.');
    el.status.textContent = '';
    el.results.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    const response = await fetch(dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      throw new Error(payload && payload.error ? payload.error : 'Unexpected response');
    }

    state.rows = normalizeRows(payload.rows);
    state.settings = normalizeSettings(payload.settings);
    state.updated = new Date();
    state.loadedOnce = true;
    state.backoffSeconds = REFRESH_SECONDS;

    clearError();
    render();
    scheduleNext(REFRESH_SECONDS);
  } catch (err) {
    const wait = state.backoffSeconds;
    state.backoffSeconds = Math.min(wait * 2, MAX_BACKOFF_SECONDS);
    showError(`Couldn't load results. Retrying in ${wait} seconds…`);
    if (!state.loadedOnce) {
      el.status.textContent = '';
      el.results.setAttribute('aria-busy', 'false');
    }
    console.error('Raffle results fetch failed:', err);
    scheduleNext(wait);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    fetchData();
  } else {
    window.clearTimeout(state.timer);
  }
});

// ---------- rendering ----------

function isWin(row) {
  return row.ticket !== '' && ticketMatches(row.ticket, state.myNumbers);
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function render() {
  document.title = `${state.settings.title} · SCWNY`;
  el.title.textContent = state.settings.title;
  el.message.textContent = state.settings.message;
  el.message.hidden = state.settings.message === '';

  const { total, drawn } = summarize(state.rows);
  const updated = state.updated ? ` · Updated ${formatTime(state.updated)}` : '';
  el.status.textContent = total === 0
    ? `No baskets listed yet${updated}`
    : `${drawn} of ${total} baskets drawn${updated}`;

  renderTicketsHelp();
  renderWins();
  renderResults();
  el.results.setAttribute('aria-busy', 'false');
}

function renderTicketsHelp() {
  el.ticketsHelp.replaceChildren();
  const count = state.myNumbers.size;

  if (count === 0 && state.invalidTokens.length === 0) {
    el.ticketsHelp.textContent = 'Enter your numbers to see your wins highlighted. Saved on this device.';
    return;
  }

  const parts = [`${count} ticket${count === 1 ? '' : 's'} saved.`];
  if (count > 0 && state.loadedOnce && !state.rows.some(isWin)) parts.push('No wins yet.');
  el.ticketsHelp.append(parts.join(' '));

  if (state.invalidTokens.length > 0) {
    const span = document.createElement('span');
    span.className = 'invalid';
    span.textContent = ` Couldn't read: ${state.invalidTokens.join(', ')}`;
    el.ticketsHelp.appendChild(span);
  }
}

function renderWins() {
  const wins = state.rows.filter(isWin);
  if (wins.length === 0) {
    el.wins.hidden = true;
    el.winsList.replaceChildren();
    return;
  }
  el.winsHeading.textContent = wins.length === 1 ? 'You won 1 basket!' : `You won ${wins.length} baskets!`;
  el.winsList.replaceChildren(
    ...wins.map((row) => {
      const li = document.createElement('li');
      li.textContent = `Basket ${row.basket} · ${row.description} · Ticket ${row.ticket}`;
      return li;
    }),
  );
  el.wins.hidden = false;
}

function matchesSearch(row, query) {
  if (!query) return true;
  return [row.basket, row.description, row.ticket].some((value) => value.toLowerCase().includes(query));
}

function openDetailBaskets() {
  return new Set(
    [...el.results.querySelectorAll('details[open]')].map((details) => details.dataset.basket),
  );
}

function renderResults() {
  const query = state.search.trim().toLowerCase();
  const rows = state.rows.filter((row) => matchesSearch(row, query));
  const anyPhoto = state.rows.some((row) => photoUrls(row.photo) !== null);
  const keepOpen = openDetailBaskets();

  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = state.rows.length === 0
      ? 'No baskets have been posted yet.'
      : 'No baskets match your search.';
    el.results.replaceChildren(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'list';

  const headerRow = table.createTHead().insertRow();
  const headers = [
    ['Basket', 'num'],
    ['Description', 'desc'],
    ['Winning Ticket', 'ticket'],
    ...(anyPhoto ? [['Photo', 'thumb']] : []),
  ];
  for (const [label, className] of headers) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = className;
    th.textContent = label;
    headerRow.appendChild(th);
  }

  const tbody = table.createTBody();
  for (const row of rows) tbody.appendChild(renderRow(row, anyPhoto, keepOpen));

  el.results.replaceChildren(table);
}

function renderRow(row, anyPhoto, keepOpen) {
  const win = isWin(row);
  const tr = document.createElement('tr');
  tr.className = win ? 'basket win' : 'basket';

  const num = tr.insertCell();
  num.className = 'num';
  num.textContent = row.basket;

  const desc = tr.insertCell();
  desc.className = 'desc';
  const title = document.createElement('div');
  title.className = 'desc-title';
  title.textContent = row.description;
  if (win) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'You';
    title.appendChild(badge);
  }
  desc.appendChild(title);

  if (row.details !== '' || row.donatedBy !== '') {
    const details = document.createElement('details');
    details.dataset.basket = row.basket;
    details.open = keepOpen.has(row.basket);
    const summary = document.createElement('summary');
    summary.textContent = 'Details';
    details.appendChild(summary);
    if (row.details !== '') {
      const p = document.createElement('p');
      p.textContent = row.details;
      details.appendChild(p);
    }
    if (row.donatedBy !== '') {
      const p = document.createElement('p');
      p.className = 'donor';
      p.textContent = `Donated by ${row.donatedBy}`;
      details.appendChild(p);
    }
    desc.appendChild(details);
  }

  const ticket = tr.insertCell();
  ticket.className = row.ticket === '' ? 'ticket pending' : 'ticket';
  ticket.textContent = row.ticket === '' ? 'Not drawn yet' : row.ticket;

  if (anyPhoto) {
    const thumb = tr.insertCell();
    thumb.className = 'thumb';
    const urls = photoUrls(row.photo);
    if (urls) {
      const link = document.createElement('a');
      link.href = urls.full;
      link.target = '_blank';
      link.rel = 'noopener';
      const img = document.createElement('img');
      img.src = urls.thumb;
      img.alt = `Photo of basket ${row.basket}`;
      img.loading = 'lazy';
      link.appendChild(img);
      thumb.appendChild(link);
    }
  }

  return tr;
}

// ---------- input handling ----------

function applyTickets(text) {
  const { numbers, invalid } = parseTickets(text);
  state.myNumbers = numbers;
  state.invalidTokens = invalid;
  renderTicketsHelp();
  if (state.loadedOnce) {
    renderWins();
    renderResults();
  }
}

el.tickets.addEventListener('input', () => {
  saveTickets(el.tickets.value);
  applyTickets(el.tickets.value);
});

el.search.addEventListener('input', () => {
  state.search = el.search.value;
  if (state.loadedOnce) renderResults();
});

// ---------- start ----------

el.tickets.value = loadSavedTickets();
applyTickets(el.tickets.value);
fetchData();
```

- [ ] **Step 2: Verify the module parses and the unit tests still pass**

Run: `node --check raffle/raffle.js && npm test`
Expected: no syntax error; 23 tests pass.

- [ ] **Step 3: Load the demo in a browser**

With `python -m http.server 8765` running from the repo root, open `http://localhost:8765/raffle/?demo=1`.

Expected:
- Heading reads "2026 Meat Raffle (demo)" and the banner shows the sample message.
- Status reads "5 of 8 baskets drawn · Updated <time>".
- Rows are ordered 1, 2, 3, 4, 5, 5A, 6, 10. Labels with a numeric prefix collate by that number.
- Baskets 3, 5, and 5A show "Not drawn yet" in muted italics.
- Baskets 2 and 10 show a photo thumbnail. A Photo column header appears on wide screens.
- Basket 1, 3, 6, and 10 have a "Details" expander.
- No errors in the browser console.

- [ ] **Step 4: Verify "my tickets" behavior**

Type `97-104, 17, 250` into the ticket box. Expected:
- Help text reads "10 tickets saved."
- A yellow "You won 3 baskets!" panel lists Basket 1, Basket 2, and Basket 4 (the "250 (Jane)" cell matches 250).
- Those three rows are highlighted yellow with a "You" badge.
- Reload the page. The ticket text is still there and the wins panel returns after data loads.
- Change the text to `9, zzz`. Help text reads "1 ticket saved." followed by "Couldn't read: zzz" in red. The wins panel shows only Basket 10.
- Clear the box. The wins panel disappears; help text returns to the hint.

- [ ] **Step 5: Verify search and error handling**

- Type `wine` in search. Only Basket 6 remains. Type `zzz`. "No baskets match your search." Clear it.
- Open `http://localhost:8765/raffle/?data=https://example.invalid/`. Expected: after a moment, a red inline banner "Couldn't load results. Retrying in 30 seconds…", no browser alert, status line empty, results box empty. Wait 30 seconds: the banner updates to "Retrying in 60 seconds…".
- Open `http://localhost:8765/raffle/` with no parameters. Expected: banner "No data source is configured yet. Add the Apps Script URL to raffle/config.js."

- [ ] **Step 6: Commit**

```bash
git add raffle/raffle.js
git commit -m "$(cat <<'EOF'
Add raffle page logic: fetch, live refresh, my tickets, search

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

---

### Task 7: Responsive check with screenshots

**Files:**
- None created in the repo. Screenshots go to the scratchpad directory.

**Interfaces:**
- Consumes: the working demo page from Task 6.

This task exists because the CSS breakpoint behavior cannot be unit tested. Use the Playwright or Chrome browser tools available in the session.

- [ ] **Step 1: Phone layout**

Open `http://localhost:8765/raffle/?demo=1` at a 390×844 viewport. Enter `97-104, 17` in the ticket box. Take a screenshot.

Expected: no horizontal scrolling; each basket is a card with the basket number on the left, description in the middle, and ticket on the right; the thumbnail sits under the description; the wins panel is readable; the table header row is not visible.

- [ ] **Step 2: Desktop layout**

Resize to 1024×800. Take a screenshot.

Expected: a table with headers Basket, Description, Winning Ticket, Photo; tickets right-aligned; highlighted rows still yellow.

- [ ] **Step 3: Fix anything that looks wrong, re-run `npm test`, and commit if CSS changed**

```bash
git add raffle/raffle.css
git commit -m "$(cat <<'EOF'
Adjust raffle page responsive styles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

Skip the commit if no CSS changes were needed.

---

### Task 8: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the final file layout from Tasks 1 through 6.

- [ ] **Step 1: Rewrite README.md**

Replace the whole file with:

````markdown
# scwny-website

Static GitHub Pages site for the Skating Club of Western New York (SCWNY), served at
[www.scwny.org](https://www.scwny.org). No build step and no runtime dependencies.

## What it does

- **`/`** redirects immediately to the club's main website,
  [skatingclubofwesternnewyork.org](https://skatingclubofwesternnewyork.org/).
- **`/raffle`** shows live basket raffle results. Visitors can save their ticket numbers
  on their phone and the page highlights the baskets they won as results are entered.

## How the raffle page works

Volunteers type results into a Google Sheet during the drawing. A small Google Apps
Script attached to that Sheet returns its contents as JSON. The page fetches that JSON
every 30 seconds while open and renders it with plain JavaScript.

```
Google Sheet  ->  Apps Script web app (JSON)  ->  raffle/index.html on GitHub Pages
```

Setting up the Sheet and script from scratch takes about ten minutes. Follow
[`raffle/apps-script/SETUP.md`](raffle/apps-script/SETUP.md), then paste the web app URL
into `raffle/config.js`.

### Sheet layout

Tab **Baskets**, header row: `Basket`, `Description`, `Winning Ticket`, `Details`,
`Donated By`, `Photo`. Only the first three are required. `Photo` accepts a Google
Drive share link or any image URL.

Tab **Settings**, two columns: `Title` is the page heading, `Message` is an optional
banner.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Root redirect to the club's main website. |
| `CNAME` | Binds GitHub Pages to `www.scwny.org`. |
| `raffle/index.html` | The results page. |
| `raffle/raffle.js` | Fetching, live refresh, rendering, saved tickets. |
| `raffle/tickets.js` | Parses ticket input like `97-104, 241` and matches winners. |
| `raffle/data.js` | Maps Sheet headers to fields, sorts rows, rewrites photo links. |
| `raffle/config.js` | The Apps Script URL and refresh interval. |
| `raffle/raffle.css` | Styles. Cards on phones, a table on wide screens. |
| `raffle/sample-data.json` | Demo data. Open the page with `?demo=1` to use it. |
| `raffle/apps-script/` | Apps Script source and the setup checklist. |
| `raffle/legacy.html` | The previous jQuery/DataTables page, kept for reference. |
| `tests/` | Unit tests for the pure modules. |

## Developing

Serve the repo root and open the demo:

```
python -m http.server 8765
# then visit http://localhost:8765/raffle/?demo=1
```

Test a new Apps Script deployment without committing by opening the local server with
`?data=<web app url>`. The override is ignored on the live site.

Run the unit tests (Node 22 or newer):

```
npm test
```

## Deploying

Push to `main`. GitHub Pages serves the repo root directly.
````

- [ ] **Step 2: Rewrite CLAUDE.md**

Replace the whole file with:

````markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static GitHub Pages site for the Skating Club of Western New York, served at www.scwny.org. Plain HTML,
CSS, and ES modules with no build step and no runtime dependencies. Deploy by pushing to `main`.

## Commands

- `npm test` runs the unit tests with Node's built-in runner. Tests live in `tests/*.test.mjs`.
- `python -m http.server 8765` from the repo root serves the site; open `http://localhost:8765/raffle/?demo=1`
  for the results page with sample data. ES modules will not load from `file://`.

## Structure

- `index.html` is only a meta-refresh redirect to the club's main site.
- `raffle/` is the only real page. `raffle.js` owns the DOM, fetch, and polling. `tickets.js` and `data.js` are
  pure modules with no DOM access; keep logic that can be unit tested in those.
- The data source is a Google Apps Script web app that dumps a Google Sheet as JSON. The script returns every
  column keyed by header text, so the page, not the script, decides which columns matter. Header matching in
  `data.js` is case-insensitive.
- `raffle/config.js` holds the Apps Script URL. `?data=<url>` overrides it only when served from localhost;
  `?demo=1` loads `sample-data.json`.
- `raffle/legacy.html` is the old jQuery/DataTables page. Leave it alone unless asked.

## Gotchas

- Directory names double as URLs (`/raffle`), so renaming a folder changes the public link.
- Apps Script cannot set HTTP status codes. Failures come back as `{ "ok": false, "error": "..." }` with status 200,
  so always check `ok`.
- Never render Sheet content with `innerHTML`. Use `textContent`; photo URLs must start with `http(s)://`.
- Errors render inline. Never use `alert`.
````

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Update README and CLAUDE.md for the rebuilt raffle page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

---

### Task 9: Connect the live feed (needs Patrick)

**Files:**
- Modify: `raffle/config.js`

**Interfaces:**
- Consumes: the web app URL produced by following `raffle/apps-script/SETUP.md`.

This task is blocked until Patrick creates the Sheet and deploys the script.

- [ ] **Step 1: Verify the URL returns the contract**

Run (replace the URL):

```bash
curl -sL "https://script.google.com/macros/s/XXXX/exec" | head -c 600
```

Expected: JSON starting with `{"ok":true,"updated":"...","settings":{...},"rows":[...]}`.

- [ ] **Step 2: Verify the live page against it without committing**

Open `http://localhost:8765/raffle/?data=<url>` and confirm the Sheet's Title and rows appear. Edit a cell in the Sheet, wait up to 35 seconds, and confirm the page updates without a reload.

- [ ] **Step 3: Set `DATA_URL`**

In `raffle/config.js`, set:

```js
export const DATA_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: 23 tests pass.

```bash
git add raffle/config.js
git commit -m "$(cat <<'EOF'
Point raffle page at the new Apps Script feed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kLqFZi5rJwdACid9iQjvD
EOF
)"
```

- [ ] **Step 5: Push and verify production**

`git push origin main` requires a GitHub account with write access to `scwny/scwny-website`. The account currently configured (BigLoopy) was denied. Once access is fixed, push, wait about a minute, then open `https://www.scwny.org/raffle/` on a phone and confirm live data loads.
