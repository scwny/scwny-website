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

test('only http and https bracket links are links, whatever the case or shape', () => {
  for (const url of ['JAVASCRIPT:alert(1)', 'data:text/html;base64,AAAA', '//evil.example.com', '/relative/path', 'vbscript:msgbox']) {
    assert.deepEqual(parseInline(`[x](${url})`), [text(`[x](${url})`)], url);
  }
  assert.deepEqual(parseInline('[x](HTTPS://EXAMPLE.COM)'), [link('HTTPS://EXAMPLE.COM', text('x'))]);
});

test('an empty label or a space before the URL is not a bracket link', () => {
  assert.deepEqual(parseInline('[](https://x.y)'), [text('[]('), link('https://x.y', text('https://x.y')), text(')')]);
  assert.deepEqual(parseInline('[x]( https://x.y)'), [text('[x]( '), link('https://x.y', text('https://x.y')), text(')')]);
});

test('links inside a link label are shown as text, never nested links', () => {
  assert.deepEqual(parseInline('[see https://evil.example.com now](https://good.example.com)'), [
    link('https://good.example.com', text('see https://evil.example.com now')),
  ]);
});

test('italic or bold at the start of a line is not a bullet', () => {
  assert.deepEqual(parseBlocks('*fresh* bread'), [paragraph(em(text('fresh')), text(' bread'))]);
  assert.deepEqual(parseBlocks('**Deluxe** basket'), [paragraph(strong(text('Deluxe')), text(' basket'))]);
});

test('a cell full of unclosed brackets parses quickly', () => {
  const hostile = '['.repeat(50000);
  const started = performance.now();
  const nodes = parseInline(hostile);
  const elapsed = performance.now() - started;
  assert.deepEqual(nodes, [text(hostile)]);
  assert.ok(elapsed < 500, `took ${elapsed.toFixed(0)}ms`);
});
