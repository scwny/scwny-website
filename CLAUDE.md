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
- `raffle/` is the only real page. `raffle.js` owns the DOM, fetch, and polling. `tickets.js`, `data.js`, and
  `source.js` are pure modules with no DOM access; keep logic that can be unit tested in those.
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
