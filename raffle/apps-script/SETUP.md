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

   If you use the **Photo** column, paste a Google Drive share link and set that file's
   sharing to **Anyone with the link → Viewer**. Private files show up as broken images
   on the page.
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
it between the quotes of `DATA_URL`. The site maintainer can test the URL before
publishing by serving the repo locally and opening
`http://localhost:8765/raffle/?data=PASTE_URL_HERE`. The live site ignores the `?data=`
parameter on purpose, so a shared link cannot swap in someone else's data.

## Formatting text

Description, Details, Donated By, Title, and Message understand a little formatting:

- `**bold**` and `*italic*`
- A link: `[Premier Wine](https://premierwine.com)`, or just paste a full `https://` address
- Press **Ctrl+Enter** inside a cell to start a new line. A blank line starts a new paragraph.
- Lines starting with `- ` become a bulleted list (Details and Message)

Anything else, including HTML tags, is shown exactly as typed. Basket and Winning Ticket are never
formatted because the page sorts and matches on them.

## During the event

- Give volunteers **edit** access to the Sheet. They do not need access to the script.
- Type each winning ticket number into the **Winning Ticket** column as it is drawn.
- Whatever is typed into **Winning Ticket** appears on the public page exactly as typed,
  including a name if you add one. Type only the ticket number unless you mean to
  publish more.
- The page re-checks every 30 seconds. A change shows up on phones within about 35 seconds.

## If you ever change the script

Use **Deploy > Manage deployments**, click the pencil, set Version to **New version**,
and click **Deploy**. The URL stays the same. Creating a *new deployment* instead makes
a new URL and the page will need updating.
