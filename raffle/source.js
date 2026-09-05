// Decides where the page loads results from. Pure: takes strings, returns a string.

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

export function isLocalHost(hostname) {
  return LOCAL_HOSTNAMES.includes(String(hostname ?? ''));
}

/**
 * `?demo=1` always loads the bundled sample file.
 * `?data=<http(s) url>` overrides the configured URL, but only on a local
 * development host, so a shared link cannot make the live site render
 * someone else's data.
 */
export function resolveDataUrl({ search, hostname, defaultUrl }) {
  const params = new URLSearchParams(search ?? '');
  if (params.get('demo') === '1') return './sample-data.json';
  const override = params.get('data');
  if (override && isLocalHost(hostname) && /^https?:\/\//i.test(override)) return override;
  return defaultUrl ?? '';
}
