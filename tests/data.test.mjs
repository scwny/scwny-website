import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRow,
  normalizeRows,
  compareBaskets,
  normalizeSettings,
  photoUrls,
  summarize,
} from '../raffle/data.js';

test('normalizeRow maps headers case-insensitively, trims, and accepts the Winner alias', () => {
  const row = normalizeRow({
    ' basket ': ' 7 ',
    DESCRIPTION: 'Italian Night',
    Winner: '104',
    'Donated  By': 'Wegmans',
  });
  assert.deepEqual(row, {
    basket: '7',
    description: 'Italian Night',
    ticket: '104',
    details: '',
    donatedBy: 'Wegmans',
    photo: '',
  });
});

test('normalizeRow prefers Winning Ticket over Winner when both exist', () => {
  const row = normalizeRow({ 'Winning Ticket': '9', Winner: '4' });
  assert.equal(row.ticket, '9');
});

test('normalizeRow ignores unknown columns and null values', () => {
  const row = normalizeRow({ Basket: '1', Color: 'red', Details: null });
  assert.equal(row.basket, '1');
  assert.equal(row.details, '');
  assert.equal(Object.keys(row).length, 6);
});

test('normalizeRows tolerates non-array input', () => {
  assert.deepEqual(normalizeRows(undefined), []);
  assert.deepEqual(normalizeRows('nope'), []);
});

test('normalizeRows sorts integers numerically and labels after them', () => {
  const rows = normalizeRows([{ Basket: '10' }, { Basket: '2' }, { Basket: 'B' }, { Basket: 'A' }]);
  assert.deepEqual(rows.map((r) => r.basket), ['2', '10', 'A', 'B']);
});

test('compareBaskets is numeric for integer baskets', () => {
  assert.ok(compareBaskets({ basket: '9' }, { basket: '10' }) < 0);
  assert.ok(compareBaskets({ basket: '10' }, { basket: '9' }) > 0);
  assert.equal(compareBaskets({ basket: '5' }, { basket: '5' }), 0);
});

test('normalizeSettings applies defaults and trims', () => {
  assert.deepEqual(normalizeSettings({}), { title: 'Raffle Results', message: '' });
  assert.deepEqual(normalizeSettings(undefined), { title: 'Raffle Results', message: '' });
  assert.deepEqual(
    normalizeSettings({ TITLE: ' 2026 Meat Raffle ', message: ' Doors at 6 ' }),
    { title: '2026 Meat Raffle', message: 'Doors at 6' },
  );
  assert.equal(normalizeSettings({ Title: '   ' }).title, 'Raffle Results');
});

test('photoUrls rewrites Google Drive links to the thumbnail endpoint', () => {
  assert.deepEqual(photoUrls('https://drive.google.com/file/d/abc_123-XYZ/view?usp=sharing'), {
    thumb: 'https://drive.google.com/thumbnail?id=abc_123-XYZ&sz=w400',
    full: 'https://drive.google.com/thumbnail?id=abc_123-XYZ&sz=w1600',
  });
  assert.equal(
    photoUrls('https://drive.google.com/open?id=abc').thumb,
    'https://drive.google.com/thumbnail?id=abc&sz=w400',
  );
  assert.equal(
    photoUrls('https://drive.google.com/uc?export=view&id=abc').thumb,
    'https://drive.google.com/thumbnail?id=abc&sz=w400',
  );
});

test('photoUrls passes other http(s) URLs through and rejects everything else', () => {
  assert.deepEqual(photoUrls(' https://example.com/a.jpg '), {
    thumb: 'https://example.com/a.jpg',
    full: 'https://example.com/a.jpg',
  });
  assert.equal(photoUrls('javascript:alert(1)'), null);
  assert.equal(photoUrls('data:image/png;base64,AAAA'), null);
  assert.equal(photoUrls(''), null);
  assert.equal(photoUrls(undefined), null);
});

test('summarize counts drawn baskets', () => {
  assert.deepEqual(summarize([{ ticket: '1' }, { ticket: '' }, { ticket: '9' }]), { total: 3, drawn: 2 });
  assert.deepEqual(summarize([]), { total: 0, drawn: 0 });
});
