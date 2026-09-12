# Basket Editor Page

**Date:** 2026-09-11
**Status:** Approved in discussion, pending spec review

## Goal

Give the two or three people who run the raffle a proper way to enter and edit baskets
on the day of the event, instead of typing into Google Sheet cells. Multi-line text gets a
real textarea with a live preview, and photos can be taken and attached from a phone on
the same screen as the rest of the basket.

## Background

- The results page at www.scwny.org/raffle reads a Google Sheet through an Apps Script
  web app. The Sheet is edited by hand. See `2026-09-04-raffle-rebuild-design.md`.
- Details and Message accept a small Markdown subset. Typing it into a Sheet cell means
  Ctrl+Enter for every line break, a tiny editing box, and no way to see the result
  without opening the results page.
- Photos already have a separate Google Form route (commit 773337e): basket number plus a
  file upload, with an `onPhotoSubmit` trigger that shares the file and writes the Drive
  link into the row. It works, but it is a second place to enter a basket.
- Editing happens at the event. Photos come from phones. Text is mostly typed on a laptop.
- Editors are two or three trusted board members who already have edit access to the
  Sheet. The threat model is typos and accidents, not hostile editors.

## Decisions already made

- Build a second static page, `raffle/edit/`, served at www.scwny.org/raffle/edit. It
  talks to the same Apps Script deployment, which gains a `doPost`.
- The Sheet stays the source of truth. Typing winning tickets straight into the Sheet
  during the drawing keeps working. Renumbering and deleting baskets stay Sheet jobs.
- Access is a shared password stored in the Settings tab. No Google sign-in.
- The photo Form stays as an alternative route. Nothing about it changes.
- Rejected: a Sheet sidebar (does not run in the Sheets phone app, and the Markdown
  renderer would have to be duplicated inside Apps Script) and growing the photo Form
  into a whole-basket Form (no preview, no view of the current text while editing).

## Data contract

### Settings tab

One new row, hidden from the public feed exactly like `Photo uploaders`:

| Key | Meaning |
| --- | --- |
| Editor password | The password the editor page must send with every write. Blank or missing disables writes entirely. |

### Requests to the Apps Script

All writes are `POST` to the existing `/exec` URL. The body is JSON sent with
`Content-Type: text/plain`, so the browser makes a simple request and skips the CORS
preflight that Apps Script cannot answer. `fetch` follows the 302 Apps Script issues on
POST. The response is always JSON with status 200.

Common fields in every request:

```json
{ "action": "save" | "photo", "password": "..." }
```

**`save`** writes text fields for one basket:

```json
{
  "action": "save",
  "password": "...",
  "basket": "12",
  "fields": {
    "Description": "Italian Night",
    "Winning Ticket": "",
    "Details": "Includes:\n- Pasta\n- Sauce",
    "Donated By": "The Lupiani family"
  }
}
```

- `basket` is required and is matched against the Basket column the same way
  `onPhotoSubmit` does (trimmed, exact string, `Basket` or `Basket #` header).
- Only headers present in `fields` are written, and only these four are accepted:
  `Description`, `Winning Ticket`, `Details`, `Donated By`. A header that does not exist
  in the sheet is appended as a new column, like `onPhotoSubmit` does for Photo.
- An unknown basket number appends a new row with the number and the fields.
- The page sends only the fields whose text changed since the basket was loaded, so two
  people editing different fields of one basket do not clobber each other, and a ticket
  typed into the Sheet during the drawing survives a Details edit made from a stale
  form. If two people change the same field, the later save wins.

**`photo`** attaches one picture:

```json
{
  "action": "photo",
  "password": "...",
  "basket": "12",
  "name": "basket-12.jpg",
  "type": "image/jpeg",
  "data": "<base64 JPEG>"
}
```

- The script decodes the image, saves it as a file in a Drive folder named
  **Raffle photos** (created on first use, at the root of the owner's Drive), shares it
  as anyone-with-link viewer, and writes `https://drive.google.com/file/d/<id>/view`
  into the Photo cell of the basket row. Unknown basket numbers append a new row.
- The page limits what it sends to a JPEG of at most 1600 px on the long side. The
  script rejects `data` over 4 MB decoded as a safety net.
- Replaced photos stay in the folder, as they do with the Form route.

**Responses**

```json
{ "ok": true, "basket": "12", "row": { "Basket": "12", "Description": "...", "Photo": "..." } }
{ "ok": false, "error": "Wrong password" }
```

`row` is the basket row as the feed would return it, so the page can update its list
without a second fetch. Error strings the page should expect: `Wrong password`,
`Editing is disabled: no Editor password in Settings`, `Basket number is required`,
`Unknown action`, `Bad request`, `Photo too large`, and anything thrown by the Sheet or
Drive APIs.

### Concurrency and caching

- `doPost` takes `LockService.getScriptLock()` around the read-modify-write, so two
  editors saving a new basket at once cannot create two rows.
- After any successful write the feed cache key is removed, so the results page sees
  the change on its next poll (30 seconds at most).

## Page design

### Location and files

```
raffle/
  render.js          NEW  DOM builders for parsed Markdown, moved out of raffle.js
  raffle.js          imports render.js; no behavior change
  edit/
    index.html       NEW
    edit.css         NEW  reuses raffle.css variables where sensible
    edit.js          NEW  DOM, fetch, password storage, state
    editor.js        NEW  pure module: validation, payloads, resize arithmetic, response handling
```

`edit.js` imports `../config.js`, `../source.js`, `../data.js`, `../markdown.js`, and
`../render.js`. The edit folder is part of the site and is not added to the Jekyll
exclude list.

### States

The page has three states, switched by showing and hiding sections. No routing.

1. **Password prompt.** Shown when no password is stored. One field and a button. The
   password is kept in `localStorage` under `scwny.raffle.editorPassword`. It is only
   checked by the script on the first write; a wrong one produces an inline error on
   the form and a "Change password" link clears it. A small "Log out" link in the page
   footer clears it too.
2. **Basket list.** Loaded from the same feed URL the results page uses, through
   `resolveDataUrl`. Sorted with `compareBaskets`. Each row shows the number,
   description, and a thumbnail (or a grey placeholder). A search box filters by number
   or description. An **Add basket** button opens an empty form. After a successful
   save the list is updated from the row in the response; it refetches when the form is
   closed and on a manual refresh button. It does not poll.
3. **Basket form.** Fields, in order:
   - Basket: text input. Read-only for an existing basket. Required for a new one.
   - Description: single-line input. Required.
   - Winning Ticket: single-line input.
   - Details: textarea, at least eight rows, with a live preview block directly beneath
     it rendered through `parseBlocks` and `render.js` on every input event. Under the
     textarea a one-line hint: `**bold**  *italic*  [text](https://link)  - bullet`.
   - Donated By: single-line input with a live inline preview.
   - Photo: current picture as a thumbnail (via `photoUrls`) or a placeholder, and a
     **Take or choose photo** button backed by `<input type="file" accept="image/*" capture="environment">`.
   - Save and Cancel buttons. Save is disabled while a request is in flight.

   Picking a photo uploads immediately, independent of Save: the page resizes it, posts
   it, shows "Uploading photo..." then "Photo saved" or the error, and swaps in the new
   thumbnail from the response row. Text edits in the form are untouched by this.

   Leaving the form with unsaved text edits (Cancel, clicking a list item, closing the
   tab) asks for confirmation through `beforeunload` and an inline confirm bar. No
   `alert` or `confirm` dialogs.

### Image handling

In `edit.js`: read the file with `createImageBitmap` (fallback to an `Image` element),
compute the target size with `fitWithin(width, height, 1600)` from `editor.js`, draw to a
canvas, export as `image/jpeg` at quality 0.85, and base64-encode. Images already within
1600 px are still re-encoded, which strips EXIF and fixes orientation on browsers that
honour it. HEIC files from iPhones arrive as JPEG when taken through the camera input;
a file the browser cannot decode produces the inline error "That file is not a picture
this browser can read."

### Errors

Every error renders inline near the thing that failed: the password field, the Save
button, or the photo block. Fetch failures and `ok: false` responses show the `error`
string verbatim. A 15-second timeout matches the results page.

### Demo and local development

- `?demo=1` loads `../sample-data.json` and replaces both write actions with a local stub
  that returns `{ ok: true, row }` after a short delay and shows "Demo mode: nothing was
  saved." The password prompt still appears so the flow can be exercised.
- `?data=<url>` is honoured only on localhost, via the existing `resolveDataUrl`.
- `python -m http.server 8765` then `http://localhost:8765/raffle/edit/?demo=1`.

## Apps Script changes

In `Code.gs`:

- `doPost(e)`: parse `e.postData.contents` as JSON, check the password against the
  `Editor password` setting, dispatch on `action`, wrap everything in try/catch that
  returns `{ ok: false, error }`. Hold the script lock for the duration of a write.
- Pure helpers, written so they can run in the Node vm sandbox: `parseEditRequest(body)`
  returning either a request object or an error string; `checkPassword(given, stored)`
  returning `''` or an error string; `upsertBasket(values, basket, fields)` which returns
  `{ headers, row, rowIndex }` for a values grid without mutating it, leaving the Sheet
  write to a thin caller; `rowObject(headers, row)`; and `driveViewUrl(id)`.
- `publicSettings` hides `Editor password` alongside `Photo uploaders`.
- `readRows` is reused to build the `row` in the response.

The existing `onPhotoSubmit` is not changed.

## Documentation

- `SETUP.md`: new section **Editing baskets from the editor page** covering the
  Settings row, redeploying the script as a new version of the existing deployment (the
  URL does not change), sharing the page link and password with editors, and a note
  that the photo Form remains available.
- `README.md`: one line pointing at `/raffle/edit`.
- `CLAUDE.md` structure section: mention `raffle/edit/` and `render.js`.

## Testing

- `tests/editor.test.mjs`: `fitWithin` for landscape, portrait, square, and
  already-small images; `validateBasket` messages for missing number and description;
  `buildSavePayload` and `buildPhotoPayload` shapes; `readResponse` turning `ok: false`
  and non-JSON into error strings.
- `tests/apps-script.test.mjs`: `parseEditRequest` with bad JSON, missing action, and
  missing basket; `checkPassword` with blank stored password (always fails), mismatch,
  and match; `upsertBasket` updating an existing row, appending a new row, appending a
  missing column, and leaving untouched columns alone; `publicSettings` hides the
  password row.
- Existing suites pass unchanged after `render.js` is split out of `raffle.js`.
- Manual: on a phone against the real Sheet, add a throwaway basket, attach a photo,
  check it on the results page, then delete the row in the Sheet.

## Out of scope

- Renumbering or deleting baskets from the page.
- Editing the Settings tab (Title, Message) from the page.
- Per-user accounts or an audit trail of who changed what.
- Offline support.
