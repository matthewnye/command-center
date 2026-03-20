export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'Method not allowed' });

  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(200).json({ ok: false, error: 'Missing refresh_token' });

  try {
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from('' + process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET + '').toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
      }).toString(),
    });

    const data = await tokenResp.json();

    if (data.access_token) {
      return res.status(200).json({
        ok: true,
        access_token: data.access_token,
        expires_in: data.expires_in,
        // Spotify sometimes returns a new refresh token
        refresh_token: data.refresh_token || null,
      });
    } else {
      return res.status(200).json({ ok: false, error: data.error_description || 'Token refresh failed' });
    }
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
