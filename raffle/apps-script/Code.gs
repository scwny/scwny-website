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
var UPLOADERS_SETTING = 'Photo uploaders'; // Settings row the feed hides; see onPhotoSubmit
var CACHE_KEY = 'payload-v1';
var CACHE_SECONDS = 5;

function doGet() {
  var cache = CacheService.getScriptCache();
  var body = cache.get(CACHE_KEY);
  if (!body) {
    var payload = buildPayload();
    body = JSON.stringify(payload);
    if (payload.ok) {
      try {
        cache.put(CACHE_KEY, body, CACHE_SECONDS);
      } catch (err) {
        // Cache values are limited to 100 KB. Serving uncached is fine.
      }
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
      settings: publicSettings(readSettings(ss.getSheetByName(SETTINGS_SHEET))),
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

/** Settings minus rows that are for the script only, such as the uploader emails. */
function publicSettings(settings) {
  var out = {};
  Object.keys(settings).forEach(function (key) {
    if (key.trim().toLowerCase() !== UPLOADERS_SETTING.toLowerCase()) out[key] = settings[key];
  });
  return out;
}

/** Run this from the editor (select "debugPayload", press Run) to see the JSON in the log. */
function debugPayload() {
  Logger.log(JSON.stringify(buildPayload(), null, 2));
}

/* ---------- Basket photos submitted through the Google Form ----------
 *
 * The Form has two questions, a basket number and a photo upload, and collects
 * the submitter's verified email. Its responses land in this spreadsheet, and an
 * installable "on form submit" trigger runs onPhotoSubmit (see SETUP.md).
 * Only emails listed in the Settings row "Photo uploaders" are honoured.
 */

function onPhotoSubmit(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var submission = photoSubmission(e && e.namedValues);
  var allowed = readSettings(ss.getSheetByName(SETTINGS_SHEET))[UPLOADERS_SETTING];
  if (!isAllowedUploader(submission.email, allowed)) {
    Logger.log('Ignored photo from "' + submission.email + '": not in ' + UPLOADERS_SETTING);
    return;
  }
  var fileId = driveFileId(submission.url);
  if (!submission.basket || !fileId) {
    Logger.log('Ignored photo submission: missing basket number or file');
    return;
  }

  DriveApp.getFileById(fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var sheet = ss.getSheetByName(BASKETS_SHEET);
  if (!sheet) throw new Error('Sheet tab "' + BASKETS_SHEET + '" not found');
  var values = sheet.getDataRange().getDisplayValues();
  var headers = values.length ? values[0] : [];
  var basketCol = findColumn(headers, 'basket');
  if (basketCol < 0) throw new Error('No "Basket" header in ' + BASKETS_SHEET);
  var photoCol = findColumn(headers, 'photo');
  if (photoCol < 0) {
    photoCol = headers.length;
    sheet.getRange(1, photoCol + 1).setValue('Photo');
  }

  var row = findBasketRow(values, basketCol, submission.basket);
  if (row < 0) {
    row = Math.max(values.length, 1);
    sheet.getRange(row + 1, basketCol + 1).setValue(submission.basket);
  }
  sheet.getRange(row + 1, photoCol + 1).setValue(submission.url);
  CacheService.getScriptCache().remove(CACHE_KEY);
}

function isAllowedUploader(email, allowlist) {
  var wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return false;
  return String(allowlist || '')
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .indexOf(wanted) >= 0;
}

function driveFileId(url) {
  var match = /drive\.google\.com\/(?:file\/d\/([\w-]+)|(?:open|uc)\?(?:[^#]*&)?id=([\w-]+))/i.exec(String(url || ''));
  return match ? (match[1] || match[2]) : '';
}

/** Pull the fields we need out of a form submit event's namedValues, keyed by question wording. */
function photoSubmission(namedValues) {
  var out = { email: '', basket: '', url: '' };
  Object.keys(namedValues || {}).forEach(function (key) {
    var name = key.toLowerCase();
    var value = String((namedValues[key] || [])[0] || '').trim();
    if (name.indexOf('email') >= 0) out.email = value.toLowerCase();
    else if (name.indexOf('photo') >= 0) {
      // A question worded "Photo of the basket" must not be taken for the basket number.
      var urls = value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      out.url = urls.length ? urls[urls.length - 1] : '';
    } else if (name.indexOf('basket') >= 0) out.basket = value;
  });
  return out;
}

/** Column index of a header, matching the aliases the page accepts, or -1. */
function findColumn(headers, field) {
  var aliases = { basket: ['basket', 'basket #'], photo: ['photo'] }[field] || [field];
  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i] == null ? '' : headers[i]).trim().toLowerCase().replace(/\s+/g, ' ');
    if (aliases.indexOf(header) >= 0) return i;
  }
  return -1;
}

/** Row index (0-based, header is 0) whose basket cell equals `basket`, or -1. */
function findBasketRow(values, basketCol, basket) {
  var wanted = String(basket || '').trim();
  if (!wanted) return -1;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][basketCol] == null ? '' : values[r][basketCol]).trim() === wanted) return r;
  }
  return -1;
}
