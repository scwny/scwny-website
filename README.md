# scwny-website

Static GitHub Pages site for the Skating Club of Western New York (SCWNY), served at
[www.scwny.org](https://www.scwny.org). No build step and no runtime dependencies.

## What it does

- **`/`** redirects immediately to the club's main website,
  [skatingclubofwesternnewyork.org](https://skatingclubofwesternnewyork.org/).
- **`/raffle`** shows live basket raffle results. Visitors can save their ticket numbers
  on their phone and the page highlights the baskets they won as results are entered.
- **`/raffle/edit`** is the organizers' editor: a password-protected page for typing basket
  descriptions with a live preview and attaching photos from a phone. It writes to the same
  Google Sheet. See the "Editing baskets" section of the setup checklist.

## How the raffle page works

Volunteers type results into a Google Sheet during the drawing. A small Google Apps
Script attached to that Sheet returns its contents as JSON. The page fetches that JSON
every 30 seconds while open and renders it with plain JavaScript.

```
Google Sheet  ->  Apps Script web app (JSON)  ->  raffle/index.html on GitHub Pages
```

The editor page posts changes back to the same Apps Script, which writes them into the Sheet. Setting up the Sheet and script from scratch takes about ten minutes. Follow
[`raffle/apps-script/SETUP.md`](raffle/apps-script/SETUP.md), then paste the web app URL
into `raffle/config.js`.

### Sheet layout

Tab **Baskets**, header row: `Basket`, `Description`, `Winning Ticket`, `Details`,
`Donated By`, `Photo`. Only the first three are required. `Photo` accepts a Google
Drive share link or any image URL. Drive files must be shared as Anyone with the link.
The easiest way to fill it is the photo Form described in the setup checklist: pick the
basket number, take the picture on your phone, and the script writes the link for you.

Tab **Settings**, two columns: `Title` is the page heading, `Message` is an optional
banner.

Text cells accept a small Markdown subset: `**bold**`, `*italic*`, `[label](https://url)` or a
bare `https://` address, line breaks, and `- ` or `* ` bullet lists. HTML is shown literally. See
the setup checklist.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Root redirect to the club's main website. |
| `CNAME` | Binds GitHub Pages to `www.scwny.org`. |
| `raffle/index.html` | The results page. |
| `raffle/raffle.js` | Fetching, live refresh, rendering, saved tickets. |
| `raffle/tickets.js` | Parses ticket input like `97-104, 241` and matches winners. |
| `raffle/data.js` | Maps Sheet headers to fields, sorts rows, rewrites photo links. |
| `raffle/markdown.js` | Parses a small Markdown subset (bold, italic, links, lists) for text cells. |
| `raffle/render.js` | Builds DOM from parsed Markdown. Shared by the results and editor pages. |
| `raffle/edit/index.html` | The organizers' basket editor page. |
| `raffle/edit/edit.js` | Editor DOM, fetch, password storage, photo shrinking. |
| `raffle/edit/editor.js` | Pure editor logic: validation, changed-field diffing, payloads, image sizing. |
| `raffle/edit/edit.css` | Editor-only styles, layered on `raffle.css`. |
| `raffle/source.js` | Decides the data URL: config, `?demo=1`, or a localhost-only `?data=` override. |
| `raffle/config.js` | The Apps Script URL and refresh interval. |
| `raffle/raffle.css` | Styles. Cards on phones, a table on wide screens. |
| `raffle/sample-data.json` | Demo data. Open the page with `?demo=1` to use it. |
| `raffle/apps-script/` | Apps Script source and the setup checklist. |
| `raffle/legacy.html` | The previous jQuery/DataTables page, kept for reference. |
| `raffle/RaffleResults.css` | Stylesheet used only by `legacy.html`. |
| `raffle/SCWNYLOGO.png` | Club logo used by both pages. |
| `tests/` | Unit tests for the pure modules. |

## Developing

Serve the repo root and open the demo:

```
python -m http.server 8765
# then visit http://localhost:8765/raffle/?demo=1
```

The editor demo is `http://localhost:8765/raffle/edit/?demo=1`. Saves are stubbed and nothing is written.

Test a new Apps Script deployment without committing by opening the local server with
`?data=<web app url>`. The override is ignored on the live site.

Run the unit tests (Node 22 or newer):

```
npm test
```

## Deploying

Push to `main`. GitHub Pages builds the repo with Jekyll and publishes everything except the
paths listed under `exclude` in `_config.yml` (docs, tests, README, package files, and the
Apps Script folder). Add any new non-site file to that list or it will be served publicly.
