// A deliberately small Markdown subset for text typed into the Sheet:
// **bold**, *italic*, [label](https://url), bare https:// links, line breaks,
// blank-line paragraphs, and "- " / "* " bullet lists.
//
// Pure: parses text into plain objects. The page turns those objects into DOM
// nodes one at a time, so nothing typed into the Sheet is ever parsed as HTML.
// Anything not in the subset, including HTML tags, comes out as literal text.

// Alternatives are tried in this order at each position:
//   1,2  [label](url)      3  bare url      4  **strong**      5  *em*
// The label and URL lengths are bounded so a cell full of "[" cannot make the
// regex backtrack for seconds.
const TOKEN_RE = /\[([^\]\n]{1,300})\]\(([^)\s]{1,2000})\)|(https?:\/\/[^\s<>()[\]]+)|\*\*(\S(?:[^\n]*?\S)?)\*\*|\*(\S(?:[^*\n]*?\S)?)\*/g;

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function isHttpUrl(url) {
  return /^https?:\/\/\S+$/i.test(url);
}

function pushText(nodes, text) {
  if (!text) return;
  const last = nodes[nodes.length - 1];
  if (last && last.type === 'text') last.text += text;
  else nodes.push({ type: 'text', text });
}

// `allowLinks` is false while parsing a link's label, so links never nest.
function parseLine(line, nodes, allowLinks) {
  let last = 0;
  for (const match of line.matchAll(TOKEN_RE)) {
    pushText(nodes, line.slice(last, match.index));
    last = match.index + match[0].length;
    const [whole, label, bracketUrl, bareUrl, strongText, emText] = match;
    if (label !== undefined) {
      if (allowLinks && isHttpUrl(bracketUrl)) {
        nodes.push({ type: 'link', href: bracketUrl, children: parseInline(label, false) });
      } else {
        pushText(nodes, whole);
      }
    } else if (bareUrl !== undefined) {
      if (!allowLinks) {
        pushText(nodes, whole);
        continue;
      }
      const trail = TRAILING_PUNCTUATION.exec(bareUrl);
      const href = trail ? bareUrl.slice(0, -trail[0].length) : bareUrl;
      nodes.push({ type: 'link', href, children: [{ type: 'text', text: href }] });
      if (trail) pushText(nodes, trail[0]);
    } else if (strongText !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(strongText, allowLinks) });
    } else if (emText !== undefined) {
      nodes.push({ type: 'em', children: parseInline(emText, allowLinks) });
    }
  }
  pushText(nodes, line.slice(last));
}

/** Inline formatting only. Newlines become { type: 'br' } nodes. */
export function parseInline(text, allowLinks = true) {
  if (typeof text !== 'string' || text === '') return [];
  const nodes = [];
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index > 0) nodes.push({ type: 'br' });
    parseLine(line, nodes, allowLinks);
  });
  return nodes;
}

/** Paragraphs and bullet lists. Single newlines inside a paragraph become line breaks. */
export function parseBlocks(text) {
  if (typeof text !== 'string') return [];
  const blocks = [];
  let paragraphLines = [];
  let listItems = null;

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraphLines.join('\n')) });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems) {
      blocks.push({ type: 'list', items: listItems });
      listItems = null;
    }
  };

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (line === '') {
      flushParagraph();
      flushList();
    } else if (item) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(parseInline(item[1].trim()));
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** The text a reader would see, with formatting removed. Used for search and the tab title. */
export function plainText(text) {
  const parts = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'text') parts.push(node.text);
      else if (node.type === 'br') parts.push(' ');
      else if (node.children) walk(node.children);
    }
  };
  for (const block of parseBlocks(text)) {
    if (block.type === 'paragraph') walk(block.children);
    else for (const item of block.items) { walk(item); parts.push(' '); }
    parts.push(' ');
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}
