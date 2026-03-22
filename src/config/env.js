// ── Environment Configuration ──
// Single source of truth for all OAuth, API, and deployment settings.
// Change these when moving to a new domain or swapping credentials.
// Server-side secrets (client_secret) are in Vercel Environment Variables, not here.

const ENV = {
  // Deployment
  BASE_URL: 'https://command-center-matthew-nyes-projects.vercel.app',

  // Spotify OAuth (public client ID — safe in frontend)
  SPOTIFY_CLIENT_ID: '70b2166f84e848da990042db762796bf',
  SPOTIFY_SCOPES: 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-top-read',

  // Microsoft Graph OAuth (public client ID — safe in frontend)
  MS_CLIENT_ID: 'b893ab07-78ef-434f-b5b3-a22b1fd471cb',
  MS_TENANT_ID: '441cb3eb-b496-45de-8460-c359a63b5805',
  MS_SCOPES: 'Mail.Read Calendars.Read User.Read Files.Read OnlineMeetings.Read offline_access',
};

// Computed URLs
ENV.SPOTIFY_AUTH_URL = `https://accounts.spotify.com/authorize?client_id=${ENV.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(ENV.BASE_URL + '/api/spotify-callback')}&scope=${encodeURIComponent(ENV.SPOTIFY_SCOPES)}`;

ENV.MS_AUTH_URL = `https://login.microsoftonline.com/${ENV.MS_TENANT_ID}/oauth2/v2.0/authorize?client_id=${ENV.MS_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(ENV.BASE_URL + '/api/ms-callback')}&scope=${encodeURIComponent(ENV.MS_SCOPES)}`;

ENV.SPOTIFY_REDIRECT_URI = `${ENV.BASE_URL}/api/spotify-callback`;
ENV.MS_REDIRECT_URI = `${ENV.BASE_URL}/api/ms-callback`;

export default ENV;
