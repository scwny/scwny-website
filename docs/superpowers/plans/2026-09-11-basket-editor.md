# Basket Editor Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `www.scwny.org/raffle/edit`, a password-gated page where raffle organizers edit basket text with a live Markdown preview and attach photos from a phone, writing back to the Google Sheet through the existing Apps Script.

**Architecture:** A second static page in `raffle/edit/` reads the same JSON feed as the results page and posts JSON writes to the same Apps Script URL, which gains a `doPost` with `save` and `photo` actions guarded by a shared password stored in the Sheet's Settings tab. The page shrinks photos in the browser before upload; the script stores them in Drive and writes the share link into the Photo column. The Markdown node renderers move out of `raffle.js` into a shared `render.js` so both pages draw formatted text the same way.

**Tech Stack:** Plain HTML, CSS, and ES modules with no dependencies. Node 22 built-in test runner. Google Apps Script (V8, but written as ES5 so the Node `vm` sandbox in the tests can load it). Python `http.server` for local preview.

**Spec:** `docs/superpowers/specs/2026-09-11-basket-editor-design.md`

## Global Constraints

- No third-party JavaScript or CSS. No build step.
- Never call `alert`, `confirm`, or `prompt`. Errors render inline.
- Sheet content is never put through `innerHTML`. Use `textContent` or the renderers in `raffle/render.js`. URLs only go into `src` and `href` and must start with `http://` or `https://`.
- Apps Script responses are always HTTP 200 JSON; failure is `{ "ok": false, "error": "..." }`. Always check `ok`.
- Writes are `POST` to the feed URL with `Content-Type: text/plain;charset=utf-8` and a JSON body. No other headers.
- Settings key for the password, exact text: `Editor password`. It must never appear in the public feed.
- `localStorage` key for the password: `scwny.raffle.editorPassword`. Every storage access is wrapped in try/catch.
- Photo limits: the page sends a JPEG at most 1600 px on the long side, quality 0.85. The script rejects more than 4 MB decoded with the error `Photo too large`.
- Text fields the script accepts in `save`, exact header text: `Description`, `Winning Ticket`, `Details`, `Donated By`. Nothing else is written by `save`.
- `Code.gs` stays ES5 (`var`, `function`, no arrow functions, no template strings, no `const`/`let`) so `tests/apps-script.test.mjs` can evaluate it in a bare `vm` sandbox.
- `raffle/edit/` is part of the public site. Do not add it to `_config.yml` `exclude`.
- Working directory for every command: `C:/Users/Patrick/OneDrive/SCWNY/git/scwny-website`.
- Run `npm test` before every commit. All tests must pass.
- Commit directly on `main` (solo project, no pull requests). Commit messages end with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8
  ```
  Use repeated `-m` flags rather than a heredoc; heredocs inside the Bash tool have failed in this repo.

## File Structure

| File | Responsibility |
| --- | --- |
| `raffle/source.js` (modify) | `resolveDataUrl` gains a `demoUrl` option so the editor, one folder deeper, can find `sample-data.json`. |
| `raffle/render.js` (new) | DOM builders for parsed Markdown: `renderInline`, `renderBlocks`, `setInline`, `setBlocks`. Moved out of `raffle.js`. |
| `raffle/raffle.js` (modify) | Imports the renderers from `render.js`. No behavior change. |
| `raffle/apps-script/Code.gs` (modify) | `doPost` plus pure helpers `checkPassword`, `parseEditRequest`, `upsertBasket`, `driveViewUrl`, `rowObject`; `publicSettings` also hides `Editor password`. |
| `raffle/apps-script/SETUP.md` (modify) | New section for enabling the editor page. |
| `raffle/edit/editor.js` (new) | Pure: image size arithmetic, form validation, changed-field diffing, payload and response handling, list filtering and merging. |
| `raffle/edit/edit.js` (new) | DOM, fetch, password storage, screens, photo shrinking, demo stub. |
| `raffle/edit/index.html` (new) | Markup for the three screens. Loads `../raffle.css` then `edit.css`. |
| `raffle/edit/edit.css` (new) | Styles specific to the editor: basket list buttons, toolbar, textarea, preview, photo block, confirm bar. |
| `tests/source.test.mjs` (modify) | Covers `demoUrl`. |
| `tests/render.test.mjs` (new) | Renders into a stub `document` and checks node shapes and link attributes. |
| `tests/apps-script.test.mjs` (modify) | Covers the new pure helpers. |
| `tests/editor.test.mjs` (new) | Covers `editor.js`. |
| `README.md`, `CLAUDE.md` (modify) | Mention the editor page and `render.js`. |

---

### Task 1: Let `resolveDataUrl` take a demo path

The editor lives in `raffle/edit/`, so the hard-coded `./sample-data.json` would resolve to the wrong folder. Add an option instead of duplicating the function.

**Files:**
- Modify: `raffle/source.js`
- Test: `tests/source.test.mjs`

**Interfaces:**
- Produces: `resolveDataUrl({ search, hostname, defaultUrl, demoUrl = './sample-data.json' }) -> string`. Returns `demoUrl` when `?demo=1` is present. All other behavior unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/source.test.mjs`:

```js
test('resolveDataUrl returns the caller-supplied demo path when one is given', () => {
  const url = resolveDataUrl({
    search: '?demo=1',
    hostname: 'www.scwny.org',
    defaultUrl: 'https://script.google.com/x/exec',
    demoUrl: '../sample-data.json',
  });
  assert.equal(url, '../sample-data.json');
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npm test -- --test-name-pattern="demo path"`
Expected: FAIL, actual value `./sample-data.json`.

- [ ] **Step 3: Add the option**

In `raffle/source.js`, change the signature and the demo branch:

```js
export function resolveDataUrl({ search, hostname, defaultUrl, demoUrl = './sample-data.json' }) {
  const params = new URLSearchParams(search ?? '');
  if (params.get('demo') === '1') return demoUrl;
  const override = params.get('data');
  if (override && isLocalHost(hostname) && /^https?:\/\//i.test(override)) return override;
  return defaultUrl ?? '';
}
```

Update the doc comment above it to mention: "`demoUrl` is the path to the sample file relative to the calling page; the default suits `raffle/`."

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS, including the existing demo test that expects `./sample-data.json`.

- [ ] **Step 5: Commit**

```bash
git add raffle/source.js tests/source.test.mjs
git commit -m "Let resolveDataUrl take the demo file path" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

---

### Task 2: Move the Markdown node renderers into `raffle/render.js`

**Files:**
- Create: `raffle/render.js`
- Modify: `raffle/raffle.js:5` (imports) and `raffle/raffle.js:142-192` (the four renderer functions)
- Test: `tests/render.test.mjs`

**Interfaces:**
- Produces, from `raffle/render.js`:
  - `renderInline(nodes, parent)` appends DOM nodes built from `parseInline` output to `parent`.
  - `renderBlocks(blocks, parent)` appends `<p>` and `<ul>` built from `parseBlocks` output.
  - `setInline(element, text)` clears `element` and renders `parseInline(text)` into it.
  - `setBlocks(element, text)` clears `element` and renders `parseBlocks(text)` into it.
- Consumes: `parseInline`, `parseBlocks` from `raffle/markdown.js`. Node shapes: inline `{type:'text',text}`, `{type:'br'}`, `{type:'strong'|'em',children}`, `{type:'link',href,children}`; blocks `{type:'paragraph',children}`, `{type:'list',items:[inlineNodes]}`.

- [ ] **Step 1: Write the failing test**

Create `tests/render.test.mjs`. It installs a tiny stand-in for `document` before importing the module. The stub records enough structure to assert on.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A minimal document: enough of createElement/createTextNode/appendChild to
// see what the renderers build. render.js only touches `document` inside its
// functions, so installing the stub before calling them is sufficient.
function element(tag) {
  return {
    tag,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...kids) {
      this.children = kids;
    },
  };
}
globalThis.document = {
  createElement: element,
  createTextNode: (text) => ({ tag: '#text', text }),
};

const { renderInline, renderBlocks, setInline, setBlocks } = await import('../raffle/render.js');
const { parseInline, parseBlocks } = await import('../raffle/markdown.js');

test('renderInline builds text, strong, em, br, and safe links', () => {
  const parent = element('div');
  renderInline(parseInline('Hi **there**\n[Chef](https://example.com)'), parent);
  const [text, strong, br, link] = parent.children;
  assert.equal(text.text, 'Hi ');
  assert.equal(strong.tag, 'strong');
  assert.equal(strong.children[0].text, 'there');
  assert.equal(br.tag, 'br');
  assert.equal(link.tag, 'a');
  assert.equal(link.href, 'https://example.com');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.children[0].text, 'Chef');
});

test('renderBlocks builds paragraphs and bulleted lists', () => {
  const parent = element('div');
  renderBlocks(parseBlocks('Includes:\n- Pasta\n- Sauce\n\nValue $80'), parent);
  const [p1, ul, p2] = parent.children;
  assert.equal(p1.tag, 'p');
  assert.equal(ul.tag, 'ul');
  assert.equal(ul.children.length, 2);
  assert.equal(ul.children[0].tag, 'li');
  assert.equal(ul.children[1].children[0].text, 'Sauce');
  assert.equal(p2.tag, 'p');
});

test('setInline and setBlocks replace existing content', () => {
  const target = element('div');
  target.children = [element('span')];
  setInline(target, 'plain');
  assert.equal(target.children.length, 1);
  assert.equal(target.children[0].text, 'plain');

  setBlocks(target, 'one\n\ntwo');
  assert.equal(target.children.length, 2);
  assert.equal(target.children[1].tag, 'p');
});

test('HTML in Sheet text comes out as literal text, never as elements', () => {
  const parent = element('div');
  renderInline(parseInline('<img src=x onerror=alert(1)>'), parent);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].tag, '#text');
  assert.equal(parent.children[0].text, '<img src=x onerror=alert(1)>');
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npm test -- --test-name-pattern="renderInline|renderBlocks|setInline|HTML in Sheet"`
Expected: FAIL with a module-not-found error for `../raffle/render.js`.

- [ ] **Step 3: Create `raffle/render.js`**

```js
// DOM builders for the plain objects markdown.js produces. Shared by the
// results page and the editor page. Nothing here parses HTML: every piece of
// Sheet text becomes a text node, and link hrefs were already checked to start
// with http(s):// by the parser.
import { parseInline, parseBlocks } from './markdown.js';

export function renderInline(nodes, parent) {
  for (const node of nodes) {
    if (node.type === 'text') {
      parent.appendChild(document.createTextNode(node.text));
    } else if (node.type === 'br') {
      parent.appendChild(document.createElement('br'));
    } else if (node.type === 'strong' || node.type === 'em') {
      const element = document.createElement(node.type);
      renderInline(node.children, element);
      parent.appendChild(element);
    } else if (node.type === 'link') {
      const link = document.createElement('a');
      link.href = node.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      renderInline(node.children, link);
      parent.appendChild(link);
    }
  }
}

export function renderBlocks(blocks, parent) {
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const p = document.createElement('p');
      renderInline(block.children, p);
      parent.appendChild(p);
    } else if (block.type === 'list') {
      const ul = document.createElement('ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        renderInline(item, li);
        ul.appendChild(li);
      }
      parent.appendChild(ul);
    }
  }
}

export function setInline(element, text) {
  element.replaceChildren();
  renderInline(parseInline(text), element);
}

export function setBlocks(element, text) {
  element.replaceChildren();
  renderBlocks(parseBlocks(text), element);
}
```

- [ ] **Step 4: Point `raffle.js` at it**

In `raffle/raffle.js`:

1. Change line 5 and add an import:
   ```js
   import { parseInline, parseBlocks, plainText } from './markdown.js';
   import { renderInline, renderBlocks, setInline, setBlocks } from './render.js';
   ```
   `parseInline`, `parseBlocks`, and `plainText` are still used directly in `renderWins`, `renderRow`, `matchesSearch`, and `render`.
2. Delete the four functions `renderInline`, `renderBlocks`, `setInline`, `setBlocks` (currently lines 142 to 192) together with the comment block above them that begins "Formatted text. markdown.js parses Sheet text". Leave the `// ---------- rendering ----------` divider.

- [ ] **Step 5: Run all tests and check the results page**

Run: `npm test`
Expected: all PASS.

Then serve and open the demo to confirm nothing visibly changed:

```
python -m http.server 8765
```

Open `http://localhost:8765/raffle/?demo=1`. Basket 1's Details should show a bulleted list with bold "San Marzano" and a working "Chef's" link; the banner shows bold "7:00 PM". Stop the server.

- [ ] **Step 6: Commit**

```bash
git add raffle/render.js raffle/raffle.js tests/render.test.mjs
git commit -m "Move Markdown node renderers into render.js for reuse" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

---

### Task 3: Pure Apps Script helpers for the editor

All of these run in the Node `vm` sandbox, so write them first and test them there. `doPost` itself comes in Task 4.

**Files:**
- Modify: `raffle/apps-script/Code.gs`
- Test: `tests/apps-script.test.mjs`

**Interfaces:**
- Produces (all ES5, in `Code.gs`):
  - `PASSWORD_SETTING = 'Editor password'`, `HIDDEN_SETTINGS = [UPLOADERS_SETTING, PASSWORD_SETTING]`, `TEXT_FIELDS = ['Description', 'Winning Ticket', 'Details', 'Donated By']`, `MAX_PHOTO_BYTES = 4 * 1024 * 1024`, `PHOTO_FOLDER = 'Raffle photos'`.
  - `rowObject(headers, row) -> object` keyed by trimmed header, blank headers skipped, values trimmed strings.
  - `checkPassword(given, stored) -> ''` when accepted, otherwise the error string to return.
  - `parseEditRequest(body) -> request | string`. `request` is `{ action, password, basket, fields }` for `save` or `{ action, password, basket, name, type, data }` for `photo`. A string is the error to return.
  - `upsertBasket(values, basket, fields) -> { headers, row, rowIndex }`. Does not mutate `values`. `headers` and `row` are padded to the same width. `rowIndex` is 0-based within the grid (header row is 0).
  - `driveViewUrl(id) -> 'https://drive.google.com/file/d/<id>/view'`.
  - `findColumn` learns the alias `'winning ticket': ['winning ticket', 'winner']`.
- Consumes: existing `findColumn`, `findBasketRow`, `UPLOADERS_SETTING`, `BASKETS_SHEET`.

- [ ] **Step 1: Write the failing tests**

In `tests/apps-script.test.mjs`, extend the sandbox export list:

```js
const gs = vm.runInNewContext(
  `${source}; ({ isAllowedUploader, driveFileId, photoSubmission, findBasketRow, findColumn, publicSettings,
     rowObject, checkPassword, parseEditRequest, upsertBasket, driveViewUrl })`,
  {},
);
```

Append these tests:

```js
test('publicSettings also hides the editor password', () => {
  const settings = { Title: 'Raffle', 'Editor password': 'hunter2', 'editor PASSWORD': 'x', Message: 'Hi' };
  assert.deepEqual({ ...gs.publicSettings(settings) }, { Title: 'Raffle', Message: 'Hi' });
});

test('rowObject keys a row by trimmed header and skips blank headers', () => {
  const obj = gs.rowObject(['Basket', ' Description ', '', 'Photo'], [' 7 ', 'Italian Night', 'ignored', undefined]);
  assert.deepEqual({ ...obj }, { Basket: '7', Description: 'Italian Night', Photo: '' });
});

test('checkPassword refuses everything when no password is configured', () => {
  assert.equal(gs.checkPassword('anything', ''), 'Editing is disabled: no Editor password in Settings');
  assert.equal(gs.checkPassword('anything', undefined), 'Editing is disabled: no Editor password in Settings');
});

test('checkPassword accepts an exact match after trimming and rejects the rest', () => {
  assert.equal(gs.checkPassword(' hunter2 ', 'hunter2'), '');
  assert.equal(gs.checkPassword('Hunter2', 'hunter2'), 'Wrong password');
  assert.equal(gs.checkPassword('', 'hunter2'), 'Wrong password');
});

test('parseEditRequest rejects bad JSON, unknown actions, and a missing basket', () => {
  assert.equal(gs.parseEditRequest('not json'), 'Bad request');
  assert.equal(gs.parseEditRequest(''), 'Bad request');
  assert.equal(gs.parseEditRequest('[1,2]'), 'Bad request');
  assert.equal(gs.parseEditRequest('{"action":"delete","basket":"1"}'), 'Unknown action');
  assert.equal(gs.parseEditRequest('{"action":"save","basket":"  "}'), 'Basket number is required');
});

test('parseEditRequest keeps only the four text fields for save, as strings', () => {
  const body = JSON.stringify({
    action: 'save',
    password: 'pw',
    basket: ' 12 ',
    fields: { Description: 'Spa Day', 'Winning Ticket': 250, Basket: 'nope', Photo: 'nope', Details: null },
  });
  const request = gs.parseEditRequest(body);
  assert.equal(request.action, 'save');
  assert.equal(request.password, 'pw');
  assert.equal(request.basket, '12');
  assert.deepEqual({ ...request.fields }, { Description: 'Spa Day', 'Winning Ticket': '250', Details: '' });
});

test('parseEditRequest requires image data and an image type for photo', () => {
  assert.equal(gs.parseEditRequest('{"action":"photo","basket":"1"}'), 'Bad request');
  assert.equal(gs.parseEditRequest('{"action":"photo","basket":"1","data":"abc","type":"text/html"}'), 'Bad request');
  const request = gs.parseEditRequest('{"action":"photo","password":"pw","basket":"1","data":"abc"}');
  assert.equal(request.action, 'photo');
  assert.equal(request.type, 'image/jpeg');
  assert.equal(request.name, 'photo.jpg');
  assert.equal(request.data, 'abc');
});

test('upsertBasket writes fields into the matching row and leaves other columns alone', () => {
  const values = [
    ['Basket', 'Description', 'Winning Ticket', 'Details'],
    ['1', 'Italian Night', '104', 'Pasta'],
    ['2', 'Movie Night', '', ''],
  ];
  const result = gs.upsertBasket(values, '2', { Description: 'Movie Night!', Details: 'Popcorn' });
  assert.equal(result.rowIndex, 2);
  assert.deepEqual([...result.headers], ['Basket', 'Description', 'Winning Ticket', 'Details']);
  assert.deepEqual([...result.row], ['2', 'Movie Night!', '', 'Popcorn']);
  assert.deepEqual(values[2], ['2', 'Movie Night', '', ''], 'input grid is not mutated');
});

test('upsertBasket appends a row for a new basket and a column for a new header', () => {
  const values = [['Basket #', 'Description'], ['1', 'Italian Night']];
  const result = gs.upsertBasket(values, '12', { Description: 'Spa Day', 'Donated By': 'Jane' });
  assert.equal(result.rowIndex, 2);
  assert.deepEqual([...result.headers], ['Basket #', 'Description', 'Donated By']);
  assert.deepEqual([...result.row], ['12', 'Spa Day', 'Jane']);
});

test('upsertBasket writes Winning Ticket into an old Winner column instead of adding one', () => {
  const values = [['Basket', 'Winner'], ['3', '']];
  const result = gs.upsertBasket(values, '3', { 'Winning Ticket': '77' });
  assert.deepEqual([...result.headers], ['Basket', 'Winner']);
  assert.deepEqual([...result.row], ['3', '77']);
});

test('upsertBasket throws when the sheet has no Basket header', () => {
  assert.throws(() => gs.upsertBasket([['Name', 'Description']], '1', { Description: 'x' }), /No "Basket" header/);
});

test('driveViewUrl builds the link the results page already understands', () => {
  assert.equal(gs.driveViewUrl('1AbC_d-9xyz'), 'https://drive.google.com/file/d/1AbC_d-9xyz/view');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- --test-name-pattern="publicSettings also|rowObject|checkPassword|parseEditRequest|upsertBasket|driveViewUrl"`
Expected: the sandbox evaluation throws `ReferenceError: rowObject is not defined` (or similar), so the whole file fails to load.

- [ ] **Step 3: Add constants and `publicSettings` change**

In `Code.gs`, after the `UPLOADERS_SETTING` line add:

```js
var PASSWORD_SETTING = 'Editor password'; // Settings row the editor page must match; see doPost
var HIDDEN_SETTINGS = [UPLOADERS_SETTING, PASSWORD_SETTING];
var TEXT_FIELDS = ['Description', 'Winning Ticket', 'Details', 'Donated By']; // columns `save` may write
var PHOTO_FOLDER = 'Raffle photos'; // Drive folder for photos uploaded through the editor page
var MAX_PHOTO_BYTES = 4 * 1024 * 1024;
```

Replace `publicSettings` with:

```js
/** Settings minus rows that are for the script only: uploader emails and the editor password. */
function publicSettings(settings) {
  var hidden = HIDDEN_SETTINGS.map(function (key) { return key.toLowerCase(); });
  var out = {};
  Object.keys(settings).forEach(function (key) {
    if (hidden.indexOf(key.trim().toLowerCase()) < 0) out[key] = settings[key];
  });
  return out;
}
```

- [ ] **Step 4: Add `rowObject` and use it in `readRows`**

Replace the `.map(...)` at the end of `readRows` so it reads:

```js
    .map(function (row) { return rowObject(headers, row); });
```

and add below `readRows`:

```js
/** One sheet row as the feed returns it: keyed by trimmed header, blank headers skipped. */
function rowObject(headers, row) {
  var obj = {};
  headers.forEach(function (header, i) {
    var key = String(header == null ? '' : header).trim();
    if (key) obj[key] = String(row[i] == null ? '' : row[i]).trim();
  });
  return obj;
}
```

- [ ] **Step 5: Add the editor helpers**

Append to `Code.gs`, after the `findBasketRow` function, a new section:

```js
/* ---------- Basket editor page (raffle/edit) ----------
 *
 * The editor page POSTs JSON to this web app. Two actions: "save" writes text
 * columns for one basket, "photo" stores an uploaded picture in Drive and writes
 * its link into the Photo column. Both need the password from the Settings row
 * "Editor password". The helpers here are pure so the unit tests can load them.
 */

/** '' when the password matches, otherwise the error to send back. */
function checkPassword(given, stored) {
  var expected = String(stored == null ? '' : stored).trim();
  if (!expected) return 'Editing is disabled: no ' + PASSWORD_SETTING + ' in Settings';
  if (String(given == null ? '' : given).trim() !== expected) return 'Wrong password';
  return '';
}

/** Parse and validate a POST body. Returns a request object, or an error string. */
function parseEditRequest(body) {
  var data;
  try {
    data = JSON.parse(String(body || ''));
  } catch (err) {
    return 'Bad request';
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Bad request';
  var action = String(data.action || '');
  if (action !== 'save' && action !== 'photo') return 'Unknown action';
  var basket = String(data.basket == null ? '' : data.basket).trim();
  if (!basket) return 'Basket number is required';

  var request = { action: action, password: String(data.password == null ? '' : data.password), basket: basket };
  if (action === 'save') {
    var given = data.fields && typeof data.fields === 'object' ? data.fields : {};
    request.fields = {};
    TEXT_FIELDS.forEach(function (name) {
      if (Object.prototype.hasOwnProperty.call(given, name)) {
        request.fields[name] = String(given[name] == null ? '' : given[name]);
      }
    });
    return request;
  }
  request.name = String(data.name || 'photo.jpg');
  request.type = String(data.type || 'image/jpeg');
  request.data = String(data.data || '');
  if (!request.data || !/^image\//.test(request.type)) return 'Bad request';
  return request;
}

/**
 * Pure: copy the values grid, write `fields` (keyed by header) into the basket's
 * row, appending a row for a new basket and a header for a new column. The
 * returned headers and row are padded to the same width so the caller can write
 * them back with two setValues calls.
 */
function upsertBasket(values, basket, fields) {
  var grid = (values || []).map(function (row) { return row.slice(); });
  if (grid.length === 0) grid.push([]);
  var headers = grid[0].map(function (h) { return String(h == null ? '' : h); });
  var basketCol = findColumn(headers, 'basket');
  if (basketCol < 0) throw new Error('No "Basket" header in ' + BASKETS_SHEET);

  var rowIndex = findBasketRow(grid, basketCol, basket);
  if (rowIndex < 0) {
    rowIndex = grid.length;
    grid.push([]);
  }
  var row = grid[rowIndex];

  Object.keys(fields || {}).forEach(function (name) {
    var col = findColumn(headers, name.toLowerCase());
    if (col < 0) {
      headers.push(name);
      col = headers.length - 1;
    }
    row[col] = String(fields[name] == null ? '' : fields[name]);
  });
  row[basketCol] = String(basket).trim();

  var width = Math.max(headers.length, row.length);
  for (var i = 0; i < width; i++) {
    if (headers[i] == null) headers[i] = '';
    if (row[i] == null) row[i] = '';
  }
  return { headers: headers, row: row, rowIndex: rowIndex };
}

function driveViewUrl(id) {
  return 'https://drive.google.com/file/d/' + id + '/view';
}
```

- [ ] **Step 6: Teach `findColumn` the Winner alias**

Replace the `aliases` line in `findColumn` with:

```js
  var aliases = {
    basket: ['basket', 'basket #'],
    photo: ['photo'],
    'winning ticket': ['winning ticket', 'winner'],
  }[field] || [field];
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add raffle/apps-script/Code.gs tests/apps-script.test.mjs
git commit -m "Add pure Apps Script helpers for the basket editor" -m "Password check, request parsing, and a grid upsert, all testable in the vm sandbox. publicSettings now also hides the Editor password row." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

---

### Task 4: `doPost` in Apps Script and the setup instructions

These functions touch Google services, so they cannot be unit tested. They are thin: every decision is in the Task 3 helpers. The test suite still proves the file parses.

**Files:**
- Modify: `raffle/apps-script/Code.gs`
- Modify: `raffle/apps-script/SETUP.md`

**Interfaces:**
- Consumes: Task 3 helpers.
- Produces: `doPost(e)` returning JSON `{ ok: true, basket, row }` or `{ ok: false, error }`; `writeBasket(sheet, basket, fields) -> row object`; `storePhoto(request) -> drive view url`; `photoFolder() -> Folder`.

- [ ] **Step 1: Add `doPost` and its helpers**

Append to the editor section of `Code.gs`, after `driveViewUrl`:

```js
function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  var result;
  try {
    var request = parseEditRequest(e && e.postData ? e.postData.contents : '');
    if (typeof request === 'string') throw new Error(request);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stored = readSettings(ss.getSheetByName(SETTINGS_SHEET))[PASSWORD_SETTING];
    var denied = checkPassword(request.password, stored);
    if (denied) throw new Error(denied);

    var sheet = ss.getSheetByName(BASKETS_SHEET);
    if (!sheet) throw new Error('Sheet tab "' + BASKETS_SHEET + '" not found');

    // Photo first, outside the lock: Drive is slow and does not touch the sheet.
    var fields = request.action === 'photo' ? { Photo: storePhoto(request) } : request.fields;

    lock.waitLock(20000);
    locked = true;
    var row = writeBasket(sheet, request.basket, fields);
    CacheService.getScriptCache().remove(CACHE_KEY);
    result = { ok: true, basket: request.basket, row: row };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    if (locked) lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/** Read the sheet, upsert the basket, write the header row and that row back. */
function writeBasket(sheet, basket, fields) {
  var result = upsertBasket(sheet.getDataRange().getDisplayValues(), basket, fields);
  var width = result.headers.length;
  sheet.getRange(1, 1, 1, width).setValues([result.headers]);
  sheet.getRange(result.rowIndex + 1, 1, 1, width).setValues([result.row]);
  return rowObject(result.headers, result.row);
}

/** Decode the uploaded image, save it in the photo folder, share it, return its link. */
function storePhoto(request) {
  var bytes = Utilities.base64Decode(request.data);
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Photo too large');
  var blob = Utilities.newBlob(bytes, request.type, request.name);
  var file = photoFolder().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return driveViewUrl(file.getId());
}

function photoFolder() {
  var folders = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER);
}
```

Also update the file's header comment (the `Deploy:` / `Update:` block at the top) to add one line: ` * Writes:  doPost handles the editor page at /raffle/edit. See SETUP.md "Editing baskets".`

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: all PASS. This proves `Code.gs` still parses as ES5 in the sandbox. The sandbox never calls `doPost`.

- [ ] **Step 3: Write the SETUP.md section**

In `raffle/apps-script/SETUP.md`, insert a new section immediately before `## During the event`:

````markdown
## Editing baskets from the editor page

The page at https://www.scwny.org/raffle/edit lets organizers type basket descriptions in
a real text box with a preview, and take photos from a phone, without opening the Sheet.
It writes into the same Baskets tab. The Sheet stays the master copy: anything you type
there still works, and you can still use the photo Form.

### One-time setup (about five minutes)

1. In the raffle Sheet, **Settings** tab, add a row: A = `Editor password`, B = a password
   of your choosing. This row never appears on the public page. Leaving it blank turns the
   editor off.
2. **Extensions > Apps Script**. Make sure the editor has the current `Code.gs` (it must
   contain `doPost`). Save.
3. **Deploy > Manage deployments**, click the pencil, set Version to **New version**, and
   click **Deploy**. The URL stays the same. If Apps Script asks for new permissions
   (Drive, for storing photos), allow them.
4. Open https://www.scwny.org/raffle/edit, type the password, and you should see the
   basket list. Send the page link and the password to the other organizers.

### Using it

- Tap a basket to edit it, or **Add basket** for a new one. **Save** writes the text.
- **Take or choose photo** uploads right away. There is no need to press Save for a photo.
  On a phone it opens the camera. Photos are shrunk before upload, so they take a few
  seconds on venue Wi-Fi.
- The preview under Details shows exactly what the results page will show.
- Only the fields you changed are written, so two people can work on different parts of
  the same basket. If two people change the same field, the later save wins.
- Photos land in a Drive folder named **Raffle photos**, shared as anyone-with-link. A
  replaced photo stays in the folder; delete the folder after the event if you like.
- Wrong password or a blank `Editor password` row shows an error under the Save button.
  **Log out** at the bottom of the page forgets the password on that device.

### If something does not save

Open the Apps Script editor, **Executions** in the left sidebar, and look at the latest
`doPost` run. The error text there matches what the page showed.
````

Also update the "## If you ever change the script" paragraph so it mentions that the editor page's writes go to the same URL, so no site change is needed after redeploying. One sentence.

- [ ] **Step 4: Commit**

```bash
git add raffle/apps-script/Code.gs raffle/apps-script/SETUP.md
git commit -m "Accept basket edits and photo uploads through doPost" -m "The editor page posts JSON to the existing web app URL. Text saves go through a script lock; photos are stored in a Raffle photos Drive folder and linked from the Photo column." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

---

### Task 5: The pure editor module

**Files:**
- Create: `raffle/edit/editor.js`
- Test: `tests/editor.test.mjs`

**Interfaces:**
- Consumes: `normalizeRow`, `compareBaskets` from `raffle/data.js`; `plainText` from `raffle/markdown.js`. Normalized row shape: `{ basket, description, ticket, details, donatedBy, photo }`, all strings.
- Produces:
  - `MAX_PHOTO_EDGE = 1600`, `JPEG_QUALITY = 0.85`.
  - `FIELD_HEADERS = { description: 'Description', ticket: 'Winning Ticket', details: 'Details', donatedBy: 'Donated By' }`.
  - `fitWithin(width, height, maxEdge = MAX_PHOTO_EDGE) -> { width, height }` integers, at least 1.
  - `emptyForm() -> { basket:'', description:'', ticket:'', details:'', donatedBy:'' }`.
  - `formFromRow(row) -> form` (same five keys, copied from a normalized row).
  - `validateBasket(form, { isNew, existing }) -> errors` object with optional `basket` and `description` messages; empty object means valid.
  - `changedFields(original, current) -> { [header]: value }` for fields whose trimmed values differ.
  - `buildSavePayload({ password, basket, fields })`, `buildPhotoPayload({ password, basket, data, type = 'image/jpeg' })`.
  - `readResponse(text) -> { ok: true, row } | { ok: false, error }` with `row` normalized.
  - `filterBaskets(rows, query) -> rows`.
  - `mergeRow(rows, row) -> rows` with `row` replacing any same-numbered row, sorted.

- [ ] **Step 1: Write the failing tests**

Create `tests/editor.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitWithin,
  emptyForm,
  formFromRow,
  validateBasket,
  changedFields,
  buildSavePayload,
  buildPhotoPayload,
  readResponse,
  filterBaskets,
  mergeRow,
} from '../raffle/edit/editor.js';

const row = (basket, extra = {}) => ({
  basket, description: '', ticket: '', details: '', donatedBy: '', photo: '', ...extra,
});

test('fitWithin shrinks the long edge to the limit and keeps the aspect ratio', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
});

test('fitWithin leaves small and square images alone and never returns zero', () => {
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 1600, 1600), { width: 1600, height: 1600 });
  assert.deepEqual(fitWithin(5000, 1, 1600), { width: 1600, height: 1 });
});

test('emptyForm and formFromRow produce the five editable fields', () => {
  assert.deepEqual(emptyForm(), { basket: '', description: '', ticket: '', details: '', donatedBy: '' });
  const form = formFromRow(row('7', { description: 'Spa', ticket: '9', details: 'd', donatedBy: 'J', photo: 'https://x' }));
  assert.deepEqual(form, { basket: '7', description: 'Spa', ticket: '9', details: 'd', donatedBy: 'J' });
});

test('validateBasket requires a basket number and a description', () => {
  assert.deepEqual(validateBasket({ ...emptyForm() }, { isNew: true }), {
    basket: 'Basket number is required.',
    description: 'Description is required.',
  });
  assert.deepEqual(validateBasket({ ...emptyForm(), basket: '3', description: 'Spa' }, { isNew: true }), {});
});

test('validateBasket rejects a new basket whose number already exists', () => {
  const existing = new Set(['1', '12']);
  const errors = validateBasket({ ...emptyForm(), basket: '12', description: 'Spa' }, { isNew: true, existing });
  assert.equal(errors.basket, 'Basket 12 already exists. Pick it from the list to edit it.');
  assert.deepEqual(validateBasket({ ...emptyForm(), basket: '12', description: 'Spa' }, { isNew: false, existing }), {});
});

test('changedFields returns only differing fields, trimmed and keyed by sheet header', () => {
  const original = { basket: '1', description: 'Italian Night', ticket: '', details: 'Pasta', donatedBy: '' };
  const current = { basket: '1', description: 'Italian Night ', ticket: '104', details: 'Pasta\nSauce', donatedBy: '' };
  assert.deepEqual(changedFields(original, current), { 'Winning Ticket': '104', Details: 'Pasta\nSauce' });
  assert.deepEqual(changedFields(original, original), {});
});

test('changedFields from an empty form sends every non-blank field for a new basket', () => {
  const current = { basket: '12', description: 'Spa Day', ticket: '', details: '', donatedBy: 'Jane' };
  assert.deepEqual(changedFields(emptyForm(), current), { Description: 'Spa Day', 'Donated By': 'Jane' });
});

test('buildSavePayload and buildPhotoPayload match the script contract', () => {
  assert.deepEqual(buildSavePayload({ password: 'pw', basket: '12', fields: { Description: 'Spa' } }), {
    action: 'save', password: 'pw', basket: '12', fields: { Description: 'Spa' },
  });
  assert.deepEqual(buildPhotoPayload({ password: 'pw', basket: '5A', data: 'AAAA' }), {
    action: 'photo', password: 'pw', basket: '5A', name: 'basket-5A.jpg', type: 'image/jpeg', data: 'AAAA',
  });
  assert.equal(buildPhotoPayload({ password: 'pw', basket: 'a/b c', data: 'x' }).name, 'basket-a_b_c.jpg');
});

test('readResponse normalizes a good row and turns failures into error strings', () => {
  const good = readResponse('{"ok":true,"basket":"12","row":{"Basket":" 12 ","Description":"Spa","Photo":""}}');
  assert.equal(good.ok, true);
  assert.equal(good.row.basket, '12');
  assert.equal(good.row.description, 'Spa');

  assert.deepEqual(readResponse('{"ok":false,"error":"Wrong password"}'), { ok: false, error: 'Wrong password' });
  assert.deepEqual(readResponse('<html>sign in</html>'), { ok: false, error: 'Unexpected response from the server.' });
  assert.deepEqual(readResponse('{"rows":[]}'), { ok: false, error: 'Unexpected response from the server.' });
});

test('filterBaskets matches the number or the plain-text description, case-insensitively', () => {
  const rows = [row('1', { description: '**Bills** Fan Pack' }), row('12', { description: 'Spa Day' }), row('5A')];
  assert.deepEqual(filterBaskets(rows, '').map((r) => r.basket), ['1', '12', '5A']);
  assert.deepEqual(filterBaskets(rows, 'bills').map((r) => r.basket), ['1']);
  assert.deepEqual(filterBaskets(rows, '5a').map((r) => r.basket), ['5A']);
  assert.deepEqual(filterBaskets(rows, '1').map((r) => r.basket), ['1', '12']);
});

test('mergeRow replaces a basket in place or inserts a new one in basket order', () => {
  const rows = [row('1'), row('3')];
  const replaced = mergeRow(rows, row('3', { description: 'New' }));
  assert.deepEqual(replaced.map((r) => [r.basket, r.description]), [['1', ''], ['3', 'New']]);
  const inserted = mergeRow(rows, row('2'));
  assert.deepEqual(inserted.map((r) => r.basket), ['1', '2', '3']);
  assert.equal(rows.length, 2, 'input is not mutated');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- --test-name-pattern="fitWithin|emptyForm|validateBasket|changedFields|buildSavePayload|readResponse|filterBaskets|mergeRow"`
Expected: FAIL with module not found for `../raffle/edit/editor.js`.

- [ ] **Step 3: Create `raffle/edit/editor.js`**

```js
// Pure helpers for the basket editor page. No DOM, no fetch. edit.js owns those.
import { normalizeRow, compareBaskets } from '../data.js';
import { plainText } from '../markdown.js';

export const MAX_PHOTO_EDGE = 1600;
export const JPEG_QUALITY = 0.85;

// Form field -> Sheet header the script writes. Basket is sent separately.
export const FIELD_HEADERS = {
  description: 'Description',
  ticket: 'Winning Ticket',
  details: 'Details',
  donatedBy: 'Donated By',
};

const UNEXPECTED = 'Unexpected response from the server.';

/** Largest size with the same aspect ratio that fits in a maxEdge square. Never below 1 px. */
export function fitWithin(width, height, maxEdge = MAX_PHOTO_EDGE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export function emptyForm() {
  return { basket: '', description: '', ticket: '', details: '', donatedBy: '' };
}

export function formFromRow(row) {
  return {
    basket: row.basket,
    description: row.description,
    ticket: row.ticket,
    details: row.details,
    donatedBy: row.donatedBy,
  };
}

/** Field -> message for anything that must be fixed before saving. Empty when valid. */
export function validateBasket(form, { isNew = false, existing = new Set() } = {}) {
  const errors = {};
  if (!form.basket) errors.basket = 'Basket number is required.';
  else if (isNew && existing.has(form.basket)) {
    errors.basket = `Basket ${form.basket} already exists. Pick it from the list to edit it.`;
  }
  if (!form.description) errors.description = 'Description is required.';
  return errors;
}

/** Sheet header -> new value, for fields whose trimmed text differs from the original. */
export function changedFields(original, current) {
  const fields = {};
  for (const [key, header] of Object.entries(FIELD_HEADERS)) {
    const before = String(original?.[key] ?? '').trim();
    const after = String(current?.[key] ?? '').trim();
    if (before !== after) fields[header] = after;
  }
  return fields;
}

export function buildSavePayload({ password, basket, fields }) {
  return { action: 'save', password, basket, fields };
}

export function buildPhotoPayload({ password, basket, data, type = 'image/jpeg' }) {
  const safeBasket = String(basket).replace(/[^\w-]+/g, '_');
  return { action: 'photo', password, basket, name: `basket-${safeBasket}.jpg`, type, data };
}

/** Turn the script's response text into { ok, row } or { ok, error }. */
export function readResponse(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: UNEXPECTED };
  }
  if (!payload || typeof payload !== 'object' || payload.ok !== true) {
    const error = payload && payload.error ? String(payload.error) : UNEXPECTED;
    return { ok: false, error };
  }
  return { ok: true, row: normalizeRow(payload.row) };
}

export function filterBaskets(rows, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (row) => row.basket.toLowerCase().includes(q) || plainText(row.description).toLowerCase().includes(q),
  );
}

/** A new rows array with `row` replacing any row with the same basket number, kept sorted. */
export function mergeRow(rows, row) {
  return [...rows.filter((r) => r.basket !== row.basket), row].sort(compareBaskets);
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add raffle/edit/editor.js tests/editor.test.mjs
git commit -m "Add the pure editor module for the basket editor page" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

---

### Task 6: Editor page: login, list, form, preview, and text saves

This task produces a working page in demo mode for everything except photos and the unsaved-changes guard, which Task 7 adds.

**Files:**
- Create: `raffle/edit/index.html`, `raffle/edit/edit.css`, `raffle/edit/edit.js`

**Interfaces:**
- Consumes: `DATA_URL` from `../config.js`; `resolveDataUrl` (Task 1) from `../source.js`; `normalizeRows`, `photoUrls` from `../data.js`; `setInline`, `setBlocks` from `../render.js` (Task 2); everything from `./editor.js` (Task 5).
- Produces: element ids listed in the HTML below. Task 7 adds handlers for `#f-photo`, `#photo-status`, `#e-photo`, `#confirm-bar`, `#discard`, `#keep`, which are already in this markup.

- [ ] **Step 1: Write `raffle/edit/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Basket Editor · SCWNY</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="../SCWNYLOGO.png">
  <link rel="stylesheet" href="../raffle.css">
  <link rel="stylesheet" href="./edit.css">
</head>
<body>
  <header class="site-header">
    <img class="logo" src="../SCWNYLOGO.png" alt="Skating Club of Western New York">
    <h1>Basket Editor</h1>
  </header>

  <main>
    <p id="error" class="error" role="alert" hidden></p>

    <section id="login" class="panel" hidden>
      <form id="login-form" novalidate>
        <label for="password">Editor password</label>
        <input id="password" type="password" autocomplete="current-password">
        <p class="help">Ask whoever runs the raffle Sheet. It is the "Editor password" row on the Settings tab.</p>
        <div class="actions">
          <button type="submit" class="primary">Continue</button>
        </div>
      </form>
    </section>

    <section id="list" hidden>
      <div class="toolbar">
        <label for="search" class="visually-hidden">Search baskets</label>
        <input id="search" type="search" autocomplete="off" placeholder="Search baskets…">
        <button id="refresh" type="button">Refresh</button>
        <button id="add" type="button" class="primary">Add basket</button>
      </div>
      <p id="status" class="status" aria-live="polite">Loading baskets…</p>
      <ul id="baskets" class="baskets"></ul>
    </section>

    <section id="editor" class="panel" hidden>
      <form id="basket-form" novalidate>
        <h2 id="editor-heading">Edit basket</h2>

        <label for="f-basket">Basket</label>
        <input id="f-basket" type="text" inputmode="numeric" autocomplete="off">
        <p id="e-basket" class="field-error" hidden></p>

        <label for="f-description">Description</label>
        <input id="f-description" type="text" autocomplete="off">
        <p id="p-description" class="preview-inline" aria-hidden="true"></p>
        <p id="e-description" class="field-error" hidden></p>

        <label for="f-ticket">Winning Ticket</label>
        <input id="f-ticket" type="text" inputmode="numeric" autocomplete="off">

        <label for="f-details">Details</label>
        <textarea id="f-details" rows="8"></textarea>
        <p class="help hint">**bold** &nbsp; *italic* &nbsp; [text](https://link) &nbsp; - bullet</p>
        <div class="preview">
          <div class="preview-label">Preview</div>
          <div id="p-details" class="details-body"></div>
        </div>

        <label for="f-donated">Donated By</label>
        <input id="f-donated" type="text" autocomplete="off">
        <p id="p-donated" class="preview-inline donor" aria-hidden="true"></p>

        <fieldset class="photo-block">
          <legend>Photo</legend>
          <div id="photo-current" class="photo-current"></div>
          <label id="photo-button" class="button" for="f-photo">Take or choose photo</label>
          <input id="f-photo" type="file" accept="image/*" capture="environment" class="visually-hidden">
          <p id="photo-status" class="help"></p>
          <p id="e-photo" class="field-error" hidden></p>
        </fieldset>

        <div id="confirm-bar" class="confirm" hidden>
          <span>You have unsaved changes.</span>
          <button type="button" id="discard">Discard</button>
          <button type="button" id="keep" class="primary">Keep editing</button>
        </div>

        <p id="e-save" class="field-error" hidden></p>
        <p id="note" class="help" aria-live="polite"></p>
        <div class="actions">
          <button type="button" id="back">Back to list</button>
          <button type="submit" id="save" class="primary">Save</button>
        </div>
      </form>
    </section>
  </main>

  <footer class="site-footer">
    Skating Club of Western New York ·
    <a href="../">Results page</a> ·
    <a href="#" id="logout">Log out</a>
  </footer>

  <script type="module" src="./edit.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `raffle/edit/edit.css`**

```css
/* Editor-only styles. raffle.css provides variables, .panel, .error, .help, inputs. */

main { max-width: 720px; }

h2 { font-size: 1.25rem; margin: 0 0 12px; }

textarea,
input[type="password"] {
  width: 100%;
  font: inherit;
  font-size: 1.05rem;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}
textarea { resize: vertical; line-height: 1.4; min-height: 9em; }
textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

label + input, label + textarea { margin-bottom: 4px; }
#basket-form label { margin-top: 14px; }
#basket-form label:first-of-type { margin-top: 0; }
input[readonly] { background: #eef2f6; color: var(--muted); }

button, .button {
  font: inherit;
  font-size: 1rem;
  padding: 10px 16px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: #fff;
  color: var(--accent);
  cursor: pointer;
  display: inline-block;
  line-height: 1.2;
}
button.primary, .button.primary { background: var(--accent); color: #fff; }
button:disabled { opacity: 0.6; cursor: default; }
.actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }

.toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.toolbar input[type="search"] { flex: 1 1 200px; }

.baskets { list-style: none; margin: 0; padding: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.baskets li + li { border-top: 1px solid var(--line); }
.basket-row {
  display: grid;
  grid-template-columns: 56px auto 1fr auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 0;
  background: #fff;
  color: var(--text);
  text-align: left;
}
.basket-row:hover, .basket-row:focus-visible { background: var(--accent-soft); outline: none; }
.basket-row .num { font-size: 1.1rem; }
.basket-row .desc { font-weight: 600; overflow-wrap: anywhere; }
.basket-row .ticket { color: var(--muted); font-size: 0.9rem; white-space: nowrap; }
.basket-row img, .no-photo { width: 56px; height: 42px; object-fit: cover; border-radius: 6px; display: block; }
.no-photo { background: #eef2f6; border: 1px dashed var(--line); }
.baskets .empty { padding: 24px; }

.field-error { color: var(--error-text); margin: 4px 0 0; font-size: 0.9rem; }
.hint { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85rem; }

.preview { margin-top: 8px; padding: 10px 12px; background: var(--accent-soft); border: 1px solid #bcd4ee; border-radius: 8px; }
.preview-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 4px; }
.preview .details-body > :first-child { margin-top: 0; }
.preview .details-body > :last-child { margin-bottom: 0; }
.preview .details-body p { margin: 6px 0 0; }
.preview-inline { margin: 4px 0 0; min-height: 1.2em; color: var(--muted); }
.preview-inline:empty { display: none; }

.photo-block { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px 12px; margin-top: 16px; }
.photo-block legend { font-weight: 600; padding: 0 4px; }
.photo-current { margin-bottom: 10px; }
.photo-current img { display: block; max-width: 240px; width: 100%; height: auto; border-radius: 8px; }
.photo-current .no-photo { width: 120px; height: 90px; }

.confirm {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 16px;
  padding: 10px 12px;
  background: var(--win-bg);
  border: 1px solid var(--win-border);
  border-radius: 8px;
}
.confirm span { flex: 1 1 auto; }

.site-footer a { color: var(--muted); }
```

- [ ] **Step 3: Write `raffle/edit/edit.js` (text editing only)**

```js
// Basket editor page: DOM, fetch, password storage, screens. Anything that can
// be unit tested lives in editor.js.
import { DATA_URL } from '../config.js';
import { resolveDataUrl } from '../source.js';
import { normalizeRows, photoUrls } from '../data.js';
import { setInline, setBlocks } from '../render.js';
import {
  emptyForm,
  formFromRow,
  validateBasket,
  changedFields,
  buildSavePayload,
  readResponse,
  filterBaskets,
  mergeRow,
} from './editor.js';

const PASSWORD_KEY = 'scwny.raffle.editorPassword';
const FETCH_TIMEOUT_MS = 15000;

const demo = new URLSearchParams(window.location.search).get('demo') === '1';
const dataUrl = resolveDataUrl({
  search: window.location.search,
  hostname: window.location.hostname,
  defaultUrl: DATA_URL,
  demoUrl: '../sample-data.json',
});

const $ = (id) => document.getElementById(id);
const el = {
  error: $('error'),
  login: $('login'),
  loginForm: $('login-form'),
  password: $('password'),
  list: $('list'),
  search: $('search'),
  refresh: $('refresh'),
  add: $('add'),
  status: $('status'),
  baskets: $('baskets'),
  editor: $('editor'),
  form: $('basket-form'),
  heading: $('editor-heading'),
  fBasket: $('f-basket'),
  fDescription: $('f-description'),
  fTicket: $('f-ticket'),
  fDetails: $('f-details'),
  fDonated: $('f-donated'),
  pDescription: $('p-description'),
  pDetails: $('p-details'),
  pDonated: $('p-donated'),
  eBasket: $('e-basket'),
  eDescription: $('e-description'),
  eSave: $('e-save'),
  note: $('note'),
  photoCurrent: $('photo-current'),
  photoButton: $('photo-button'),
  fPhoto: $('f-photo'),
  photoStatus: $('photo-status'),
  ePhoto: $('e-photo'),
  confirmBar: $('confirm-bar'),
  discard: $('discard'),
  keep: $('keep'),
  back: $('back'),
  save: $('save'),
  logout: $('logout'),
};

const state = {
  rows: [],
  loadedOnce: false,
  updated: null,
  search: '',
  afterLogin: 'list',
  // While the form is open: { isNew, basket, original, photo }
  editing: null,
  saving: false,
  uploading: false,
  inFlight: false,
};

// ---------- password ----------

function storedPassword() {
  try {
    return window.localStorage.getItem(PASSWORD_KEY) || '';
  } catch {
    return '';
  }
}

function storePassword(value) {
  try {
    if (value) window.localStorage.setItem(PASSWORD_KEY, value);
    else window.localStorage.removeItem(PASSWORD_KEY);
  } catch {
    // Storage unavailable. The password lives in memory for this visit only.
    memoryPassword = value;
  }
}
let memoryPassword = '';
function currentPassword() {
  return storedPassword() || memoryPassword;
}

// ---------- screens ----------

function show(name) {
  el.login.hidden = name !== 'login';
  el.list.hidden = name !== 'list';
  el.editor.hidden = name !== 'editor';
  if (name === 'login') el.password.focus();
}

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

function clearError() {
  el.error.hidden = true;
  el.error.textContent = '';
}

// ---------- server ----------

async function post(payload, timeoutMs = FETCH_TIMEOUT_MS) {
  if (demo) return demoPost(payload);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(dataUrl, {
      method: 'POST',
      // text/plain keeps this a "simple" request, so the browser skips the CORS
      // preflight that Apps Script cannot answer. fetch follows the 302 it returns.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return readResponse(await response.text());
  } catch (err) {
    const error = err && err.name === 'AbortError'
      ? 'The server took too long to answer. Try again.'
      : "Couldn't reach the server. Check your connection and try again.";
    return { ok: false, error };
  } finally {
    window.clearTimeout(timeout);
  }
}

// Demo mode: pretend the script answered, using what the page already knows.
function demoPost(payload) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const current = state.rows.find((r) => r.basket === payload.basket);
      const raw = {
        Basket: payload.basket,
        Description: current ? current.description : '',
        'Winning Ticket': current ? current.ticket : '',
        Details: current ? current.details : '',
        'Donated By': current ? current.donatedBy : '',
        Photo: current ? current.photo : '',
      };
      if (payload.action === 'save') Object.assign(raw, payload.fields);
      if (payload.action === 'photo') {
        raw.Photo = `https://picsum.photos/seed/scwny-${encodeURIComponent(payload.basket)}-${Date.now()}/400/300`;
      }
      resolve(readResponse(JSON.stringify({ ok: true, basket: payload.basket, row: raw })));
    }, 400);
  });
}

async function fetchData() {
  if (state.inFlight) return;
  state.inFlight = true;
  el.refresh.disabled = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(dataUrl, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      throw new Error(payload && payload.error ? `Server said: ${payload.error}` : 'Unexpected response');
    }
    state.rows = normalizeRows(payload.rows);
    state.updated = new Date();
    state.loadedOnce = true;
    clearError();
    renderList();
  } catch (err) {
    showError(`Couldn't load baskets. ${err && err.message ? err.message : ''}`.trim());
    el.status.textContent = '';
    console.error('Basket list fetch failed:', err);
  } finally {
    window.clearTimeout(timeout);
    state.inFlight = false;
    el.refresh.disabled = false;
  }
}

// ---------- list ----------

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function thumbnail(row, className) {
  const urls = photoUrls(row.photo);
  if (!urls) {
    const box = document.createElement('div');
    box.className = 'no-photo';
    box.setAttribute('aria-label', 'No photo');
    return box;
  }
  const img = document.createElement('img');
  img.src = urls.thumb;
  img.alt = `Photo of basket ${row.basket}`;
  img.loading = 'lazy';
  if (className) img.className = className;
  return img;
}

function renderList() {
  const rows = filterBaskets(state.rows, state.search);
  const updated = state.updated ? ` · Updated ${formatTime(state.updated)}` : '';
  el.status.textContent = `${state.rows.length} basket${state.rows.length === 1 ? '' : 's'}${updated}${demo ? ' · Demo mode' : ''}`;

  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = state.rows.length === 0 ? 'No baskets yet. Tap Add basket to start.' : 'No baskets match your search.';
    el.baskets.replaceChildren(li);
    return;
  }
  el.baskets.replaceChildren(...rows.map(renderListItem));
}

function renderListItem(row) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'basket-row';
  button.appendChild(thumbnail(row));

  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = row.basket;
  button.appendChild(num);

  const desc = document.createElement('span');
  desc.className = 'desc';
  setInline(desc, row.description || '(no description)');
  button.appendChild(desc);

  const ticket = document.createElement('span');
  ticket.className = 'ticket';
  ticket.textContent = row.ticket ? `Ticket ${row.ticket}` : '';
  button.appendChild(ticket);

  button.addEventListener('click', () => openEditor(row));
  li.appendChild(button);
  return li;
}

// ---------- form ----------

function formValues() {
  return {
    basket: el.fBasket.value.trim(),
    description: el.fDescription.value.trim(),
    ticket: el.fTicket.value.trim(),
    details: el.fDetails.value.trim(),
    donatedBy: el.fDonated.value.trim(),
  };
}

function fillForm(form) {
  el.fBasket.value = form.basket;
  el.fDescription.value = form.description;
  el.fTicket.value = form.ticket;
  el.fDetails.value = form.details;
  el.fDonated.value = form.donatedBy;
}

function renderPreview() {
  setInline(el.pDescription, el.fDescription.value);
  setBlocks(el.pDetails, el.fDetails.value);
  el.pDonated.replaceChildren();
  if (el.fDonated.value.trim()) {
    el.pDonated.append('Donated by ');
    const span = document.createElement('span');
    setInline(span, el.fDonated.value);
    el.pDonated.appendChild(span);
  }
}

function renderPhoto() {
  const { isNew, photo, basket } = state.editing;
  el.photoCurrent.replaceChildren(thumbnail({ basket, photo }));
  el.fPhoto.disabled = isNew;
  el.photoButton.classList.toggle('disabled', isNew);
  el.photoStatus.textContent = isNew ? 'Save the basket first, then add a photo.' : '';
  el.ePhoto.hidden = true;
}

function setFieldError(element, message) {
  element.textContent = message || '';
  element.hidden = !message;
}

function note(text) {
  el.note.textContent = text;
}

function openEditor(row) {
  const isNew = !row;
  state.editing = {
    isNew,
    basket: isNew ? '' : row.basket,
    original: isNew ? emptyForm() : formFromRow(row),
    photo: isNew ? '' : row.photo,
  };
  fillForm(state.editing.original);
  el.fBasket.readOnly = !isNew;
  el.heading.textContent = isNew ? 'Add basket' : `Edit basket ${row.basket}`;
  setFieldError(el.eBasket, '');
  setFieldError(el.eDescription, '');
  setFieldError(el.eSave, '');
  el.eSave.replaceChildren();
  note('');
  el.confirmBar.hidden = true;
  renderPreview();
  renderPhoto();
  show('editor');
  (isNew ? el.fBasket : el.fDescription).focus();
}

function closeEditor() {
  state.editing = null;
  el.confirmBar.hidden = true;
  show('list');
  if (!demo) fetchData();
}

function applySavedRow(row) {
  state.rows = mergeRow(state.rows, row);
  renderList();
}

function showSaveError(error) {
  el.eSave.replaceChildren();
  el.eSave.append(error);
  if (error === 'Wrong password') {
    el.eSave.append(' ');
    const change = document.createElement('button');
    change.type = 'button';
    change.textContent = 'Change password';
    change.addEventListener('click', () => {
      state.afterLogin = 'editor';
      el.password.value = '';
      show('login');
    });
    el.eSave.appendChild(change);
  }
  el.eSave.hidden = false;
}

async function save(event) {
  event.preventDefault();
  if (state.saving || !state.editing) return;
  const form = formValues();
  const errors = validateBasket(form, {
    isNew: state.editing.isNew,
    existing: new Set(state.rows.map((r) => r.basket)),
  });
  setFieldError(el.eBasket, errors.basket);
  setFieldError(el.eDescription, errors.description);
  setFieldError(el.eSave, '');
  if (Object.keys(errors).length > 0) return;

  const fields = changedFields(state.editing.original, form);
  if (Object.keys(fields).length === 0 && !state.editing.isNew) {
    note('Nothing changed.');
    return;
  }

  state.saving = true;
  el.save.disabled = true;
  el.save.textContent = 'Saving…';
  note('');
  const result = await post(buildSavePayload({ password: currentPassword(), basket: form.basket, fields }));
  state.saving = false;
  el.save.disabled = false;
  el.save.textContent = 'Save';

  if (!result.ok) {
    showSaveError(result.error);
    return;
  }
  applySavedRow(result.row);
  state.editing = {
    isNew: false,
    basket: result.row.basket,
    original: formFromRow(result.row),
    photo: result.row.photo,
  };
  fillForm(state.editing.original);
  el.fBasket.readOnly = true;
  el.heading.textContent = `Edit basket ${result.row.basket}`;
  renderPreview();
  renderPhoto();
  note(demo ? 'Demo mode: nothing was saved.' : 'Saved.');
}

// ---------- events ----------

el.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = el.password.value.trim();
  if (!value) return;
  storePassword(value);
  el.password.value = '';
  show(state.afterLogin);
  state.afterLogin = 'list';
});

el.logout.addEventListener('click', (event) => {
  event.preventDefault();
  storePassword('');
  memoryPassword = '';
  state.editing = null;
  state.afterLogin = 'list';
  show('login');
});

el.search.addEventListener('input', () => {
  state.search = el.search.value;
  renderList();
});
el.refresh.addEventListener('click', fetchData);
el.add.addEventListener('click', () => openEditor(null));

for (const input of [el.fDescription, el.fDetails, el.fDonated]) {
  input.addEventListener('input', renderPreview);
}
el.form.addEventListener('submit', save);
el.back.addEventListener('click', closeEditor);

// ---------- start ----------

show(currentPassword() ? 'list' : 'login');
fetchData();
```

- [ ] **Step 4: Check it in a browser**

Run: `npm test` (expected: all PASS; nothing here is unit tested, but the imports must still resolve in the other suites).

Then:

```
python -m http.server 8765
```

Open `http://localhost:8765/raffle/edit/?demo=1` and verify, in order:

1. The password screen shows. Type anything and press Continue. The basket list shows sample baskets sorted 1, 2, 3, 4, 5, 5A, 10 and the status says "Demo mode". Basket 2 and 10 show thumbnails; others show a dashed grey box.
2. Type `coffee` in the search box. Only basket 3 remains. Clear it.
3. Tap basket 1. The form shows its fields, Basket is read-only, the Details preview shows a bulleted list with bold "San Marzano" and a link. Type more text into Details and watch the preview change as you type. Type `*x*` into Donated By and see italic x in the preview line.
4. Clear Description and press Save. "Description is required." appears under the field. Restore it, press Save. The button says "Saving…" then "Demo mode: nothing was saved." appears. Press Back to list. Basket 1 shows the new description in the list.
5. Tap Add basket. Enter basket `1`, description `Dup`, press Save. The error says basket 1 already exists. Change to `6`, Save. The heading becomes "Edit basket 6" and the photo block becomes enabled. Back to list. Basket 6 appears between 5A and 10.
6. Reload the page. It goes straight to the list (password remembered). Click Log out in the footer. The password screen returns.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add raffle/edit/index.html raffle/edit/edit.css raffle/edit/edit.js
git commit -m "Add the basket editor page: list, form, live preview, text saves" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

---

### Task 7: Photo upload and the unsaved-changes guard

**Files:**
- Modify: `raffle/edit/edit.js`
- Modify: `raffle/edit/edit.css` (one rule for the disabled photo button)

**Interfaces:**
- Consumes: `JPEG_QUALITY`, `fitWithin`, `buildPhotoPayload` from `./editor.js`; `post`, `applySavedRow`, `renderPhoto`, `state.editing`, `el.fPhoto`, `el.photoStatus`, `el.ePhoto`, `el.confirmBar`, `el.discard`, `el.keep`, `el.back` from Task 6.

- [ ] **Step 1: Add the imports**

In `raffle/edit/edit.js`, extend the `./editor.js` import to include `JPEG_QUALITY`, `fitWithin`, and `buildPhotoPayload`, and add:

```js
const PHOTO_TIMEOUT_MS = 60000;
```

below `FETCH_TIMEOUT_MS`.

- [ ] **Step 2: Add image shrinking and upload**

Insert a new section before `// ---------- events ----------`:

```js
// ---------- photos ----------

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await window.createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers reject the options bag or the format. Fall through to <img>.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/** Re-encode the picture as a JPEG no larger than MAX_PHOTO_EDGE. Returns base64 without the data: prefix. */
async function shrinkImage(file) {
  const source = await loadBitmap(file);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const { width, height } = fitWithin(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  if (typeof source.close === 'function') source.close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function uploadPhoto() {
  const file = el.fPhoto.files && el.fPhoto.files[0];
  el.fPhoto.value = '';
  if (!file || state.uploading || !state.editing || state.editing.isNew) return;

  const basket = state.editing.basket;
  state.uploading = true;
  setFieldError(el.ePhoto, '');
  el.photoStatus.textContent = 'Preparing photo…';

  let data;
  try {
    data = await shrinkImage(file);
  } catch {
    state.uploading = false;
    el.photoStatus.textContent = '';
    setFieldError(el.ePhoto, 'That file is not a picture this browser can read.');
    return;
  }

  el.photoStatus.textContent = 'Uploading photo…';
  const result = await post(buildPhotoPayload({ password: currentPassword(), basket, data }), PHOTO_TIMEOUT_MS);
  state.uploading = false;

  // The editor may have moved on while the upload ran.
  const stillHere = state.editing && state.editing.basket === basket;
  if (!result.ok) {
    if (stillHere) {
      el.photoStatus.textContent = '';
      setFieldError(el.ePhoto, result.error);
    }
    return;
  }
  applySavedRow(result.row);
  if (stillHere) {
    state.editing.photo = result.row.photo;
    renderPhoto();
    el.photoStatus.textContent = demo ? 'Demo mode: nothing was saved.' : 'Photo saved.';
  }
}

// ---------- unsaved changes ----------

function isDirty() {
  if (!state.editing) return false;
  const now = formValues();
  return Object.keys(now).some((key) => now[key] !== state.editing.original[key]);
}

function requestClose() {
  if (isDirty()) {
    el.confirmBar.hidden = false;
    el.discard.focus();
    return;
  }
  closeEditor();
}
```

- [ ] **Step 3: Wire the events**

In the `// ---------- events ----------` section, replace

```js
el.back.addEventListener('click', closeEditor);
```

with

```js
el.back.addEventListener('click', requestClose);
el.discard.addEventListener('click', closeEditor);
el.keep.addEventListener('click', () => {
  el.confirmBar.hidden = true;
});
el.fPhoto.addEventListener('change', uploadPhoto);

window.addEventListener('beforeunload', (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});
```

Also make `renderPhoto` keep the status text when it is called right after an upload. Change its status line to:

```js
  if (isNew) el.photoStatus.textContent = 'Save the basket first, then add a photo.';
```

so it only writes the message for new baskets and otherwise leaves whatever `uploadPhoto` set. In `openEditor`, add `el.photoStatus.textContent = '';` before the `renderPhoto()` call so stale status never carries between baskets.

- [ ] **Step 4: Style the disabled photo button**

Append to `raffle/edit/edit.css`:

```css
.button.disabled { opacity: 0.6; pointer-events: none; }
```

- [ ] **Step 5: Check it in a browser**

Run: `npm test` (expected: all PASS).

```
python -m http.server 8765
```

Open `http://localhost:8765/raffle/edit/?demo=1`, enter any password, then:

1. Tap basket 3 (no photo). Press **Take or choose photo** and pick any JPEG or PNG from disk. The status goes "Preparing photo…", "Uploading photo…", then "Demo mode: nothing was saved." and a thumbnail appears in the photo block. Back to list: basket 3 now shows a thumbnail.
2. Tap basket 3 again. Pick a non-image file such as a `.txt`. The error "That file is not a picture this browser can read." appears under the photo block.
3. Tap Add basket. The photo button is greyed and the status says to save first.
4. Tap basket 4, change the Description, press **Back to list**. The yellow bar "You have unsaved changes." appears. Press **Keep editing**: the bar hides and the form is unchanged. Press Back again, then **Discard**: the list shows and basket 4 is unchanged.
5. Tap basket 4, change Description, and press the browser reload. The browser asks to confirm leaving. Cancel, press Back, Discard.
6. Open the browser's device toolbar at a phone width (about 400 px). The list rows, toolbar, and form all fit without horizontal scrolling.

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add raffle/edit/edit.js raffle/edit/edit.css
git commit -m "Upload shrunk photos from the editor and guard unsaved edits" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

---

### Task 8: Documentation and final check

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: README**

In `README.md`:

1. Under "## What it does", add a bullet after the `/raffle` bullet:
   ```markdown
   - **`/raffle/edit`** is the organizers' editor: a password-protected page for typing basket
     descriptions with a live preview and attaching photos from a phone. It writes to the same
     Google Sheet. See the "Editing baskets" section of the setup checklist.
   ```
2. In "## How the raffle page works", after the diagram, add one sentence: "The editor page posts changes back to the same Apps Script, which writes them into the Sheet."
3. In the "## Files" table add rows, keeping alphabetical-ish grouping with the other `raffle/` entries:
   ```markdown
   | `raffle/render.js` | Builds DOM from parsed Markdown. Shared by the results and editor pages. |
   | `raffle/edit/index.html` | The organizers' basket editor page. |
   | `raffle/edit/edit.js` | Editor DOM, fetch, password storage, photo shrinking. |
   | `raffle/edit/editor.js` | Pure editor logic: validation, changed-field diffing, payloads, image sizing. |
   | `raffle/edit/edit.css` | Editor-only styles, layered on `raffle.css`. |
   ```
4. In "## Developing", after the demo URL block, add: "The editor demo is `http://localhost:8765/raffle/edit/?demo=1`. Saves are stubbed and nothing is written."

- [ ] **Step 2: CLAUDE.md**

In `CLAUDE.md`:

1. In "## Structure", change the `raffle/` bullet to read:
   ```markdown
   - `raffle/` is the results page. `raffle.js` owns the DOM, fetch, and polling. `tickets.js`, `data.js`, `source.js`, and
     `markdown.js` are pure modules with no DOM access; keep logic that can be unit tested in those. `render.js` turns parsed
     Markdown into DOM and is shared with the editor.
   - `raffle/edit/` is the organizers' editor. `edit.js` owns the DOM and fetch; `editor.js` is pure. It POSTs JSON to the same
     Apps Script URL (`doPost` in `Code.gs`) with `Content-Type: text/plain` so there is no CORS preflight. The password lives in
     the Sheet's Settings tab as `Editor password` and is stripped from the public feed.
   ```
2. In "## Commands", extend the serve line: "…or `http://localhost:8765/raffle/edit/?demo=1` for the editor with stubbed saves."

- [ ] **Step 3: Full test run and a last look at the live results page**

Run: `npm test`
Expected: all PASS.

Run `git status` and confirm only the two docs are modified. Confirm `_config.yml` was not changed (`raffle/edit` must be published).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the basket editor page" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DEAEJdb2HZAx6Kf9g9AoC8"
```

- [ ] **Step 5: Hand-off for the live check (Patrick, not the executor)**

These need the Sheet owner's Google account and are not part of the automated work:

1. Add the `Editor password` row to the Settings tab.
2. Paste the new `Code.gs` into the Apps Script editor, save, and publish a **New version** of the existing deployment. Allow the Drive permission when asked.
3. Before pushing, test against the real script locally: `http://localhost:8765/raffle/edit/?data=<exec url>`. Add a throwaway basket such as `999`, attach a photo from a phone on the same network or from a laptop file, confirm it shows at `http://localhost:8765/raffle/?data=<exec url>`, then delete row 999 in the Sheet.
4. Push `main`. Open https://www.scwny.org/raffle/edit on a phone and repeat step 3 once.
