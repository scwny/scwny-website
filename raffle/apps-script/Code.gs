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
      settings: readSettings(ss.getSheetByName(SETTINGS_SHEET)),
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

/** Run this from the editor (select "debugPayload", press Run) to see the JSON in the log. */
function debugPayload() {
  Logger.log(JSON.stringify(buildPayload(), null, 2));
}
