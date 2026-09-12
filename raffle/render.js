// DOM builders for the plain objects markdown.js produces. Shared by the
// results page and the editor page. Nothing here parses HTML: every piece of
// Sheet text becomes a text node, and link hrefs were already checked to start
// with http(s):// by the parser.
import { parseInline, parseBlocks } from './markdown.js';

export function renderInline(nodes, parent) {
  for (const node of nodes) {
    if (node.type === 'text') {
      parent.appendChild(document.createTextNode(node.text));
    } else if (node.type === 'br') {
      parent.appendChild(document.createElement('br'));
    } else if (node.type === 'strong' || node.type === 'em') {
      const element = document.createElement(node.type);
      renderInline(node.children, element);
      parent.appendChild(element);
    } else if (node.type === 'link') {
      const link = document.createElement('a');
      link.href = node.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      renderInline(node.children, link);
      parent.appendChild(link);
    }
  }
}

export function renderBlocks(blocks, parent) {
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const p = document.createElement('p');
      renderInline(block.children, p);
      parent.appendChild(p);
    } else if (block.type === 'list') {
      const ul = document.createElement('ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        renderInline(item, li);
        ul.appendChild(li);
      }
      parent.appendChild(ul);
    }
  }
}

export function setInline(element, text) {
  element.replaceChildren();
  renderInline(parseInline(text), element);
}

export function setBlocks(element, text) {
  element.replaceChildren();
  renderBlocks(parseBlocks(text), element);
}
