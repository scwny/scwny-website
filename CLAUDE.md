# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static GitHub Pages site for the Skating Club of Western New York, served at www.scwny.org. Plain HTML/CSS with
no build step, package manager, linter, or tests. Preview locally by opening the HTML files in a browser or
serving the repo root (e.g. `python -m http.server`). Deploy by pushing to `main`.

## Structure

- `index.html` is only a meta-refresh redirect to the club's main site, skatingclubofwesternnewyork.org.
- `raffle/index.html` is the only real page. It renders raffle results in a DataTables grid that pulls JSON via AJAX
  from a Google Apps Script web app URL hardcoded in the page. The script is backed by a Google Sheet.
- The DataTables `columns` config keys (`Raffle Item`, `Description`, `Winner`) must match the sheet's header row
  exactly, and the response is read from the `data` property.

## Gotchas

- Directory names double as URLs (`/raffle`), so renaming a folder changes the public link.
- jQuery and DataTables load from public CDNs. The raffle page also loads Moment.js, which is unused.
