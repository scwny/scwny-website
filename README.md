# scwny-website

Static GitHub Pages site for the Skating Club of Western New York (SCWNY), served at
[www.scwny.org](https://www.scwny.org). No build step, no dependencies, no tests.

## What it does

- **`/`** redirects immediately to the club's main website,
  [skatingclubofwesternnewyork.org](https://skatingclubofwesternnewyork.org/), via a meta refresh.
- **`/raffle`** shows live Meat Raffle results in a table with three columns: basket number,
  description, and winner.

## Files

| File | Purpose |
| --- | --- |
| `CNAME` | Binds the GitHub Pages site to `www.scwny.org`. |
| `index.html` | Root redirect to the club's main website. |
| `raffle/index.html` | The raffle results page. |
| `raffle/RaffleResults.css` | Centers the logo and title on the raffle page. |
| `raffle/SCWNYLOGO.png` | Club logo shown above the results table. |

## How the raffle page works

The page loads jQuery and DataTables 2.1.8 from public CDNs. On load, DataTables fetches JSON from a
Google Apps Script web app URL and renders the rows. The script reads from a Google Sheet, so
editing the sheet updates the page. Paging is disabled so every result is visible on one screen.

The JSON response is expected to look like:

```json
{
  "data": [
    { "Raffle Item": "1", "Description": "...", "Winner": "..." }
  ]
}
```

The column keys (`Raffle Item`, `Description`, `Winner`) must match the sheet's header row.

## Deploying

Push to `main`. GitHub Pages serves the repo root directly.

## Notes

- The Google Apps Script deployment URL is hardcoded in `raffle/index.html`. If the script is
  redeployed, update the URL there.
- Moment.js is loaded on the raffle page but nothing uses it.
