// Pure helpers that turn the Apps Script payload into display-ready rows.
// No DOM, no fetch.

// Sheet header (lower-cased, whitespace collapsed) -> Row field.
const HEADER_TO_FIELD = {
  'basket': 'basket',
  'basket #': 'basket', // 2024 sheet layout
  'description': 'description',
  'winning ticket': 'ticket',
  'winner': 'ticket', // older sheet layout
  'details': 'details',
  'donated by': 'donatedBy',
  'photo': 'photo',
};

// Preferred header per field when a sheet has more than one alias.
const PREFERRED_HEADER = { ticket: 'winning ticket' };

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/\s+/g, ' ');
}

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeRow(raw) {
  const row = { basket: '', description: '', ticket: '', details: '', donatedBy: '', photo: '' };
  const filledBy = {};
  for (const [key, value] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const normalizedKey = normalizeKey(key);
    const field = HEADER_TO_FIELD[normalizedKey];
    if (!field) continue;
    // First header wins, unless a later header is the preferred alias for the field.
    if (filledBy[field] !== undefined && normalizedKey !== PREFERRED_HEADER[field]) continue;
    row[field] = asText(value);
    filledBy[field] = normalizedKey;
  }
  return row;
}

export function compareBaskets(a, b) {
  const aNumeric = /^\d+$/.test(a.basket);
  const bNumeric = /^\d+$/.test(b.basket);
  if (aNumeric && bNumeric) return Number(a.basket) - Number(b.basket);
  return a.basket.localeCompare(b.basket, undefined, { numeric: true, sensitivity: 'base' });
}

export function normalizeRows(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows.map(normalizeRow).sort(compareBaskets);
}

export function normalizeSettings(raw) {
  const settings = { title: 'Raffle Results', message: '' };
  for (const [key, value] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const normalizedKey = normalizeKey(key);
    const text = asText(value);
    if (normalizedKey === 'title' && text) settings.title = text;
    if (normalizedKey === 'message') settings.message = text;
  }
  return settings;
}

const DRIVE_LINK = /drive\.google\.com\/(?:file\/d\/([\w-]+)|(?:open|uc)\?(?:[^#]*&)?id=([\w-]+))/i;

export function photoUrls(url) {
  const text = asText(url);
  if (!/^https?:\/\//i.test(text)) return null;
  const match = DRIVE_LINK.exec(text);
  const id = match && (match[1] || match[2]);
  if (id) {
    return {
      thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
      full: `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
    };
  }
  return { thumb: text, full: text };
}

export function summarize(rows) {
  const drawn = rows.filter((row) => row.ticket !== '').length;
  return { total: rows.length, drawn };
}
