import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInline, parseBlocks, plainText } from '../raffle/markdown.js';

const text = (t) => ({ type: 'text', text: t });
const strong = (...children) => ({ type: 'strong', children });
const em = (...children) => ({ type: 'em', children });
const link = (href, ...children) => ({ type: 'link', href, children });
const br = { type: 'br' };
const paragraph = (...children) => ({ type: 'paragraph', children });
const list = (...items) => ({ type: 'list', items });

test('plain text is a single text node', () => {
  assert.deepEqual(parseInline('Pasta, sauce, and olive oil'), [text('Pasta, sauce, and olive oil')]);
});

test('double asterisks make bold', () => {
  assert.deepEqual(parseInline('Two **bottles** of wine'), [
    text('Two '),
    strong(text('bottles')),
    text(' of wine'),
  ]);
});

test('single asterisks make italic', () => {
  assert.deepEqual(parseInline('a *very* nice basket'), [text('a '), em(text('very')), text(' nice basket')]);
});

test('bracket links with http(s) URLs become links', () => {
  assert.deepEqual(parseInline('Thanks to [Premier Wine](https://premierwine.com)!'), [
    text('Thanks to '),
    link('https://premierwine.com', text('Premier Wine')),
    text('!'),
  ]);
});

test('bracket links with any other scheme stay literal text', () => {
  assert.deepEqual(parseInline('[x](javascript:alert(1))'), [text('[x](javascript:alert(1))')]);
  assert.deepEqual(parseInline('[x](ftp://example.com)'), [text('[x](ftp://example.com)')]);
});

test('bare URLs become links and trailing punctuation stays text', () => {
  assert.deepEqual(parseInline('see https://example.com/a_b.'), [
    text('see '),
    link('https://example.com/a_b', text('https://example.com/a_b')),
    text('.'),
  ]);
});

test('HTML tags are literal text, never markup', () => {
  assert.deepEqual(parseInline('<b>hi</b> <script>alert(1)</script>'), [
    text('<b>hi</b> <script>alert(1)</script>'),
  ]);
});

test('unmatched markers stay literal', () => {
  assert.deepEqual(parseInline('5* rated **wow'), [text('5* rated **wow')]);
});

test('formatting nests: a link inside bold', () => {
  assert.deepEqual(parseInline('**Donated by [Spot](https://spotcoffee.com)**'), [
    strong(text('Donated by '), link('https://spotcoffee.com', text('Spot'))),
  ]);
});

test('newlines inside a paragraph become line breaks', () => {
  assert.deepEqual(parseBlocks('Two bottles of wine\nA cheese board'), [
    paragraph(text('Two bottles of wine'), br, text('A cheese board')),
  ]);
});

test('a blank line separates paragraphs', () => {
  assert.deepEqual(parseBlocks('First\n\nSecond'), [paragraph(text('First')), paragraph(text('Second'))]);
});

test('lines starting with - or * are a bullet list', () => {
  assert.deepEqual(parseBlocks('- Wine\n- Cheese\n* Crackers'), [
    list([text('Wine')], [text('Cheese')], [text('Crackers')]),
  ]);
});

test('paragraphs and lists can be mixed', () => {
  assert.deepEqual(parseBlocks('Includes:\n- **Wine**\n- Cheese\n\nValue $80'), [
    paragraph(text('Includes:')),
    list([strong(text('Wine'))], [text('Cheese')]),
    paragraph(text('Value $80')),
  ]);
});

test('Windows line endings are normalized', () => {
  assert.deepEqual(parseBlocks('a\r\nb'), [paragraph(text('a'), br, text('b'))]);
});

test('empty or non-string input yields nothing', () => {
  assert.deepEqual(parseInline(''), []);
  assert.deepEqual(parseInline(undefined), []);
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseBlocks(null), []);
  assert.equal(plainText(undefined), '');
});

test('plainText strips formatting and keeps link labels', () => {
  assert.equal(plainText('**Wine** and [cheese](https://c.d)\n- one\n- two'), 'Wine and cheese one two');
});
