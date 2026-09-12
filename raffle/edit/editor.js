// Pure helpers for the basket editor page. No DOM, no fetch. edit.js owns those.
import { normalizeRow, compareBaskets } from '../data.js';
import { plainText } from '../markdown.js';

export const MAX_PHOTO_EDGE = 1600;
export const JPEG_QUALITY = 0.85;

// Form field -> Sheet header the script writes. Basket is sent separately.
export const FIELD_HEADERS = {
  description: 'Description',
  ticket: 'Winning Ticket',
  details: 'Details',
  donatedBy: 'Donated By',
};

const UNEXPECTED = 'Unexpected response from the server.';

/** Largest size with the same aspect ratio that fits in a maxEdge square. Never below 1 px. */
export function fitWithin(width, height, maxEdge = MAX_PHOTO_EDGE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export function emptyForm() {
  return { basket: '', description: '', ticket: '', details: '', donatedBy: '' };
}

export function formFromRow(row) {
  return {
    basket: row.basket,
    description: row.description,
    ticket: row.ticket,
    details: row.details,
    donatedBy: row.donatedBy,
  };
}

/** Field -> message for anything that must be fixed before saving. Empty when valid. */
export function validateBasket(form, { isNew = false, existing = new Set() } = {}) {
  const errors = {};
  if (!form.basket) errors.basket = 'Basket number is required.';
  else if (isNew && existing.has(form.basket)) {
    errors.basket = `Basket ${form.basket} already exists. Pick it from the list to edit it.`;
  }
  if (!form.description) errors.description = 'Description is required.';
  return errors;
}

/** Sheet header -> new value, for fields whose trimmed text differs from the original. */
export function changedFields(original, current) {
  const fields = {};
  for (const [key, header] of Object.entries(FIELD_HEADERS)) {
    const before = String(original?.[key] ?? '').trim();
    const after = String(current?.[key] ?? '').trim();
    if (before !== after) fields[header] = after;
  }
  return fields;
}

export function buildSavePayload({ password, basket, fields }) {
  return { action: 'save', password, basket, fields };
}

export function buildPhotoPayload({ password, basket, data, type = 'image/jpeg' }) {
  const safeBasket = String(basket).replace(/[^\w-]+/g, '_');
  return { action: 'photo', password, basket, name: `basket-${safeBasket}.jpg`, type, data };
}

/** Turn the script's response text into { ok, row } or { ok, error }. */
export function readResponse(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: UNEXPECTED };
  }
  if (!payload || typeof payload !== 'object' || payload.ok !== true) {
    const error = payload && payload.error ? String(payload.error) : UNEXPECTED;
    return { ok: false, error };
  }
  return { ok: true, row: normalizeRow(payload.row) };
}

export function filterBaskets(rows, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (row) => row.basket.toLowerCase().includes(q) || plainText(row.description).toLowerCase().includes(q),
  );
}

/** A new rows array with `row` replacing any row with the same basket number, kept sorted. */
export function mergeRow(rows, row) {
  return [...rows.filter((r) => r.basket !== row.basket), row].sort(compareBaskets);
}
