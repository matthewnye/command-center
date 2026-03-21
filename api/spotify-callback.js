export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send('<!DOCTYPE html><html><body style="background:#0a0a0f;color:#e8e8ed;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Waiting for Spotify redirect...</p></body></html>');
  }

  try {
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from('' + process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET + '').toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://command-center-matthew-nyes-projects.vercel.app/api/spotify-callback',
      }).toString(),
    });

    const data = await tokenResp.json();

    if (data.access_token) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`<!DOCTYPE html><html><head><title>Spotify Connected</title>
<style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e8e8ed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{max-width:600px;padding:40px;text-align:center}
  h1{color:#1DB954;margin-bottom:8px}
  .sub{color:#8888a0;margin-bottom:24px}
  .section{text-align:left;margin:20px 0}
  .label{font-size:0.82rem;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px}
  .label .tag{font-size:0.65rem;padding:2px 6px;border-radius:4px;font-weight:500}
  .green{color:#1DB954}.blue{color:#60a5fa}.muted{color:#8888a0}
  .tb{background:#1e1e2e;border:1px solid #333;border-radius:8px;padding:14px;word-break:break-all;font-family:monospace;font-size:0.75rem;max-height:80px;overflow-y:auto;text-align:left;margin-bottom:8px;cursor:pointer;transition:border-color 0.2s}
  .tb:hover{border-color:#1DB954}
  .tb.green-text{color:#6ee7b7}.tb.blue-text{color:#93c5fd}
  .btn{background:#1e1e2e;color:#e8e8ed;border:1px solid #444;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:500;transition:all 0.2s}
  .btn:hover{background:#2a2a3e;border-color:#6ee7b7}
  .btn.copied{background:#1DB954;color:#000;border-color:#1DB954}
  .info{color:#666680;font-size:0.78rem;margin-top:16px;line-height:1.5}
  .divider{border:none;border-top:1px solid #222;margin:20px 0}
</style>
<script>
function copy(id, btnId) {
  navigator.clipboard.writeText(document.getElementById(id).textContent);
  const btn = document.getElementById(btnId);
  btn.textContent = '✓ Copied!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
}
</script>
</head><body><div class="card">
  <h1>✅ Spotify Connected!</h1>
  <div class="sub">Paste both tokens into Command Center → Settings → Spotify</div>

  <div class="section">
    <div class="label green">Access Token <span class="tag" style="background:#1DB95422;color:#1DB954">Required</span></div>
    <div class="tb green-text" id="at" onclick="copy('at','btn1')">${data.access_token}</div>
    <button class="btn" id="btn1" onclick="copy('at','btn1')">Copy</button>
  </div>

  ${data.refresh_token ? `
  <hr class="divider">
  <div class="section">
    <div class="label blue">Refresh Token <span class="tag" style="background:#60a5fa22;color:#60a5fa">Recommended — enables auto-refresh</span></div>
    <div class="tb blue-text" id="rt" onclick="copy('rt','btn2')">${data.refresh_token}</div>
    <button class="btn" id="btn2" onclick="copy('rt','btn2')">Copy</button>
  </div>
  <div class="info">With the refresh token saved, Command Center will automatically get new access tokens when they expire. You won't need to re-authorize again.</div>
  ` : '<div class="info" style="color:#f87171">No refresh token received. Try revoking access at spotify.com/account and re-authorizing.</div>'}

</div></body></html>`);
    } else {
      return res.status(400).json(data);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
