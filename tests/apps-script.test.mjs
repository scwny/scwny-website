import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Code.gs is plain ES5 with no top-level Google API calls, so it can be
// evaluated in a bare sandbox and its pure helpers pulled out for testing.
// Objects built inside the sandbox have their own Object prototype, so spread
// them into a plain object before deep-equal comparisons.
const source = readFileSync(new URL('../raffle/apps-script/Code.gs', import.meta.url), 'utf8');
const gs = vm.runInNewContext(
  `${source}; ({ isAllowedUploader, driveFileId, photoSubmission, findBasketRow, findColumn, publicSettings,
     rowObject, checkPassword, parseEditRequest, upsertBasket, driveViewUrl, settingValue })`,
  {},
);

/** Sort {row, col, value} entries so a changes array can be deep-equal-compared order-independently. */
function sortChanges(list) {
  return [...list].sort((a, b) => a.row - b.row || a.col - b.col);
}

test('isAllowedUploader matches case-insensitively and ignores spacing', () => {
  const list = ' Pat@Gmail.com , other@example.org ';
  assert.equal(gs.isAllowedUploader('pat@gmail.com', list), true);
  assert.equal(gs.isAllowedUploader('OTHER@example.org', list), true);
  assert.equal(gs.isAllowedUploader('stranger@example.org', list), false);
});

test('isAllowedUploader rejects everyone when the list or email is empty', () => {
  assert.equal(gs.isAllowedUploader('pat@gmail.com', ''), false);
  assert.equal(gs.isAllowedUploader('', 'pat@gmail.com'), false);
  assert.equal(gs.isAllowedUploader(undefined, undefined), false);
});

test('driveFileId reads the open?id= link that Form uploads produce', () => {
  assert.equal(gs.driveFileId('https://drive.google.com/open?id=1AbC_d-9xyz'), '1AbC_d-9xyz');
});

test('driveFileId reads file/d/ links and returns empty for anything else', () => {
  assert.equal(gs.driveFileId('https://drive.google.com/file/d/1AbC_d-9xyz/view?usp=sharing'), '1AbC_d-9xyz');
  assert.equal(gs.driveFileId('https://example.com/photo.jpg'), '');
  assert.equal(gs.driveFileId(''), '');
});

test('photoSubmission picks email, basket, and photo out of namedValues by header keyword', () => {
  const namedValues = {
    Timestamp: ['9/8/2026 10:00:00'],
    'Email Address': ['Pat@Gmail.com'],
    'Basket number': [' 12 '],
    'Photo of the basket': ['https://drive.google.com/open?id=abc123'],
  };
  assert.deepEqual({ ...gs.photoSubmission(namedValues) }, {
    email: 'pat@gmail.com',
    basket: '12',
    url: 'https://drive.google.com/open?id=abc123',
  });
});

test('photoSubmission uses the last file when several were uploaded and blanks missing fields', () => {
  const namedValues = {
    Photo: ['https://drive.google.com/open?id=first, https://drive.google.com/open?id=second'],
  };
  assert.deepEqual({ ...gs.photoSubmission(namedValues) }, {
    email: '',
    basket: '',
    url: 'https://drive.google.com/open?id=second',
  });
});

test('findColumn matches headers case-insensitively and knows the Basket # alias', () => {
  const headers = ['Basket #', 'Description', ' PHOTO '];
  assert.equal(gs.findColumn(headers, 'basket'), 0);
  assert.equal(gs.findColumn(headers, 'photo'), 2);
  assert.equal(gs.findColumn(headers, 'details'), -1);
});

test('findBasketRow returns the sheet row index of the matching basket, or -1', () => {
  const values = [
    ['Basket', 'Description'],
    ['1', 'Italian Night'],
    [' 12 ', 'Movie Night'],
    ['', ''],
  ];
  assert.equal(gs.findBasketRow(values, 0, '12'), 2);
  assert.equal(gs.findBasketRow(values, 0, '1'), 1);
  assert.equal(gs.findBasketRow(values, 0, '99'), -1);
  assert.equal(gs.findBasketRow(values, 0, ''), -1);
});

test('publicSettings drops the uploader allowlist so emails never reach the feed', () => {
  const settings = { Title: 'Raffle', 'Photo uploaders': 'pat@gmail.com', 'photo UPLOADERS ': 'x' };
  assert.deepEqual({ ...gs.publicSettings(settings) }, { Title: 'Raffle' });
});

test('publicSettings also hides the editor password', () => {
  const settings = { Title: 'Raffle', 'Editor password': 'hunter2', 'editor PASSWORD': 'x', Message: 'Hi' };
  assert.deepEqual({ ...gs.publicSettings(settings) }, { Title: 'Raffle', Message: 'Hi' });
});

test('rowObject keys a row by trimmed header and skips blank headers', () => {
  const obj = gs.rowObject(['Basket', ' Description ', '', 'Photo'], [' 7 ', 'Italian Night', 'ignored', undefined]);
  assert.deepEqual({ ...obj }, { Basket: '7', Description: 'Italian Night', Photo: '' });
});

test('checkPassword refuses everything when no password is configured', () => {
  assert.equal(gs.checkPassword('anything', ''), 'Editing is disabled: no Editor password in Settings');
  assert.equal(gs.checkPassword('anything', undefined), 'Editing is disabled: no Editor password in Settings');
});

test('checkPassword accepts an exact match after trimming and rejects the rest', () => {
  assert.equal(gs.checkPassword(' hunter2 ', 'hunter2'), '');
  assert.equal(gs.checkPassword('Hunter2', 'hunter2'), 'Wrong password');
  assert.equal(gs.checkPassword('', 'hunter2'), 'Wrong password');
});

test('parseEditRequest rejects bad JSON, unknown actions, and a missing basket', () => {
  assert.equal(gs.parseEditRequest('not json'), 'Bad request');
  assert.equal(gs.parseEditRequest(''), 'Bad request');
  assert.equal(gs.parseEditRequest('[1,2]'), 'Bad request');
  assert.equal(gs.parseEditRequest('{"action":"delete","basket":"1"}'), 'Unknown action');
  assert.equal(gs.parseEditRequest('{"action":"save","basket":"  "}'), 'Basket number is required');
});

test('parseEditRequest keeps only the four text fields for save, as strings', () => {
  const body = JSON.stringify({
    action: 'save',
    password: 'pw',
    basket: ' 12 ',
    fields: { Description: 'Spa Day', 'Winning Ticket': 250, Basket: 'nope', Photo: 'nope', Details: null },
  });
  const request = gs.parseEditRequest(body);
  assert.equal(request.action, 'save');
  assert.equal(request.password, 'pw');
  assert.equal(request.basket, '12');
  assert.deepEqual({ ...request.fields }, { Description: 'Spa Day', 'Winning Ticket': '250', Details: '' });
});

test('parseEditRequest requires image data and an image type for photo', () => {
  assert.equal(gs.parseEditRequest('{"action":"photo","basket":"1"}'), 'Bad request');
  assert.equal(gs.parseEditRequest('{"action":"photo","basket":"1","data":"abc","type":"text/html"}'), 'Bad request');
  const request = gs.parseEditRequest('{"action":"photo","password":"pw","basket":"1","data":"abc"}');
  assert.equal(request.action, 'photo');
  assert.equal(request.type, 'image/jpeg');
  assert.equal(request.name, 'photo.jpg');
  assert.equal(request.data, 'abc');
});

test('upsertBasket writes fields into the matching row and leaves other columns alone', () => {
  const values = [
    ['Basket', 'Description', 'Winning Ticket', 'Details'],
    ['1', 'Italian Night', '104', 'Pasta'],
    ['2', 'Movie Night', '', ''],
  ];
  const result = gs.upsertBasket(values, '2', { Description: 'Movie Night!', Details: 'Popcorn' });
  assert.equal(result.rowIndex, 2);
  assert.deepEqual([...result.headers], ['Basket', 'Description', 'Winning Ticket', 'Details']);
  assert.deepEqual([...result.row], ['2', 'Movie Night!', '', 'Popcorn']);
  assert.deepEqual(values[2], ['2', 'Movie Night', '', ''], 'input grid is not mutated');
});

test('upsertBasket appends a row for a new basket and a column for a new header', () => {
  const values = [['Basket #', 'Description'], ['1', 'Italian Night']];
  const result = gs.upsertBasket(values, '12', { Description: 'Spa Day', 'Donated By': 'Jane' });
  assert.equal(result.rowIndex, 2);
  assert.deepEqual([...result.headers], ['Basket #', 'Description', 'Donated By']);
  assert.deepEqual([...result.row], ['12', 'Spa Day', 'Jane']);
});

test('upsertBasket writes Winning Ticket into an old Winner column instead of adding one', () => {
  const values = [['Basket', 'Winner'], ['3', '']];
  const result = gs.upsertBasket(values, '3', { 'Winning Ticket': '77' });
  assert.deepEqual([...result.headers], ['Basket', 'Winner']);
  assert.deepEqual([...result.row], ['3', '77']);
});

test('upsertBasket throws when the sheet has no Basket header', () => {
  assert.throws(() => gs.upsertBasket([['Name', 'Description']], '1', { Description: 'x' }), /No "Basket" header/);
});

test('upsertBasket reports cell-level changes for an existing row, with no basket cell', () => {
  const values = [
    ['Basket', 'Description', 'Winning Ticket', 'Details'],
    ['1', 'Italian Night', '104', 'Pasta'],
    ['2', 'Movie Night', '', ''],
  ];
  const result = gs.upsertBasket(values, '2', { Description: 'Movie Night!', Details: 'Popcorn' });
  const changes = [...result.changes].map((c) => ({ ...c }));
  assert.deepEqual(sortChanges(changes), sortChanges([
    { row: 2, col: 1, value: 'Movie Night!' },
    { row: 2, col: 3, value: 'Popcorn' },
  ]));
});

test('upsertBasket reports the basket cell and field cell when the basket is new', () => {
  const values = [['Basket #', 'Description'], ['1', 'Italian Night']];
  const result = gs.upsertBasket(values, '12', { Description: 'Spa Day' });
  const changes = [...result.changes].map((c) => ({ ...c }));
  assert.deepEqual(sortChanges(changes), sortChanges([
    { row: 2, col: 0, value: '12' },
    { row: 2, col: 1, value: 'Spa Day' },
  ]));
});

test('upsertBasket reports the header cell and data cell for a new column', () => {
  const values = [['Basket #', 'Description'], ['1', 'Italian Night']];
  const result = gs.upsertBasket(values, '1', { 'Donated By': 'Jane' });
  const changes = [...result.changes].map((c) => ({ ...c }));
  assert.deepEqual(sortChanges(changes), sortChanges([
    { row: 0, col: 2, value: 'Donated By' },
    { row: 1, col: 2, value: 'Jane' },
  ]));
});

test('driveViewUrl builds the link the results page already understands', () => {
  assert.equal(gs.driveViewUrl('1AbC_d-9xyz'), 'https://drive.google.com/file/d/1AbC_d-9xyz/view');
});

test('settingValue matches a key regardless of case and surrounding spacing, or returns empty', () => {
  const settings = { ' editor PASSWORD ': 'hunter2', 'Photo Uploaders': 'pat@gmail.com' };
  assert.equal(gs.settingValue(settings, 'Editor password'), 'hunter2');
  assert.equal(gs.settingValue(settings, 'photo uploaders'), 'pat@gmail.com');
  assert.equal(gs.settingValue(settings, 'Missing'), '');
});
