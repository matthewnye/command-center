# ⬡ Command Center — Productivity Dashboard PWA

A cross-platform (Windows + iOS) productivity dashboard built as a Progressive Web App. Install it on any device, get push notifications, and track your work across JIRA, Outlook, LinkedIn, and more.

---

## Features

| Widget | Status | Notes |
|---|---|---|
| Daily Tasks + Reminders | ✅ Built-in | Local storage, push notification reminders |
| JIRA Tickets | ✅ Live API | Add credentials in Settings |
| Tempo Time Logging | ✅ Live API | Track time per-ticket, log to Tempo |
| Focus Timer (Pomodoro) | ✅ Built-in | 25/5 cycle, fullscreen focus mode |
| Outlook Email | 🔶 Placeholder | Needs MS Graph OAuth (see below) |
| Outlook Calendar | 🔶 Placeholder | Needs MS Graph OAuth (see below) |
| RescueTime Productivity | ✅ Live API | Add API key in Settings |
| Unicode Text Generator | ✅ Built-in | 12 styles, copy to clipboard |
| Quick Launch (Claude/ChatGPT) | ✅ Built-in | Direct links to new conversations |
| LinkedIn Posts & Ads | 🔶 Placeholder | Needs backend OAuth proxy |
| Voice Notes | ✅ Built-in | Record, play, delete |
| Meeting Notes (Teams/WebEx) | 🔶 Placeholder | Needs API integration |

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open http://localhost:5173
```

---

## Deployment Guide

### Option A: Vercel (Recommended — Free Tier)

Vercel is the easiest path. It auto-detects Vite projects and handles everything.

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USER/command-center.git
   git push -u origin main
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com) and sign in with GitHub
   - Click "New Project" → Import your repo
   - Framework: Vite (auto-detected)
   - Click Deploy
   - Your dashboard is live at `https://command-center-xxx.vercel.app`

3. **Custom Domain (Optional)**
   - In Vercel dashboard → Settings → Domains
   - Add your domain and update DNS as instructed

### Option B: Netlify (Also Free)

1. Push to GitHub (same as above)
2. Go to [netlify.com](https://netlify.com) → "New site from Git"
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

### Option C: GitHub Pages (Free, no backend possible)

1. Install: `npm install --save-dev gh-pages`
2. Add to package.json scripts: `"deploy": "vite build && gh-pages -d dist"`
3. Run: `npm run deploy`

---

## Installing as a PWA

Once deployed, you can install it as an app:

### Windows (Chrome/Edge)
- Visit your deployed URL
- Click the install icon (⊕) in the address bar
- Or: Menu → "Install Command Center"

### iOS (Safari)
- Visit your deployed URL in Safari
- Tap Share → "Add to Home Screen"
- The app will appear on your home screen with an icon

### Android (Chrome)
- Visit your deployed URL
- Tap "Add to Home Screen" banner (or Menu → Install)

---

## Setting Up Integrations

### JIRA + Tempo (Works Immediately)

1. **JIRA API Token**: Go to https://id.atlassian.com/manage-profile/security/api-tokens → Create token
2. **Tempo API Token**: In JIRA → Apps → Tempo → Settings → API Integration → New Token
3. **Account ID**: In JIRA, click your avatar → Profile → The ID is in the URL
4. Open Command Center → Settings ⚙️ → Enter your JIRA host, email, API token, and Tempo token

### RescueTime (Works Immediately)

1. Go to https://www.rescuetime.com/anapi/manage
2. Create a new API key
3. Enter it in Settings → RescueTime → API Key

### Microsoft Graph (Outlook + Teams)

This requires an Azure AD app registration (free with any Microsoft account):

1. Go to https://portal.azure.com → Azure Active Directory → App registrations → New
2. Name: "Command Center", Redirect URI: `https://your-deployed-url.vercel.app/auth/callback`
3. Under API permissions, add:
   - `Mail.Read` (Delegated)
   - `Calendars.Read` (Delegated)
   - `OnlineMeetings.Read` (Delegated)
4. Under Certificates & secrets → New client secret
5. To get tokens, you'll need a small auth flow. Options:
   - **Simple**: Use [Microsoft Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) to get a token, paste into Settings (tokens expire in ~1hr)
   - **Proper**: Add a `/api/auth` serverless function on Vercel that handles the OAuth flow:

```javascript
// api/auth/callback.js (Vercel serverless function)
export default async function handler(req, res) {
  const { code } = req.query;
  const tokenResp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      code,
      redirect_uri: process.env.MS_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const data = await tokenResp.json();
  // Store token securely (encrypted cookie, etc.)
  res.redirect(`/?token=${data.access_token}`);
}
```

### LinkedIn (Requires Backend Proxy)

LinkedIn's API requires server-side OAuth. Two approaches:

**Option 1: Manual tracking** — Just use the placeholder widget and update numbers manually.

**Option 2: Build a proxy** — Create a small server that:
1. Registers a LinkedIn App at https://www.linkedin.com/developers/
2. Handles OAuth 2.0 authorization code flow
3. Exposes endpoints like `/api/linkedin/posts` that the dashboard calls
4. Deploy as Vercel serverless functions alongside the dashboard

### WebEx

1. Create a WebEx integration at https://developer.webex.com/my-apps
2. Get an access token with `meetings:read` scope
3. Enter in Settings → WebEx → Access Token

---

## Notifications

The dashboard uses the Web Notifications API and works on:
- **Windows**: Chrome, Edge, Firefox — full support
- **iOS 16.4+**: Safari — requires the app to be installed as a PWA first
- **Android**: Chrome — full support

To enable:
1. Open Settings ⚙️ → Notifications → "Enable Notifications"
2. Accept the browser permission prompt
3. You'll get notifications for:
   - Task reminders (set per-task)
   - Pomodoro timer completion
   - Time logging confirmations

---

## PWA Icon Generation

The app includes a placeholder SVG favicon. For production, generate proper icons:

1. Create a 512×512 PNG of your logo
2. Save as `public/icon-512.png`
3. Create a 192×192 version as `public/icon-192.png`
4. Or use https://realfavicongenerator.net/ for all sizes

---

## Tech Stack

- **React 18** — UI framework
- **Vite** — Build tool with HMR
- **vite-plugin-pwa** — Service worker + manifest generation
- **Lucide React** — Icon library
- **Web APIs** — Notifications, MediaRecorder (voice notes), Clipboard

---

## Project Structure

```
command-center/
├── index.html              # Entry HTML
├── vite.config.js          # Vite + PWA config
├── package.json
├── public/
│   └── favicon.svg         # App icon
└── src/
    ├── main.jsx            # React mount
    ├── App.jsx             # All widgets + main layout
    ├── styles/
    │   └── globals.css     # Complete design system
    └── utils/
        ├── api.js          # API integrations + mock data
        ├── notifications.js # Push notification helpers
        ├── storage.js      # LocalStorage helpers
        └── unicode.js      # Unicode text transforms
```

---

## Customization

### Adding New Widgets

Create a new function component following the widget pattern:

```jsx
function MyWidget() {
  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Icon className="icon" /> Title</div>
      </div>
      <div className="widget-body">
        {/* Content */}
      </div>
    </div>
  );
}
```

Then add `<MyWidget />` to the dashboard grid in the `App` component.

### Changing the Color Scheme

Edit CSS variables in `src/styles/globals.css` under `:root`. The accent color (`--accent`) flows through the entire design.

---

## License

MIT
