export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { email, password, twoFactorCode, refresh_token } = req.body;

  // Refresh flow
  if (refresh_token) {
    try {
      const resp = await fetch('https://oauth.ring.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', '2fa-support': 'true' },
        body: JSON.stringify({
          client_id: 'ring_official_android',
          grant_type: 'refresh_token',
          refresh_token,
          scope: 'client',
        }),
      });
      const data = await resp.json();
      if (data.access_token) {
        return res.status(200).json({ ok: true, access_token: data.access_token, refresh_token: data.refresh_token });
      }
      return res.status(401).json({ ok: false, error: 'Token refresh failed', details: data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Login flow
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required' });
  }

  const body = {
    client_id: 'ring_official_android',
    grant_type: 'password',
    username: email,
    password,
    scope: 'client',
  };

  const headers = {
    'Content-Type': 'application/json',
    '2fa-support': 'true',
    'User-Agent': 'android:com.ringapp',
  };

  // If 2FA code provided, include it
  if (twoFactorCode) {
    headers['2fa-code'] = twoFactorCode;
  }

  try {
    const resp = await fetch('https://oauth.ring.com/oauth/token', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const status = resp.status;

    if (status === 412) {
      // 2FA required - Ring sends a code to the user
      const tsv = resp.headers.get('tsv_state') || '';
      return res.status(200).json({
        ok: false,
        needs2fa: true,
        message: 'Check your phone/email for the 2FA code from Ring',
        tsv_state: tsv,
      });
    }

    const data = await resp.json();

    if (data.access_token) {
      return res.status(200).json({
        ok: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });
    }

    return res.status(status).json({
      ok: false,
      error: data.error_description || data.error || 'Auth failed',
      details: data,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
