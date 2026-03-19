export default async function handler(req, res) {
  const { code } = req.query;

  // Client credentials for Command Center Azure app
  const CLIENT_ID = process.env.MS_CLIENT_ID;
  const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
  const TENANT_ID = process.env.MS_TENANT_ID;
  const REDIRECT_URI = 'https://command-center-matthew-nyes-projects.vercel.app/api/ms-callback';

  if (!code) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send('<html><body style="background:#0a0a0f;color:#e8e8ed;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Waiting for Microsoft redirect...</p></body></html>');
  }

  try {
    const tokenResp = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        scope: 'Mail.Read Calendars.Read User.Read offline_access',
      }).toString(),
    });

    const data = await tokenResp.json();

    if (data.access_token) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`<!DOCTYPE html><html><head><title>Microsoft Connected</title>
<style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e8e8ed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{max-width:600px;padding:40px;text-align:center}
  h1{color:#0078d4;margin-bottom:8px}
  .sub{color:#8888a0;margin-bottom:24px}
  .section{text-align:left;margin:20px 0}
  .label{font-size:.82rem;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px}
  .tag{font-size:.65rem;padding:2px 6px;border-radius:4px;font-weight:500}
  .tb{background:#1e1e2e;border:1px solid #333;border-radius:8px;padding:14px;word-break:break-all;font-family:monospace;font-size:.75rem;max-height:80px;overflow-y:auto;text-align:left;margin:8px 0;cursor:pointer;transition:border-color .2s}
  .tb:hover{border-color:#0078d4}
  .btn{background:#1e1e2e;color:#e8e8ed;border:1px solid #444;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:.78rem}
  .btn:hover{border-color:#0078d4}
  .btn.copied{background:#0078d4;color:#fff;border-color:#0078d4}
  .info{color:#666680;font-size:.78rem;margin-top:16px;line-height:1.5}
  hr{border:none;border-top:1px solid #222;margin:20px 0}
</style>
<script>
function c(id,b){navigator.clipboard.writeText(document.getElementById(id).textContent);var e=document.getElementById(b);e.textContent='Copied!';e.classList.add('copied');setTimeout(function(){e.textContent='Copy';e.classList.remove('copied')},2000)}
</script></head><body><div class="card">
  <h1>Microsoft Connected!</h1>
  <div class="sub">Paste both tokens into Command Center → Settings → Microsoft Graph</div>
  <div class="section">
    <div class="label" style="color:#0078d4">Access Token <span class="tag" style="background:#0078d422;color:#0078d4">Required</span></div>
    <div class="tb" style="color:#60a5fa" id="at" onclick="c('at','b1')">${data.access_token}</div>
    <button class="btn" id="b1" onclick="c('at','b1')">Copy</button>
  </div>
  ${data.refresh_token ? `<hr>
  <div class="section">
    <div class="label" style="color:#6ee7b7">Refresh Token <span class="tag" style="background:#6ee7b722;color:#6ee7b7">Enables auto-refresh</span></div>
    <div class="tb" style="color:#6ee7b7" id="rt" onclick="c('rt','b2')">${data.refresh_token}</div>
    <button class="btn" id="b2" onclick="c('rt','b2')">Copy</button>
  </div>
  <div class="info">With the refresh token, Command Center will automatically get new access tokens. You won't need to re-authorize.</div>` : '<div class="info" style="color:#f87171">No refresh token received. Make sure offline_access scope is included.</div>'}
</div></body></html>`);
    } else {
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send(`<html><body style="background:#0a0a0f;color:#f87171;font-family:monospace;padding:40px"><h2>Token Exchange Failed</h2><pre style="background:#1e1e2e;padding:16px;border-radius:8px;overflow:auto;color:#fbbf24">${JSON.stringify(data, null, 2)}</pre></body></html>`);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
