import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalHost, resolveDataUrl } from '../raffle/source.js';

const CONFIGURED = 'https://script.google.com/macros/s/CONFIGURED/exec';
const OVERRIDE = 'https://script.google.com/macros/s/OVERRIDE/exec';

test('isLocalHost accepts only exact loopback hostnames', () => {
  assert.equal(isLocalHost('localhost'), true);
  assert.equal(isLocalHost('127.0.0.1'), true);
  assert.equal(isLocalHost('[::1]'), true);
  assert.equal(isLocalHost('www.scwny.org'), false);
  assert.equal(isLocalHost('localhost.evil.example.com'), false);
  assert.equal(isLocalHost('evil.localhost'), false);
  assert.equal(isLocalHost(''), false);
  assert.equal(isLocalHost(undefined), false);
});

test('no parameters yields the configured URL', () => {
  assert.equal(resolveDataUrl({ search: '', hostname: 'www.scwny.org', defaultUrl: CONFIGURED }), CONFIGURED);
  assert.equal(resolveDataUrl({ search: '', hostname: 'www.scwny.org', defaultUrl: '' }), '');
  assert.equal(resolveDataUrl({ search: undefined, hostname: undefined, defaultUrl: undefined }), '');
});

test('demo=1 loads the sample file on any host and beats data=', () => {
  assert.equal(resolveDataUrl({ search: '?demo=1', hostname: 'www.scwny.org', defaultUrl: CONFIGURED }), './sample-data.json');
  assert.equal(resolveDataUrl({ search: `?data=${encodeURIComponent(OVERRIDE)}&demo=1`, hostname: 'localhost', defaultUrl: CONFIGURED }), './sample-data.json');
});

test('data= override is honored only on a local host', () => {
  const search = `?data=${encodeURIComponent(OVERRIDE)}`;
  assert.equal(resolveDataUrl({ search, hostname: 'localhost', defaultUrl: CONFIGURED }), OVERRIDE);
  assert.equal(resolveDataUrl({ search, hostname: '127.0.0.1', defaultUrl: CONFIGURED }), OVERRIDE);
  assert.equal(resolveDataUrl({ search, hostname: '[::1]', defaultUrl: CONFIGURED }), OVERRIDE);
  assert.equal(resolveDataUrl({ search, hostname: 'www.scwny.org', defaultUrl: CONFIGURED }), CONFIGURED);
  assert.equal(resolveDataUrl({ search, hostname: 'localhost.evil.example.com', defaultUrl: CONFIGURED }), CONFIGURED);
});

test('data= override must be an http(s) URL', () => {
  assert.equal(resolveDataUrl({ search: '?data=javascript:alert(1)', hostname: 'localhost', defaultUrl: CONFIGURED }), CONFIGURED);
  assert.equal(resolveDataUrl({ search: '?data=ftp://example.com/x.json', hostname: 'localhost', defaultUrl: CONFIGURED }), CONFIGURED);
  assert.equal(resolveDataUrl({ search: '?data=', hostname: 'localhost', defaultUrl: CONFIGURED }), CONFIGURED);
  assert.equal(resolveDataUrl({ search: '?data=http://example.com/x.json', hostname: 'localhost', defaultUrl: CONFIGURED }), 'http://example.com/x.json');
});

test('resolveDataUrl returns the caller-supplied demo path when one is given', () => {
  const url = resolveDataUrl({
    search: '?demo=1',
    hostname: 'www.scwny.org',
    defaultUrl: 'https://script.google.com/x/exec',
    demoUrl: '../sample-data.json',
  });
  assert.equal(url, '../sample-data.json');
});
