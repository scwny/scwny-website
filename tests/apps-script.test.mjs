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
  `${source}; ({ isAllowedUploader, driveFileId, photoSubmission, findBasketRow, findColumn, publicSettings })`,
  {},
);

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
