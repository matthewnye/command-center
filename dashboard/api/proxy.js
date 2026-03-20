export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'Method not allowed' });

  const { url, method, headers, body } = req.body || {};
  if (!url) return res.status(200).json({ ok: false, error: 'Missing url' });

  const allowed = ['atlassian.net', 'tempo.io', 'rescuetime.com', 'graph.microsoft.com', 'api.spotify.com'];
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return res.status(200).json({ ok: false, error: 'Invalid URL' }); }
  if (!allowed.some(d => parsedUrl.hostname.endsWith(d))) {
    return res.status(200).json({ ok: false, status: 403, error: 'Domain not allowed: ' + parsedUrl.hostname });
  }

  try {
    const opts = { method: method || 'GET', headers: { 'Accept': 'application/json', ...(headers || {}) } };
    if (method && method !== 'GET' && body) {
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, opts);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    return res.status(200).json({ ok: response.ok, status: response.status, data });
  } catch (err) {
    return res.status(200).json({ ok: false, status: 502, error: err.message });
  }
}
