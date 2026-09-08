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
   on the page. Or skip the pasting: see **Basket photos from a phone** below.
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
- Lines starting with `- ` or `* ` become a bulleted list (Details and Message)
- Watch out for a lone `*` in text like `12*18 print`: anything between two asterisks turns italic.
  Write `12 x 18` instead.

Anything else, including HTML tags, is shown exactly as typed. Basket and Winning Ticket are never
formatted because the page sorts and matches on them.

## Basket photos from a phone

Instead of uploading to Drive, changing sharing, and pasting links into cells, submit
photos through a Google Form. The script shares the file and writes the link into the
matching Baskets row. Submitting the same basket number again replaces the photo, so if
baskets get renumbered, just reshoot.

### One-time setup (about ten minutes)

1. Go to [forms.google.com](https://forms.google.com), signed in as the account that owns
   the Sheet, and create a blank form. Title it **Basket photo**.
2. First question: title it **Basket number**. Type **Short answer**, and turn on
   **Required**. Optional: in the ⋮ menu choose **Response validation** > Number >
   Whole number, so typos are caught on the phone.
3. Second question: title it **Photo**. Type **File upload**. Accept the prompt about
   uploading to Drive. Set **Allow only specific file types** > Image, **Maximum number of
   files** 1, **Maximum file size** 10 MB. Turn on **Required**.
4. **Settings** tab (top of the Form) > Responses: set **Collect email addresses** to
   **Verified**. Leave "Limit to 1 response" off.
5. **Responses** tab > **Link to Sheets** > **Select existing spreadsheet** > pick the
   raffle Sheet. A new tab named "Form Responses 1" appears in it. Leave that tab alone;
   the feed ignores it.
6. In the raffle Sheet, **Settings** tab, add a row: A = `Photo uploaders`, B = the Google
   email addresses allowed to submit, separated by commas. Anyone else who finds the Form
   link can submit, but their photos are ignored and never shared.
7. **Extensions > Apps Script** in the Sheet. Make sure the editor has the current
   `Code.gs` (it must contain `onPhotoSubmit`). Save.
8. Left sidebar, **Triggers** (alarm-clock icon) > **Add Trigger**. Function
   `onPhotoSubmit`, event source **From spreadsheet**, event type **On form submit**.
   Save, and allow the permissions when asked (same "unsafe" warning as before).
9. Back in the Form, click **Send**, choose the link icon, copy the link. Open it on your
   phone and add it to the home screen. Share the link with the other uploader.

### Taking photos

1. Open the Form on your phone. Type the basket number.
2. Tap **Add file**, then **Camera** (or pick from the gallery). Submit.
3. Within about 30 seconds the photo appears on the results page. To replace it, submit
   the same basket number again.

If a basket number does not exist in the Baskets tab yet, the script adds a row with just
the number and photo; fill in the description later. If a photo does not show up, open the
Apps Script editor, **Executions** in the left sidebar, and look at the latest
`onPhotoSubmit` run; a submitter missing from "Photo uploaders" is logged there.

Replaced photos stay in your Drive under **Basket photo (File responses)**. Delete that
folder after the event if you like; the page only needs the links that are still in the
Sheet.

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
