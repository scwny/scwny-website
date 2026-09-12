import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitWithin,
  emptyForm,
  formFromRow,
  validateBasket,
  changedFields,
  buildSavePayload,
  buildPhotoPayload,
  readResponse,
  filterBaskets,
  mergeRow,
} from '../raffle/edit/editor.js';

const row = (basket, extra = {}) => ({
  basket, description: '', ticket: '', details: '', donatedBy: '', photo: '', ...extra,
});

test('fitWithin shrinks the long edge to the limit and keeps the aspect ratio', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
});

test('fitWithin leaves small and square images alone and never returns zero', () => {
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 1600, 1600), { width: 1600, height: 1600 });
  assert.deepEqual(fitWithin(5000, 1, 1600), { width: 1600, height: 1 });
});

test('emptyForm and formFromRow produce the five editable fields', () => {
  assert.deepEqual(emptyForm(), { basket: '', description: '', ticket: '', details: '', donatedBy: '' });
  const form = formFromRow(row('7', { description: 'Spa', ticket: '9', details: 'd', donatedBy: 'J', photo: 'https://x' }));
  assert.deepEqual(form, { basket: '7', description: 'Spa', ticket: '9', details: 'd', donatedBy: 'J' });
});

test('validateBasket requires a basket number and a description', () => {
  assert.deepEqual(validateBasket({ ...emptyForm() }, { isNew: true }), {
    basket: 'Basket number is required.',
    description: 'Description is required.',
  });
  assert.deepEqual(validateBasket({ ...emptyForm(), basket: '3', description: 'Spa' }, { isNew: true }), {});
});

test('validateBasket rejects a new basket whose number already exists', () => {
  const existing = new Set(['1', '12']);
  const errors = validateBasket({ ...emptyForm(), basket: '12', description: 'Spa' }, { isNew: true, existing });
  assert.equal(errors.basket, 'Basket 12 already exists. Pick it from the list to edit it.');
  assert.deepEqual(validateBasket({ ...emptyForm(), basket: '12', description: 'Spa' }, { isNew: false, existing }), {});
});

test('changedFields returns only differing fields, trimmed and keyed by sheet header', () => {
  const original = { basket: '1', description: 'Italian Night', ticket: '', details: 'Pasta', donatedBy: '' };
  const current = { basket: '1', description: 'Italian Night ', ticket: '104', details: 'Pasta\nSauce', donatedBy: '' };
  assert.deepEqual(changedFields(original, current), { 'Winning Ticket': '104', Details: 'Pasta\nSauce' });
  assert.deepEqual(changedFields(original, original), {});
});

test('changedFields from an empty form sends every non-blank field for a new basket', () => {
  const current = { basket: '12', description: 'Spa Day', ticket: '', details: '', donatedBy: 'Jane' };
  assert.deepEqual(changedFields(emptyForm(), current), { Description: 'Spa Day', 'Donated By': 'Jane' });
});

test('buildSavePayload and buildPhotoPayload match the script contract', () => {
  assert.deepEqual(buildSavePayload({ password: 'pw', basket: '12', fields: { Description: 'Spa' } }), {
    action: 'save', password: 'pw', basket: '12', fields: { Description: 'Spa' },
  });
  assert.deepEqual(buildPhotoPayload({ password: 'pw', basket: '5A', data: 'AAAA' }), {
    action: 'photo', password: 'pw', basket: '5A', name: 'basket-5A.jpg', type: 'image/jpeg', data: 'AAAA',
  });
  assert.equal(buildPhotoPayload({ password: 'pw', basket: 'a/b c', data: 'x' }).name, 'basket-a_b_c.jpg');
});

test('readResponse normalizes a good row and turns failures into error strings', () => {
  const good = readResponse('{"ok":true,"basket":"12","row":{"Basket":" 12 ","Description":"Spa","Photo":""}}');
  assert.equal(good.ok, true);
  assert.equal(good.row.basket, '12');
  assert.equal(good.row.description, 'Spa');

  assert.deepEqual(readResponse('{"ok":false,"error":"Wrong password"}'), { ok: false, error: 'Wrong password' });
  assert.deepEqual(readResponse('<html>sign in</html>'), { ok: false, error: 'Unexpected response from the server.' });
  assert.deepEqual(readResponse('{"rows":[]}'), { ok: false, error: 'Unexpected response from the server.' });
});

test('filterBaskets matches the number or the plain-text description, case-insensitively', () => {
  const rows = [row('1', { description: '**Bills** Fan Pack' }), row('12', { description: 'Spa Day' }), row('5A')];
  assert.deepEqual(filterBaskets(rows, '').map((r) => r.basket), ['1', '12', '5A']);
  assert.deepEqual(filterBaskets(rows, 'bills').map((r) => r.basket), ['1']);
  assert.deepEqual(filterBaskets(rows, '5a').map((r) => r.basket), ['5A']);
  assert.deepEqual(filterBaskets(rows, '1').map((r) => r.basket), ['1', '12']);
});

test('mergeRow replaces a basket in place or inserts a new one in basket order', () => {
  const rows = [row('1'), row('3')];
  const replaced = mergeRow(rows, row('3', { description: 'New' }));
  assert.deepEqual(replaced.map((r) => [r.basket, r.description]), [['1', ''], ['3', 'New']]);
  const inserted = mergeRow(rows, row('2'));
  assert.deepEqual(inserted.map((r) => r.basket), ['1', '2', '3']);
  assert.equal(rows.length, 2, 'input is not mutated');
});
