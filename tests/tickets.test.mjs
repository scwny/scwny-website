import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTickets, ticketMatches } from '../raffle/tickets.js';

const nums = (text) => [...parseTickets(text).numbers].sort((a, b) => a - b);

test('single numbers separated by commas and spaces', () => {
  assert.deepEqual(nums('104, 7 250'), [7, 104, 250]);
});

test('range is inclusive', () => {
  assert.deepEqual(nums('97-104'), [97, 98, 99, 100, 101, 102, 103, 104]);
});

test('reversed range is swapped', () => {
  assert.deepEqual(nums('5-3'), [3, 4, 5]);
});

test('en dash, "to", and spaced hyphen all work as range separators', () => {
  assert.deepEqual(nums('3–5'), [3, 4, 5]);
  assert.deepEqual(nums('3 to 5'), [3, 4, 5]);
  assert.deepEqual(nums('3 - 5'), [3, 4, 5]);
});

test('semicolons and newlines separate tokens', () => {
  assert.deepEqual(nums('1;2\n3'), [1, 2, 3]);
});

test('duplicates collapse', () => {
  assert.deepEqual(nums('4, 4, 3-5'), [3, 4, 5]);
});

test('leading zeros are ignored', () => {
  assert.deepEqual(nums('0104'), [104]);
});

test('invalid tokens are reported and parsing does not throw', () => {
  const result = parseTickets('12, abc, 5-x, 0');
  assert.deepEqual([...result.numbers], [12]);
  assert.deepEqual(result.invalid, ['abc', '5-x', '0']);
});

test('non-string input yields an empty result', () => {
  const result = parseTickets(undefined);
  assert.equal(result.numbers.size, 0);
  assert.deepEqual(result.invalid, []);
});

test('a range over 1000 numbers is rejected as invalid', () => {
  const result = parseTickets('1-2000');
  assert.equal(result.numbers.size, 0);
  assert.deepEqual(result.invalid, ['1-2000']);
});

test('more than 5000 numbers in total is rejected', () => {
  const result = parseTickets('1-1000 1001-2000 2001-3000 3001-4000 4001-5000 5001-5001');
  assert.equal(result.numbers.size, 5000);
  assert.deepEqual(result.invalid, ['5001-5001']);
});

test('ticketMatches matches any run of digits in the cell', () => {
  const numbers = parseTickets('104').numbers;
  assert.equal(ticketMatches('104', numbers), true);
  assert.equal(ticketMatches('104 (Jane)', numbers), true);
  assert.equal(ticketMatches('0104', numbers), true);
  assert.equal(ticketMatches('1040', numbers), false);
  assert.equal(ticketMatches('', numbers), false);
  assert.equal(ticketMatches(null, numbers), false);
  assert.equal(ticketMatches(undefined, numbers), false);
});

test('ticketMatches is false with no saved numbers', () => {
  assert.equal(ticketMatches('104', new Set()), false);
  assert.equal(ticketMatches('104', undefined), false);
});

test('numbers beyond the safe-integer range are rejected instead of hanging', () => {
  const range = parseTickets('99999999999999999999-99999999999999999999');
  assert.equal(range.numbers.size, 0);
  assert.deepEqual(range.invalid, ['99999999999999999999-99999999999999999999']);

  const single = parseTickets('99999999999999999999');
  assert.equal(single.numbers.size, 0);
  assert.deepEqual(single.invalid, ['99999999999999999999']);

  const edge = parseTickets('9007199254740993-9007199254740994');
  assert.equal(edge.numbers.size, 0);
  assert.deepEqual(edge.invalid, ['9007199254740993-9007199254740994']);
});
