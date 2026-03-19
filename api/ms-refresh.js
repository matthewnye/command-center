export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'Method not allowed' });

  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(200).json({ ok: false, error: 'Missing refresh_token' });

  const CLIENT_ID = process.env.MS_CLIENT_ID;
  const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
  const TENANT_ID = process.env.MS_TENANT_ID;

  try {
    const tokenResp = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token,
        scope: 'Mail.Read Calendars.Read User.Read offline_access',
      }).toString(),
    });

    const data = await tokenResp.json();

    if (data.access_token) {
      return res.status(200).json({
        ok: true,
        access_token: data.access_token,
        expires_in: data.expires_in,
        refresh_token: data.refresh_token || null,
      });
    } else {
      return res.status(200).json({ ok: false, error: data.error_description || 'Token refresh failed' });
    }
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
