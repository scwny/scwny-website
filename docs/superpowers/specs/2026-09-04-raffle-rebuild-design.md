# Raffle Results Page Rebuild

**Date:** 2026-09-04
**Status:** Approved in discussion, pending spec review

## Goal

Restore the basket raffle results page at www.scwny.org/raffle, make it work well on
phones, and add a "my tickets" feature that shows visitors which baskets they won as
results are filed live during the drawing.

## Background

- The current page calls a Google Apps Script web app that now returns HTTP 403
  "Access Denied". The script and its Sheet are owned by an account we can't reach.
  The live page is broken as a result.
- Results are entered into a Sheet by volunteers, one basket at a time, while the
  drawing happens. Attendees check the page on their phones during the event.
- Tickets are plain sequential integers sold in strips, so a person typically holds
  one or more contiguous ranges plus a few loose numbers.

## Decisions already made

- Rebuild the backend as a new Google Sheet plus Apps Script owned by Patrick's
  personal Gmail. Migration to the club account is out of scope for now.
- Rewrite the page in plain JavaScript with no third-party libraries. Drop jQuery,
  DataTables, and Moment.js.
- Keep the old page. Rename `raffle/index.html` to `raffle/legacy.html` and leave
  `raffle/RaffleResults.css` in place so the old page still renders.
- No custom admin UI. The Sheet is the admin.

## Data contract

### Google Sheet

Two tabs.

**Baskets**: one row per basket. Header row, exact text:

| Header | Required | Meaning |
| --- | --- | --- |
| Basket | yes | Basket number or label shown to visitors. Usually an integer. |
| Description | yes | Short title of the basket. |
| Winning Ticket | yes | Drawn ticket number. Blank until drawn. |
| Details | no | Longer description, shown on expand. |
| Donated By | no | Donor credit, shown on expand. |
| Photo | no | Google Drive share link or any direct image URL. |

**Settings**: two columns, key in A and value in B, no header row required:

| Key | Meaning |
| --- | --- |
| Title | Page heading, e.g. "2026 Meat Raffle". |
| Message | Optional banner text, e.g. "Drawing starts at 7:00 PM". Blank hides it. |

The Settings tab is optional. If missing, the page uses "Raffle Results" and no banner.

### JSON returned by the Apps Script

```json
{
  "ok": true,
  "updated": "2026-09-04T23:10:00.000Z",
  "settings": { "Title": "2026 Meat Raffle", "Message": "Drawing starts at 7:00 PM" },
  "rows": [
    {
      "Basket": "1",
      "Description": "Italian Night",
      "Winning Ticket": "104",
      "Details": "",
      "Donated By": "",
      "Photo": ""
    }
  ]
}
```

- Every column in the Baskets tab is returned, keyed by its trimmed header text. The
  script has no knowledge of specific columns, so adding a column never requires a
  script redeploy.
- Values are the Sheet's display strings, never numbers, so "104" stays "104".
- Fully blank rows are dropped.
- On failure the script returns `{ "ok": false, "error": "<message>" }`. Apps Script
  cannot set HTTP status codes, so the page checks `ok`.

## Apps Script

File: `raffle/apps-script/Code.gs`, kept in the repo for reference.

- `doGet` reads the Baskets tab with `getDataRange().getDisplayValues()`, builds the
  rows array from the header row, reads the Settings tab if present, and returns JSON
  via `ContentService` with the JSON MIME type.
- Responses are cached for 5 seconds with `CacheService.getScriptCache()`, so a room
  full of phones polling does not translate into one Sheet read per request.
- Deploy settings: Web app, Execute as "Me", Who has access "Anyone". Redeploy as a
  new version of the same deployment to keep the URL stable.

Setup steps for a human live in `raffle/apps-script/SETUP.md`.

## Page

### Files

| File | Purpose |
| --- | --- |
| `raffle/index.html` | New page markup. Loads `raffle.js` as an ES module. |
| `raffle/raffle.css` | Styles. Mobile-first. |
| `raffle/raffle.js` | Fetch, render, refresh, storage, URL handling. |
| `raffle/tickets.js` | Pure functions: parse ticket input, match against a cell. Unit tested. |
| `raffle/config.js` | Exports `DATA_URL` and `REFRESH_SECONDS`. The only file to edit after a redeploy. |
| `raffle/sample-data.json` | Demo data in the JSON contract shape. |
| `raffle/legacy.html` | The previous page, renamed, unchanged. |
| `tests/tickets.test.mjs` | Node built-in test runner tests for `tickets.js`. |

### Layout

- Header: club logo, Title from settings, Message banner if non-empty.
- Status line: "42 of 60 baskets drawn · Updated 7:42 PM". Uses `aria-live="polite"`.
- My tickets: labelled text input with placeholder "e.g. 97-104, 241, 250-252",
  a count of parsed numbers, and a note for any tokens that could not be parsed.
- You won: shown only when at least one basket matches. Lists matched baskets with
  basket number, description, and ticket. Header reads "You won N basket(s)!".
  If tickets are entered but nothing matches yet, a single line reads
  "No wins yet." under the input.
- Search: text input filtering on basket, description, and winning ticket.
- Results list: sorted by Basket ascending, numeric when both values are integers,
  otherwise string compare. Below 720px wide, each basket is a card. At 720px and
  above, a table with columns Basket, Description, Winning Ticket, and a thumbnail
  column when any row has a photo.
- Each row shows "Not drawn yet" in muted style when Winning Ticket is blank.
  Rows matching my tickets get a highlighted background and a "You" badge.
- Details and Donated By, when present, appear behind a tap-to-expand control.
- Photo, when present, renders as a lazy-loaded thumbnail that opens the full image
  in a new tab.

### States

- First load: a loading indicator in place of the list.
- Fetch failure: keep the last good data on screen if any, and show an inline banner
  "Couldn't load results. Retrying..." Never use `alert`.
- Success after failure: banner clears.

### Refresh

- Fetch on load, then every `REFRESH_SECONDS` (default 30) while
  `document.visibilityState === 'visible'`.
- On `visibilitychange` to visible, fetch immediately and restart the timer.
- On failure, back off exponentially from 30s to a max of 120s, reset on success.
- Requests use `cache: 'no-store'`.

### My tickets: parsing rules (`tickets.js`)

`parseTickets(text)` returns `{ numbers: Set<number>, invalid: string[] }`.

- Normalize: replace en dash and em dash with `-`, replace `\s+to\s+` with `-`,
  collapse spaces around `-`.
- Split on commas, semicolons, and whitespace.
- A token is either a positive integer or `low-high`. Reversed ranges are swapped.
- A single range is capped at 1000 numbers and the total at 5000. Tokens that would
  exceed the cap are reported as invalid.
- Anything else is reported in `invalid`. Parsing never throws.

`ticketMatches(cell, numbers)` returns true when any run of digits in the cell,
parsed as an integer, is in `numbers`. This tolerates cells like "104" and
"104 (Jane)" alike. Blank cells never match.

### Storage

- Raw input text is saved to `localStorage` under `scwny.raffle.myTickets` on every
  change and restored on load. All storage access is wrapped in try/catch.

### URL parameters

- `?demo=1` loads `./sample-data.json` instead of `DATA_URL`.
- `?data=<url>` overrides `DATA_URL` for testing a new deployment before committing.
  Honored only when the page is served from `localhost` or `127.0.0.1`. Ignored in
  production, so a shared link cannot render arbitrary content on the club's domain.

### Header matching

The page maps JSON keys to fields case-insensitively with whitespace collapsed.
"Winner" is accepted as an alias for "Winning Ticket" so an older sheet layout still
works.

### Photo links

Google Drive links of the forms `/file/d/<id>/`, `open?id=<id>`, and `uc?id=<id>`
are rewritten to `https://drive.google.com/thumbnail?id=<id>&sz=w400` for the
thumbnail and `sz=w1600` for the full-size link. Any other URL is used as-is.

### Security

All Sheet content is rendered with `textContent` or equivalent escaping. Photo URLs
are only placed in `src` and `href` attributes and must start with `http://` or
`https://`, otherwise they are ignored.

## Testing

- `node --test tests/` covers `parseTickets` and `ticketMatches`: single numbers,
  ranges, reversed ranges, en dashes, "to", mixed separators, duplicates, invalid
  tokens, caps, blank cells, digits embedded in text.
- Manual: open the page with `?demo=1` served by `python -m http.server`, check at
  390px and 1024px widths, enter tickets that match sample rows, confirm the "You
  won" section and highlights, confirm "Not drawn yet" rows, expand details, open a
  photo.
- Manual: open with `?data=https://example.invalid/` and confirm the inline error
  banner and retry behaviour.
- Manual: once the real script is deployed, open the local server with
  `?data=<script url>` and confirm live data before committing the URL to `config.js`.

## Rollout

1. Land the rebuilt page with `DATA_URL` empty and demo mode working.
2. Patrick creates the Sheet, pastes headers, deploys the script, and shares the URL.
3. Verify locally with `?data=`, commit the URL to `config.js`, push to `main`.
4. Update README and CLAUDE.md to describe the new files and setup.

## Out of scope

- Custom admin UI or login.
- Photo upload workflow. The Photo column accepts links only.
- Winner names. Only ticket numbers are published.
- Migrating the Sheet and script to the club account.
- Changes to the root redirect page.
