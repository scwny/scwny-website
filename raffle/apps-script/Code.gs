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
 * Writes: doPost handles the editor page at /raffle/edit. See SETUP.md "Editing baskets".
 */

var BASKETS_SHEET = 'Baskets';
var SETTINGS_SHEET = 'Settings';
var UPLOADERS_SETTING = 'Photo uploaders'; // Settings row the feed hides; see onPhotoSubmit
var PASSWORD_SETTING = 'Editor password'; // Settings row the editor page must match; see doPost
var HIDDEN_SETTINGS = [UPLOADERS_SETTING, PASSWORD_SETTING];
var TEXT_FIELDS = ['Description', 'Winning Ticket', 'Details', 'Donated By']; // columns `save` may write
var PHOTO_FOLDER = 'Raffle photos'; // Drive folder for photos uploaded through the editor page
var MAX_PHOTO_BYTES = 4 * 1024 * 1024;
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
  var headers = values[0];
  return values
    .slice(1)
    .filter(function (row) {
      return row.some(function (cell) { return String(cell).trim() !== ''; });
    })
    .map(function (row) { return rowObject(headers, row); });
}

/** One sheet row as the feed returns it: keyed by trimmed header, blank headers skipped. */
function rowObject(headers, row) {
  var obj = {};
  headers.forEach(function (header, i) {
    var key = String(header == null ? '' : header).trim();
    if (key) obj[key] = String(row[i] == null ? '' : row[i]).trim();
  });
  return obj;
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

/** Settings minus rows that are for the script only: uploader emails and the editor password. */
function publicSettings(settings) {
  var hidden = HIDDEN_SETTINGS.map(function (key) { return key.toLowerCase(); });
  var out = {};
  Object.keys(settings).forEach(function (key) {
    if (hidden.indexOf(key.trim().toLowerCase()) < 0) out[key] = settings[key];
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
  var aliases = {
    basket: ['basket', 'basket #'],
    photo: ['photo'],
    'winning ticket': ['winning ticket', 'winner'],
  }[field] || [field];
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
