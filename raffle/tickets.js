// Pure helpers for the "My tickets" feature. No DOM, no side effects.

const MAX_RANGE = 1000;
const MAX_TOTAL = 5000;

/**
 * Parse free text like "97-104, 241, 250 to 252" into a Set of integers.
 * Never throws. Unparseable tokens are returned in `invalid`.
 */
export function parseTickets(text) {
  const numbers = new Set();
  const invalid = [];
  if (typeof text !== 'string') return { numbers, invalid };

  const normalized = text
    .replace(/[–—]/g, '-')   // en dash, em dash
    .replace(/\s+to\s+/gi, '-')        // "97 to 104"
    .replace(/\s*-\s*/g, '-');         // "97 - 104"

  const tokens = normalized.split(/[\s,;]+/).filter(Boolean);

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n > 0 && numbers.size < MAX_TOTAL) numbers.add(n);
      else invalid.push(token);
      continue;
    }

    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      let lo = Number(range[1]);
      let hi = Number(range[2]);
      if (lo > hi) [lo, hi] = [hi, lo];
      const count = hi - lo + 1;
      if (lo <= 0 || count > MAX_RANGE || numbers.size + count > MAX_TOTAL) {
        invalid.push(token);
        continue;
      }
      for (let n = lo; n <= hi; n += 1) numbers.add(n);
      continue;
    }

    invalid.push(token);
  }

  return { numbers, invalid };
}

/**
 * True when any run of digits in `cell` is one of the visitor's numbers.
 * Tolerates cells like "104" and "104 (Jane)". Blank cells never match.
 */
export function ticketMatches(cell, numbers) {
  if (!numbers || numbers.size === 0) return false;
  if (cell === null || cell === undefined) return false;
  const runs = String(cell).match(/\d+/g);
  if (!runs) return false;
  return runs.some((run) => numbers.has(Number(run)));
}
