import { DATA_URL, REFRESH_SECONDS } from './config.js';
import { parseTickets, ticketMatches } from './tickets.js';
import { normalizeRows, normalizeSettings, photoUrls, summarize } from './data.js';
import { resolveDataUrl } from './source.js';
import { parseInline, parseBlocks, plainText } from './markdown.js';

const STORAGE_KEY = 'scwny.raffle.myTickets';
const MAX_BACKOFF_SECONDS = 120;
const FETCH_TIMEOUT_MS = 15000;

const el = {
  title: document.getElementById('title'),
  message: document.getElementById('message'),
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  tickets: document.getElementById('tickets'),
  ticketsHelp: document.getElementById('tickets-help'),
  wins: document.getElementById('wins'),
  winsHeading: document.getElementById('wins-heading'),
  winsList: document.getElementById('wins-list'),
  search: document.getElementById('search'),
  results: document.getElementById('results'),
};

const state = {
  rows: [],
  settings: normalizeSettings({}),
  updated: null,
  loadedOnce: false,
  myNumbers: new Set(),
  invalidTokens: [],
  search: '',
  timer: null,
  backoffSeconds: REFRESH_SECONDS,
  inFlight: false,
};

// ---------- data source ----------

const dataUrl = resolveDataUrl({
  search: window.location.search,
  hostname: window.location.hostname,
  defaultUrl: DATA_URL,
});

// ---------- storage ----------

function loadSavedTickets() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveTickets(text) {
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Storage unavailable (private mode, blocked). The feature still works for this visit.
  }
}

// ---------- fetching and refresh ----------

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

function clearError() {
  el.error.hidden = true;
  el.error.textContent = '';
}

function scheduleNext(seconds) {
  window.clearTimeout(state.timer);
  if (document.visibilityState !== 'visible') return;
  state.timer = window.setTimeout(fetchData, seconds * 1000);
}

async function fetchData() {
  if (state.inFlight) return;
  window.clearTimeout(state.timer);

  if (!dataUrl) {
    showError("Results aren't posted yet. Check back when the drawing starts.");
    console.warn('No data source configured. Set DATA_URL in raffle/config.js.');
    el.status.textContent = '';
    el.results.setAttribute('aria-busy', 'false');
    return;
  }

  state.inFlight = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(dataUrl, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      throw new Error(payload && payload.error ? `Server said: ${payload.error}` : 'Unexpected response');
    }

    state.rows = normalizeRows(payload.rows);
    state.settings = normalizeSettings(payload.settings);
    state.updated = new Date();
    state.loadedOnce = true;
    state.backoffSeconds = REFRESH_SECONDS;

    clearError();
    render();
    scheduleNext(REFRESH_SECONDS);
  } catch (err) {
    const wait = state.backoffSeconds;
    state.backoffSeconds = Math.min(wait * 2, MAX_BACKOFF_SECONDS);
    const reason = err && err.message && err.message.startsWith('Server said: ') ? ` ${err.message}.` : '';
    showError(`Couldn't load results.${reason} Retrying in ${wait} seconds…`);
    if (!state.loadedOnce) {
      el.status.textContent = '';
      el.results.setAttribute('aria-busy', 'false');
    }
    console.error('Raffle results fetch failed:', err);
    scheduleNext(wait);
  } finally {
    window.clearTimeout(timeout);
    state.inFlight = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    fetchData();
  } else {
    window.clearTimeout(state.timer);
  }
});

// ---------- rendering ----------

// Formatted text. markdown.js parses Sheet text into plain objects; these build
// DOM nodes from them one at a time. Nothing here parses HTML.

function renderInline(nodes, parent) {
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

function renderBlocks(blocks, parent) {
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

function setInline(element, text) {
  element.replaceChildren();
  renderInline(parseInline(text), element);
}

function setBlocks(element, text) {
  element.replaceChildren();
  renderBlocks(parseBlocks(text), element);
}

function isWin(row) {
  return row.ticket !== '' && ticketMatches(row.ticket, state.myNumbers);
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function render() {
  document.title = `${plainText(state.settings.title)} · SCWNY`;
  setInline(el.title, state.settings.title);
  setBlocks(el.message, state.settings.message);
  el.message.hidden = state.settings.message === '';

  const { total, drawn } = summarize(state.rows);
  const updated = state.updated ? ` · Updated ${formatTime(state.updated)}` : '';
  el.status.textContent = total === 0
    ? `No baskets listed yet${updated}`
    : `${drawn} of ${total} baskets drawn${updated}`;

  renderTicketsHelp();
  renderWins();
  renderResults();
  el.results.setAttribute('aria-busy', 'false');
}

function renderTicketsHelp() {
  el.ticketsHelp.replaceChildren();
  const count = state.myNumbers.size;

  if (count === 0 && state.invalidTokens.length === 0) {
    el.ticketsHelp.textContent = 'Enter your numbers to see your wins highlighted. Saved on this device.';
    return;
  }

  const parts = [`${count} ticket${count === 1 ? '' : 's'} saved.`];
  if (count > 0 && state.loadedOnce && !state.rows.some(isWin)) parts.push('No wins yet.');
  el.ticketsHelp.append(parts.join(' '));

  if (state.invalidTokens.length > 0) {
    const span = document.createElement('span');
    span.className = 'invalid';
    span.textContent = ` Couldn't read: ${state.invalidTokens.join(', ')}`;
    el.ticketsHelp.appendChild(span);
  }
}

function renderWins() {
  const wins = state.rows.filter(isWin);
  if (wins.length === 0) {
    el.wins.hidden = true;
    el.winsList.replaceChildren();
    return;
  }
  el.winsHeading.textContent = wins.length === 1 ? 'You won 1 basket!' : `You won ${wins.length} baskets!`;
  el.winsList.replaceChildren(
    ...wins.map((row) => {
      const li = document.createElement('li');
      li.append(`Basket ${row.basket} · `);
      renderInline(parseInline(row.description), li);
      li.append(` · Ticket ${row.ticket}`);
      return li;
    }),
  );
  el.wins.hidden = false;
}

function matchesSearch(row, query) {
  if (!query) return true;
  return [row.basket, plainText(row.description), row.ticket].some((value) => value.toLowerCase().includes(query));
}

function openDetailBaskets() {
  return new Set(
    [...el.results.querySelectorAll('details[open]')].map((details) => details.dataset.basket),
  );
}

function renderResults() {
  const query = state.search.trim().toLowerCase();
  const rows = state.rows.filter((row) => matchesSearch(row, query));
  const anyPhoto = state.rows.some((row) => photoUrls(row.photo) !== null);
  const keepOpen = openDetailBaskets();

  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = state.rows.length === 0
      ? 'No baskets have been posted yet.'
      : 'No baskets match your search.';
    el.results.replaceChildren(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'list';

  const headerRow = table.createTHead().insertRow();
  const headers = [
    ['Basket', 'num'],
    ['Description', 'desc'],
    ['Winning Ticket', 'ticket'],
    ...(anyPhoto ? [['Photo', 'thumb']] : []),
  ];
  for (const [label, className] of headers) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = className;
    th.textContent = label;
    headerRow.appendChild(th);
  }

  const tbody = table.createTBody();
  for (const row of rows) tbody.appendChild(renderRow(row, anyPhoto, keepOpen));

  el.results.replaceChildren(table);
}

function renderRow(row, anyPhoto, keepOpen) {
  const win = isWin(row);
  const tr = document.createElement('tr');
  tr.className = win ? 'basket win' : 'basket';

  const num = tr.insertCell();
  num.className = 'num';
  num.textContent = row.basket;

  const desc = tr.insertCell();
  desc.className = 'desc';
  const title = document.createElement('div');
  title.className = 'desc-title';
  renderInline(parseInline(row.description), title);
  if (win) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'You';
    title.appendChild(badge);
  }
  desc.appendChild(title);

  if (row.details !== '' || row.donatedBy !== '') {
    const details = document.createElement('details');
    details.dataset.basket = row.basket;
    details.open = keepOpen.has(row.basket);
    const summary = document.createElement('summary');
    summary.textContent = 'Details';
    details.appendChild(summary);
    if (row.details !== '') {
      const body = document.createElement('div');
      body.className = 'details-body';
      renderBlocks(parseBlocks(row.details), body);
      details.appendChild(body);
    }
    if (row.donatedBy !== '') {
      const p = document.createElement('p');
      p.className = 'donor';
      p.append('Donated by ');
      renderInline(parseInline(row.donatedBy), p);
      details.appendChild(p);
    }
    desc.appendChild(details);
  }

  const ticket = tr.insertCell();
  ticket.className = row.ticket === '' ? 'ticket pending' : 'ticket';
  ticket.textContent = row.ticket === '' ? 'Not drawn yet' : row.ticket;

  if (anyPhoto) {
    const thumb = tr.insertCell();
    thumb.className = 'thumb';
    const urls = photoUrls(row.photo);
    if (urls) {
      const link = document.createElement('a');
      link.href = urls.full;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = urls.thumb;
      img.alt = `Photo of basket ${row.basket}`;
      img.loading = 'lazy';
      link.appendChild(img);
      thumb.appendChild(link);
    }
  }

  return tr;
}

// ---------- input handling ----------

function applyTickets(text) {
  const { numbers, invalid } = parseTickets(text);
  state.myNumbers = numbers;
  state.invalidTokens = invalid;
  renderTicketsHelp();
  if (state.loadedOnce) {
    renderWins();
    renderResults();
  }
}

el.tickets.addEventListener('input', () => {
  saveTickets(el.tickets.value);
  applyTickets(el.tickets.value);
});

el.search.addEventListener('input', () => {
  state.search = el.search.value;
  if (state.loadedOnce) renderResults();
});

// ---------- start ----------

el.tickets.value = loadSavedTickets();
applyTickets(el.tickets.value);
fetchData();
