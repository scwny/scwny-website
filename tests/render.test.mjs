import { test } from 'node:test';
import assert from 'node:assert/strict';

// A minimal document: enough of createElement/createTextNode/appendChild to
// see what the renderers build. render.js only touches `document` inside its
// functions, so installing the stub before calling them is sufficient.
function element(tag) {
  return {
    tag,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...kids) {
      this.children = kids;
    },
  };
}
globalThis.document = {
  createElement: element,
  createTextNode: (text) => ({ tag: '#text', text }),
};

const { renderInline, renderBlocks, setInline, setBlocks } = await import('../raffle/render.js');
const { parseInline, parseBlocks } = await import('../raffle/markdown.js');

test('renderInline builds text, strong, em, br, and safe links', () => {
  const parent = element('div');
  renderInline(parseInline('Hi **there**\n[Chef](https://example.com)'), parent);
  const [text, strong, br, link] = parent.children;
  assert.equal(text.text, 'Hi ');
  assert.equal(strong.tag, 'strong');
  assert.equal(strong.children[0].text, 'there');
  assert.equal(br.tag, 'br');
  assert.equal(link.tag, 'a');
  assert.equal(link.href, 'https://example.com');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.children[0].text, 'Chef');
});

test('renderBlocks builds paragraphs and bulleted lists', () => {
  const parent = element('div');
  renderBlocks(parseBlocks('Includes:\n- Pasta\n- Sauce\n\nValue $80'), parent);
  const [p1, ul, p2] = parent.children;
  assert.equal(p1.tag, 'p');
  assert.equal(ul.tag, 'ul');
  assert.equal(ul.children.length, 2);
  assert.equal(ul.children[0].tag, 'li');
  assert.equal(ul.children[1].children[0].text, 'Sauce');
  assert.equal(p2.tag, 'p');
});

test('setInline and setBlocks replace existing content', () => {
  const target = element('div');
  target.children = [element('span')];
  setInline(target, 'plain');
  assert.equal(target.children.length, 1);
  assert.equal(target.children[0].text, 'plain');

  setBlocks(target, 'one\n\ntwo');
  assert.equal(target.children.length, 2);
  assert.equal(target.children[1].tag, 'p');
});

test('HTML in Sheet text comes out as literal text, never as elements', () => {
  const parent = element('div');
  renderInline(parseInline('<img src=x onerror=alert(1)>'), parent);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].tag, '#text');
  assert.equal(parent.children[0].text, '<img src=x onerror=alert(1)>');
});
