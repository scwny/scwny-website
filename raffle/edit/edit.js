// Basket editor page: DOM, fetch, password storage, screens. Anything that can
// be unit tested lives in editor.js.
import { DATA_URL } from '../config.js';
import { resolveDataUrl } from '../source.js';
import { normalizeRows, photoUrls } from '../data.js';
import { setInline, setBlocks } from '../render.js';
import {
  emptyForm,
  formFromRow,
  validateBasket,
  changedFields,
  buildSavePayload,
  readResponse,
  filterBaskets,
  mergeRow,
  JPEG_QUALITY,
  fitWithin,
  buildPhotoPayload,
} from './editor.js';

const PASSWORD_KEY = 'scwny.raffle.editorPassword';
const FETCH_TIMEOUT_MS = 15000;
const PHOTO_TIMEOUT_MS = 60000;

const demo = new URLSearchParams(window.location.search).get('demo') === '1';
const dataUrl = resolveDataUrl({
  search: window.location.search,
  hostname: window.location.hostname,
  defaultUrl: DATA_URL,
  demoUrl: '../sample-data.json',
});

const $ = (id) => document.getElementById(id);
const el = {
  error: $('error'),
  login: $('login'),
  loginForm: $('login-form'),
  password: $('password'),
  list: $('list'),
  search: $('search'),
  refresh: $('refresh'),
  add: $('add'),
  status: $('status'),
  baskets: $('baskets'),
  editor: $('editor'),
  form: $('basket-form'),
  heading: $('editor-heading'),
  fBasket: $('f-basket'),
  fDescription: $('f-description'),
  fTicket: $('f-ticket'),
  fDetails: $('f-details'),
  fDonated: $('f-donated'),
  pDescription: $('p-description'),
  pDetails: $('p-details'),
  pDonated: $('p-donated'),
  eBasket: $('e-basket'),
  eDescription: $('e-description'),
  eSave: $('e-save'),
  note: $('note'),
  photoCurrent: $('photo-current'),
  photoButton: $('photo-button'),
  fPhoto: $('f-photo'),
  photoStatus: $('photo-status'),
  ePhoto: $('e-photo'),
  confirmBar: $('confirm-bar'),
  discard: $('discard'),
  keep: $('keep'),
  back: $('back'),
  save: $('save'),
  logout: $('logout'),
};

const state = {
  rows: [],
  updated: null,
  search: '',
  afterLogin: 'list',
  // While the form is open: { isNew, basket, original, photo }
  editing: null,
  saving: false,
  uploading: false,
  inFlight: false,
};

// ---------- password ----------

function storedPassword() {
  try {
    return window.localStorage.getItem(PASSWORD_KEY) || '';
  } catch {
    return '';
  }
}

function storePassword(value) {
  try {
    if (value) window.localStorage.setItem(PASSWORD_KEY, value);
    else window.localStorage.removeItem(PASSWORD_KEY);
  } catch {
    // Storage unavailable. The password lives in memory for this visit only.
    memoryPassword = value;
  }
}
let memoryPassword = '';
function currentPassword() {
  return storedPassword() || memoryPassword;
}

// ---------- screens ----------

function show(name) {
  el.login.hidden = name !== 'login';
  el.list.hidden = name !== 'list';
  el.editor.hidden = name !== 'editor';
  if (name === 'login') el.password.focus();
}

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

function clearError() {
  el.error.hidden = true;
  el.error.textContent = '';
}

// ---------- server ----------

async function post(payload, timeoutMs = FETCH_TIMEOUT_MS) {
  if (demo) return demoPost(payload);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(dataUrl, {
      method: 'POST',
      // text/plain keeps this a "simple" request, so the browser skips the CORS
      // preflight that Apps Script cannot answer. fetch follows the 302 it returns.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return readResponse(await response.text());
  } catch (err) {
    const error = err && err.name === 'AbortError'
      ? 'The server took too long to answer. Try again.'
      : "Couldn't reach the server. Check your connection and try again.";
    return { ok: false, error };
  } finally {
    window.clearTimeout(timeout);
  }
}

// Demo mode: pretend the script answered, using what the page already knows.
function demoPost(payload) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const current = state.rows.find((r) => r.basket === payload.basket);
      const raw = {
        Basket: payload.basket,
        Description: current ? current.description : '',
        'Winning Ticket': current ? current.ticket : '',
        Details: current ? current.details : '',
        'Donated By': current ? current.donatedBy : '',
        Photo: current ? current.photo : '',
      };
      if (payload.action === 'save') Object.assign(raw, payload.fields);
      if (payload.action === 'photo') {
        raw.Photo = `https://picsum.photos/seed/scwny-${encodeURIComponent(payload.basket)}-${Date.now()}/400/300`;
      }
      resolve(readResponse(JSON.stringify({ ok: true, basket: payload.basket, row: raw })));
    }, 400);
  });
}

async function fetchData() {
  if (state.inFlight) return;
  state.inFlight = true;
  el.refresh.disabled = true;
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
    state.updated = new Date();
    clearError();
    renderList();
  } catch (err) {
    const message = err && err.name === 'AbortError'
      ? 'The server took too long to answer. Try again.'
      : `Couldn't load baskets. ${err && err.message ? err.message : ''}`.trim();
    showError(message);
    el.status.textContent = '';
    console.error('Basket list fetch failed:', err);
  } finally {
    window.clearTimeout(timeout);
    state.inFlight = false;
    el.refresh.disabled = false;
  }
}

// ---------- list ----------

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function placeholder() {
  const box = document.createElement('div');
  box.className = 'no-photo';
  box.setAttribute('aria-label', 'No photo');
  return box;
}

function thumbnail(row) {
  const urls = photoUrls(row.photo);
  if (!urls) return placeholder();
  const img = document.createElement('img');
  img.src = urls.thumb;
  img.alt = `Photo of basket ${row.basket}`;
  img.loading = 'lazy';
  // Drive thumbnails can 404 for a minute right after upload; fall back rather than
  // show a broken-image icon.
  img.onerror = () => img.replaceWith(placeholder());
  return img;
}

function renderList() {
  const rows = filterBaskets(state.rows, state.search);
  const updated = state.updated ? ` · Updated ${formatTime(state.updated)}` : '';
  el.status.textContent = `${state.rows.length} basket${state.rows.length === 1 ? '' : 's'}${updated}${demo ? ' · Demo mode' : ''}`;

  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = state.rows.length === 0 ? 'No baskets yet. Tap Add basket to start.' : 'No baskets match your search.';
    el.baskets.replaceChildren(li);
    return;
  }
  el.baskets.replaceChildren(...rows.map(renderListItem));
}

function renderListItem(row) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'basket-row';
  button.appendChild(thumbnail(row));

  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = row.basket;
  button.appendChild(num);

  const desc = document.createElement('span');
  desc.className = 'desc';
  setInline(desc, row.description || '(no description)');
  button.appendChild(desc);

  const ticket = document.createElement('span');
  ticket.className = 'ticket';
  ticket.textContent = row.ticket ? `Ticket ${row.ticket}` : '';
  button.appendChild(ticket);

  button.addEventListener('click', () => openEditor(row));
  li.appendChild(button);
  return li;
}

// ---------- form ----------

function formValues() {
  return {
    basket: el.fBasket.value.trim(),
    description: el.fDescription.value.trim(),
    ticket: el.fTicket.value.trim(),
    details: el.fDetails.value.trim(),
    donatedBy: el.fDonated.value.trim(),
  };
}

function fillForm(form) {
  el.fBasket.value = form.basket;
  el.fDescription.value = form.description;
  el.fTicket.value = form.ticket;
  el.fDetails.value = form.details;
  el.fDonated.value = form.donatedBy;
}

function renderPreview() {
  setInline(el.pDescription, el.fDescription.value);
  setBlocks(el.pDetails, el.fDetails.value);
  el.pDonated.replaceChildren();
  if (el.fDonated.value.trim()) {
    el.pDonated.append('Donated by ');
    const span = document.createElement('span');
    setInline(span, el.fDonated.value);
    el.pDonated.appendChild(span);
  }
}

function renderPhoto() {
  const { isNew, photo, basket } = state.editing;
  el.photoCurrent.replaceChildren(thumbnail({ basket, photo }));
  el.fPhoto.disabled = isNew;
  el.photoButton.classList.toggle('disabled', isNew);
  if (isNew) el.photoStatus.textContent = 'Save the basket first, then add a photo.';
  el.ePhoto.hidden = true;
}

function setFieldError(element, message) {
  element.textContent = message || '';
  element.hidden = !message;
}

function note(text) {
  el.note.textContent = text;
}

function openEditor(row) {
  const isNew = !row;
  state.editing = {
    isNew,
    basket: isNew ? '' : row.basket,
    original: isNew ? emptyForm() : formFromRow(row),
    photo: isNew ? '' : row.photo,
  };
  fillForm(state.editing.original);
  el.fBasket.readOnly = !isNew;
  el.heading.textContent = isNew ? 'Add basket' : `Edit basket ${row.basket}`;
  setFieldError(el.eBasket, '');
  setFieldError(el.eDescription, '');
  setFieldError(el.eSave, '');
  el.eSave.replaceChildren();
  note('');
  el.confirmBar.hidden = true;
  renderPreview();
  el.photoStatus.textContent = '';
  renderPhoto();
  show('editor');
  (isNew ? el.fBasket : el.fDescription).focus();
}

function closeEditor() {
  state.editing = null;
  el.confirmBar.hidden = true;
  show('list');
  if (!demo) fetchData();
}

function applySavedRow(row) {
  state.rows = mergeRow(state.rows, row);
  renderList();
}

function showSaveError(error) {
  el.eSave.replaceChildren();
  el.eSave.append(error);
  if (error === 'Wrong password') {
    el.eSave.append(' ');
    const change = document.createElement('button');
    change.type = 'button';
    change.textContent = 'Change password';
    change.addEventListener('click', () => {
      storePassword('');
      state.afterLogin = 'editor';
      el.password.value = '';
      show('login');
    });
    el.eSave.appendChild(change);
  }
  el.eSave.hidden = false;
}

async function save(event) {
  event.preventDefault();
  if (state.saving || !state.editing) return;
  const form = formValues();
  const errors = validateBasket(form, {
    isNew: state.editing.isNew,
    existing: new Set(state.rows.map((r) => r.basket)),
  });
  setFieldError(el.eBasket, errors.basket);
  setFieldError(el.eDescription, errors.description);
  setFieldError(el.eSave, '');
  if (Object.keys(errors).length > 0) return;

  const fields = changedFields(state.editing.original, form);
  if (Object.keys(fields).length === 0 && !state.editing.isNew) {
    note('Nothing changed.');
    return;
  }

  state.saving = true;
  el.save.disabled = true;
  el.save.textContent = 'Saving…';
  note('');
  const result = await post(buildSavePayload({ password: currentPassword(), basket: form.basket, fields }));
  state.saving = false;
  el.save.disabled = false;
  el.save.textContent = 'Save';

  if (!result.ok) {
    showSaveError(result.error);
    return;
  }
  applySavedRow(result.row);
  state.editing = {
    isNew: false,
    basket: result.row.basket,
    original: formFromRow(result.row),
    photo: result.row.photo,
  };
  fillForm(state.editing.original);
  el.fBasket.readOnly = true;
  el.heading.textContent = `Edit basket ${result.row.basket}`;
  renderPreview();
  el.photoStatus.textContent = '';
  renderPhoto();
  note(demo ? 'Demo mode: nothing was saved.' : 'Saved.');
}

// ---------- photos ----------

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await window.createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers reject the options bag or the format. Fall through to <img>.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/** Re-encode the picture as a JPEG no larger than MAX_PHOTO_EDGE. Returns base64 without the data: prefix. */
async function shrinkImage(file) {
  const source = await loadBitmap(file);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const { width, height } = fitWithin(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  if (typeof source.close === 'function') source.close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function uploadPhoto() {
  const file = el.fPhoto.files && el.fPhoto.files[0];
  el.fPhoto.value = '';
  if (!file || state.uploading || !state.editing || state.editing.isNew) return;

  const basket = state.editing.basket;
  state.uploading = true;
  setFieldError(el.ePhoto, '');
  el.photoStatus.textContent = 'Preparing photo…';

  let data;
  try {
    data = await shrinkImage(file);
  } catch {
    state.uploading = false;
    el.photoStatus.textContent = '';
    setFieldError(el.ePhoto, 'That file is not a picture this browser can read.');
    return;
  }

  el.photoStatus.textContent = 'Uploading photo…';
  const result = await post(buildPhotoPayload({ password: currentPassword(), basket, data }), PHOTO_TIMEOUT_MS);
  state.uploading = false;

  // The editor may have moved on while the upload ran.
  const stillHere = state.editing && state.editing.basket === basket;
  if (!result.ok) {
    if (stillHere) {
      el.photoStatus.textContent = '';
      setFieldError(el.ePhoto, result.error);
    }
    return;
  }
  applySavedRow(result.row);
  if (stillHere) {
    state.editing.photo = result.row.photo;
    renderPhoto();
    el.photoStatus.textContent = demo ? 'Demo mode: nothing was saved.' : 'Photo saved.';
  }
}

// ---------- unsaved changes ----------

function isDirty() {
  if (!state.editing) return false;
  const now = formValues();
  return Object.keys(now).some((key) => now[key] !== state.editing.original[key]);
}

function requestClose() {
  if (isDirty()) {
    el.confirmBar.hidden = false;
    el.discard.focus();
    return;
  }
  closeEditor();
}

// ---------- events ----------

el.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = el.password.value.trim();
  if (!value) return;
  storePassword(value);
  el.password.value = '';
  show(state.afterLogin);
  state.afterLogin = 'list';
});

el.logout.addEventListener('click', (event) => {
  event.preventDefault();
  storePassword('');
  memoryPassword = '';
  state.editing = null;
  state.afterLogin = 'list';
  show('login');
});

el.search.addEventListener('input', () => {
  state.search = el.search.value;
  renderList();
});
el.refresh.addEventListener('click', fetchData);
el.add.addEventListener('click', () => openEditor(null));

for (const input of [el.fDescription, el.fDetails, el.fDonated]) {
  input.addEventListener('input', renderPreview);
}
el.form.addEventListener('submit', save);
el.back.addEventListener('click', requestClose);
el.discard.addEventListener('click', closeEditor);
el.keep.addEventListener('click', () => {
  el.confirmBar.hidden = true;
});
el.fPhoto.addEventListener('change', uploadPhoto);

window.addEventListener('beforeunload', (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});

// ---------- start ----------

show(currentPassword() ? 'list' : 'login');
fetchData();
