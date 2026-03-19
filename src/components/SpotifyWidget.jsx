import { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Volume2, List, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, AlertCircle, Search } from 'lucide-react';
import { getConfig, saveConfig } from '../utils/api';

// ── Spotify API Helpers (via proxy, with auto-refresh) ──

async function refreshSpotifyToken() {
  const config = getConfig();
  if (!config.spotifyRefreshToken) return null;
  try {
    const resp = await fetch('/api/spotify-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: config.spotifyRefreshToken }),
    });
    const data = await resp.json();
    if (data.ok && data.access_token) {
      // Save new access token (and new refresh token if provided)
      const updated = { ...config, spotifyToken: data.access_token };
      if (data.refresh_token) updated.spotifyRefreshToken = data.refresh_token;
      saveConfig(updated);
      console.log('Spotify token auto-refreshed');
      return data.access_token;
    }
  } catch (err) {
    console.error('Spotify refresh failed:', err);
  }
  return null;
}

async function spotifyFetch(endpoint, token, method = 'GET', body = null) {
  const resp = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://api.spotify.com/v1${endpoint}`,
      method,
      headers: { 'Authorization': `Bearer ${token}` },
      ...(body ? { body } : {}),
    }),
  });
  const result = await resp.json();

  // If 401, try refreshing the token and retry once
  if (result.status === 401) {
    const newToken = await refreshSpotifyToken();
    if (newToken) {
      const retry = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://api.spotify.com/v1${endpoint}`,
          method,
          headers: { 'Authorization': `Bearer ${newToken}` },
          ...(body ? { body } : {}),
        }),
      });
      return await retry.json();
    }
  }
  return result;
}

// ── Mock Data ──
const MOCK_PLAYLISTS = [
  { id: '1', name: 'Focus Flow', tracks: 24, image: null },
  { id: '2', name: 'Lo-Fi Beats', tracks: 48, image: null },
  { id: '3', name: 'Deep Work', tracks: 32, image: null },
  { id: '4', name: 'Liked Songs', tracks: 156, image: null },
];

const MOCK_TRACKS = [
  { id: '1', name: 'Weightless', artist: 'Marconi Union', album: 'Weightless', duration: '8:09', isPlaying: false },
  { id: '2', name: 'Electra', artist: 'Airstream', album: 'Electra', duration: '4:52', isPlaying: true },
  { id: '3', name: 'Mellomaniac', artist: 'DJ Shah', album: 'Mellomaniac', duration: '6:31', isPlaying: false },
  { id: '4', name: 'Watermark', artist: 'Enya', album: 'Watermark', duration: '3:47', isPlaying: false },
  { id: '5', name: 'Strawberry Swing', artist: 'Coldplay', album: 'Viva la Vida', duration: '4:09', isPlaying: false },
  { id: '6', name: 'Please Don\'t Go', artist: 'Barcelona', album: 'Absolutes', duration: '4:14', isPlaying: false },
  { id: '7', name: 'Pure Shores', artist: 'All Saints', album: 'Saints & Sinners', duration: '4:24', isPlaying: false },
  { id: '8', name: 'Someone Like You', artist: 'Adele', album: '21', duration: '4:45', isPlaying: false },
];

const MOCK_NOW_PLAYING = { name: 'Electra', artist: 'Airstream', isPlaying: true, progress: 142, duration: 292 };

// ── Spotify Widget ──

export default function SpotifyWidget({ onNowPlaying, onControls }) {
  const [view, setView] = useState('playlists'); // playlists | tracks
  const [playlists, setPlaylists] = useState(MOCK_PLAYLISTS);
  const [tracks, setTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(MOCK_NOW_PLAYING);
  const [isPlaying, setIsPlaying] = useState(true);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [playlistSort, setPlaylistSort] = useState('default'); // default, name, recent
  const isConfigured = !!getConfig().spotifyToken || !!getConfig().spotifyRefreshToken;
  const PAGE_SIZE = 8;

  // Report now playing to parent for marquee
  useEffect(() => {
    onNowPlaying?.(nowPlaying);
  }, [nowPlaying]);

  // Fetch playlists
  const loadPlaylists = useCallback(async () => {
    if (!isConfigured) { setPlaylists(MOCK_PLAYLISTS); return; }
    setLoading(true);
    const result = await spotifyFetch('/me/playlists?limit=20', getConfig().spotifyToken);
    if (result.ok && result.data?.items) {
      setPlaylists(result.data.items.map(p => ({
        id: p.id,
        name: p.name,
        tracks: p.tracks?.total ?? p.tracks ?? 0,
        image: p.images?.[0]?.url || null,
        uri: p.uri || `spotify:playlist:${p.id}`,
        snapshot_id: p.snapshot_id || '',
      })));
      console.log('Playlists loaded:', result.data.items.length, 'first tracks:', result.data.items[0]?.tracks);
    }
    setLoading(false);
  }, [isConfigured]);

  // Fetch tracks for a playlist
  const loadTracks = useCallback(async (playlistId, offset = 0) => {
    if (!isConfigured) { setTracks(MOCK_TRACKS); return; }
    setLoading(true);
    const token = getConfig().spotifyToken;
    
    // Try /playlists/{id}/tracks first
    let result = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=${PAGE_SIZE}&offset=${offset}`, token);
    console.log('Spotify tracks response ok:', result.ok, 'status:', result.status);
    console.log('Spotify tracks data type:', typeof result.data, 'keys:', result.data ? Object.keys(result.data) : 'null');
    
    let parsed = extractTracks(result.data);
    
    // If no tracks, try the full playlist endpoint
    if (parsed.length === 0) {
      console.log('No tracks from /tracks endpoint, trying full playlist...');
      const fullResult = await spotifyFetch(`/playlists/${playlistId}`, token);
      console.log('Full playlist data keys:', fullResult.data ? Object.keys(fullResult.data) : 'null');
      parsed = extractTracks(fullResult.data?.tracks || fullResult.data);
    }
    
    console.log(`Final parsed tracks: ${parsed.length}`);
    setTracks(parsed);
    setLoading(false);
  }, [isConfigured]);

  // Extract tracks from any Spotify response shape
  function extractTracks(data) {
    if (!data) return [];
    
    console.log('extractTracks input type:', typeof data, 'isArray:', Array.isArray(data), 
      'keys:', typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 8) : 'n/a',
      'items type:', typeof data.items, 'items isArray:', Array.isArray(data.items));
    if (data.items && !Array.isArray(data.items)) {
      console.log('items is object with keys:', Object.keys(data.items).slice(0, 8));
    }
    if (Array.isArray(data.items) && data.items[0]) {
      console.log('First item keys:', Object.keys(data.items[0]).slice(0, 8));
    }
    
    function parseItem(raw, i) {
      // Spotify uses different keys: "track" on /tracks endpoint, "item" on full playlist
      const t = raw?.track || raw?.item || raw;
      if (!t || !t.name) return null;
      return {
        id: t.id || `t${i}`,
        name: t.name,
        artist: t.artists?.map(a => a.name).join(', ') || 'Unknown',
        album: t.album?.name || '',
        duration: formatMs(t.duration_ms),
        uri: t.uri || '',
        isPlaying: false,
      };
    }
    
    // Shape 1: { items: [ {track: {...}}, ... ] } — direct array of track wrappers
    if (Array.isArray(data.items) && data.items.length > 0) {
      return data.items.map(parseItem).filter(Boolean);
    }
    
    // Shape 2: { items: { items: [...], limit, offset, ... } } — items is a pagination object
    if (data.items && typeof data.items === 'object' && !Array.isArray(data.items) && Array.isArray(data.items.items)) {
      return data.items.items.map(parseItem).filter(Boolean);
    }
    
    // Shape 3: { tracks: { items: [...] } } or { tracks: { items: { items: [...] } } }
    if (data.tracks) return extractTracks(data.tracks);
    
    // Shape 4: direct array
    if (Array.isArray(data) && data.length > 0) {
      return data.map(parseItem).filter(Boolean);
    }
    
    // Shape 5: pagination object at top level { href, items: [...], limit, next, ... }
    if (data.href && data.limit != null) {
      if (Array.isArray(data.items)) return data.items.map(parseItem).filter(Boolean);
    }
    
    console.warn('Could not extract tracks. Data sample:', JSON.stringify(data).slice(0, 400));
    return [];
  }

  // Fetch now playing
  const loadNowPlaying = useCallback(async () => {
    if (!isConfigured) return;
    const result = await spotifyFetch('/me/player/currently-playing', getConfig().spotifyToken);
    if (result.ok && result.data?.item) {
      const np = {
        name: result.data.item.name,
        artist: result.data.item.artists?.map(a => a.name).join(', '),
        isPlaying: result.data.is_playing,
        progress: Math.round((result.data.progress_ms || 0) / 1000),
        duration: Math.round((result.data.item.duration_ms || 0) / 1000),
      };
      setNowPlaying(np);
      setIsPlaying(result.data.is_playing);
    }
  }, [isConfigured]);

  useEffect(() => { loadPlaylists(); loadNowPlaying(); }, []);

  // Poll now playing every 10s
  useEffect(() => {
    if (!isConfigured) return;
    const interval = setInterval(loadNowPlaying, 10000);
    return () => clearInterval(interval);
  }, [isConfigured, loadNowPlaying]);

  // Simulate progress for demo
  useEffect(() => {
    if (isConfigured || !isPlaying) return;
    const interval = setInterval(() => {
      setNowPlaying(prev => {
        if (!prev) return prev;
        const next = { ...prev, progress: prev.progress + 1 };
        if (next.progress >= next.duration) next.progress = 0;
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isConfigured, isPlaying]);

  // Controls
  const togglePlay = async () => {
    if (isConfigured) {
      await spotifyFetch(`/me/player/${isPlaying ? 'pause' : 'play'}`, getConfig().spotifyToken, 'PUT');
      setIsPlaying(!isPlaying);
    } else {
      setIsPlaying(!isPlaying);
    }
    setNowPlaying(prev => prev ? { ...prev, isPlaying: !isPlaying } : prev);
  };

  const skipNext = async () => {
    if (isConfigured) await spotifyFetch('/me/player/next', getConfig().spotifyToken, 'POST');
    setTimeout(loadNowPlaying, 500);
  };

  const skipPrev = async () => {
    if (isConfigured) await spotifyFetch('/me/player/previous', getConfig().spotifyToken, 'POST');
    setTimeout(loadNowPlaying, 500);
  };

  // Expose controls to header
  useEffect(() => {
    onControls?.({ toggle: togglePlay, next: skipNext, prev: skipPrev });
  }, [isPlaying, isConfigured]);

  const playTrack = async (track) => {
    if (isConfigured && track.uri) {
      // Play from playlist context so the playlist continues after this track
      const body = selectedPlaylist 
        ? { context_uri: `spotify:playlist:${selectedPlaylist.id}`, offset: { uri: track.uri } }
        : { uris: [track.uri] };
      const result = await spotifyFetch('/me/player/play', getConfig().spotifyToken, 'PUT', body);
      if (result.status === 404 || result.status === 403) {
        alert('No active Spotify device found. Open Spotify on your computer or phone first, then try again.');
      } else {
        setTimeout(loadNowPlaying, 500);
      }
    } else {
      setNowPlaying({ name: track.name, artist: track.artist, isPlaying: true, progress: 0, duration: 240 });
      setIsPlaying(true);
    }
  };

  const playPlaylist = async (pl, e) => {
    e.stopPropagation();
    if (isConfigured) {
      const result = await spotifyFetch('/me/player/play', getConfig().spotifyToken, 'PUT', { context_uri: `spotify:playlist:${pl.id}` });
      if (result.status === 404 || result.status === 403) {
        alert('No active Spotify device found. Open Spotify on your computer or phone first, then try again.');
      } else {
        setTimeout(loadNowPlaying, 500);
      }
    }
  };

  const [mainTab, setMainTab] = useState('player'); // player | stats
  const [statsPeriod, setStatsPeriod] = useState('4weeks');
  const [statsView, setStatsView] = useState('tracks'); // tracks | artists
  const [topTracks, setTopTracks] = useState([]);
  const [topArtists, setTopArtists] = useState([]);

  const MOCK_TOP_TRACKS = [
    { name: 'Weightless', artist: 'Marconi Union' },
    { name: 'Electra', artist: 'Airstream' },
    { name: 'Mellomaniac', artist: 'DJ Shah' },
    { name: 'Strawberry Swing', artist: 'Coldplay' },
    { name: 'Pure Shores', artist: 'All Saints' },
  ];

  const MOCK_TOP_ARTISTS = [
    { name: 'Marconi Union', genres: 'Ambient, Chill' },
    { name: 'Coldplay', genres: 'Alt Rock, Pop' },
    { name: 'Adele', genres: 'Pop, Soul' },
    { name: 'The xx', genres: 'Indie Pop' },
    { name: 'M83', genres: 'Shoegaze, Electronic' },
  ];

  const PERIOD_MAP = {
    '4weeks': { label: '4 Weeks', spotifyRange: 'short_term' },
    '6months': { label: '6 Months', spotifyRange: 'medium_term' },
    'alltime': { label: 'All Time', spotifyRange: 'long_term' },
  };

  const loadTopTracks = useCallback(async () => {
    if (!isConfigured) { setTopTracks(MOCK_TOP_TRACKS); return; }
    const range = PERIOD_MAP[statsPeriod]?.spotifyRange || 'short_term';
    const result = await spotifyFetch(`/me/top/tracks?limit=10&time_range=${range}`, getConfig().spotifyToken);
    if (result.ok && result.data?.items) {
      setTopTracks(result.data.items.map(t => ({
        name: t.name,
        artist: t.artists?.map(a => a.name).join(', '),
        popularity: t.popularity || null,
      })));
    } else { setTopTracks([]); console.error('Spotify top tracks failed:', result); }
  }, [isConfigured, statsPeriod]);

  const loadTopArtists = useCallback(async () => {
    if (!isConfigured) { setTopArtists(MOCK_TOP_ARTISTS); return; }
    const range = PERIOD_MAP[statsPeriod]?.spotifyRange || 'short_term';
    const result = await spotifyFetch(`/me/top/artists?limit=10&time_range=${range}`, getConfig().spotifyToken);
    if (result.ok && result.data?.items) {
      setTopArtists(result.data.items.map(a => ({
        name: a.name,
        genres: a.genres?.slice(0, 2).join(', ') || '',
        image: a.images?.[2]?.url || null,
        followers: a.followers?.total || null,
        popularity: a.popularity || null,
      })));
    } else { setTopArtists([]); console.error('Spotify top artists failed:', result); }
  }, [isConfigured, statsPeriod]);

  useEffect(() => { if (mainTab === 'stats') { loadTopTracks(); loadTopArtists(); } }, [mainTab, statsPeriod]);

  const openPlaylist = (pl) => {
    setSelectedPlaylist(pl);
    setView('tracks');
    setPage(0);
    loadTracks(pl.id, 0);
  };

  const changePage = (dir) => {
    const newPage = page + dir;
    if (newPage < 0) return;
    setPage(newPage);
    if (selectedPlaylist) loadTracks(selectedPlaylist.id, newPage * PAGE_SIZE);
  };

  function formatMs(ms) {
    if (!ms) return '0:00';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  function formatSec(s) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  const progressPct = nowPlaying ? (nowPlaying.progress / Math.max(nowPlaying.duration, 1)) * 100 : 0;

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Music className="icon" /> Music {!isConfigured && <span className="badge badge-warning">Demo</span>}</div>
        <button className="btn btn-sm" onClick={() => { loadPlaylists(); loadNowPlaying(); }} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="widget-body">

        {/* Main Tab Bar */}
        <div className="tab-bar" style={{ marginBottom: 10 }}>
          <button className={mainTab === 'player' ? 'active' : ''} onClick={() => setMainTab('player')}>Player</button>
          <button className={mainTab === 'stats' ? 'active' : ''} onClick={() => setMainTab('stats')}>Top Tracks & Artists</button>
        </div>

        {/* Top Tracks / Artists View */}
        {mainTab === 'stats' && (
          <>
            {/* Period selector */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {Object.entries(PERIOD_MAP).map(([key, { label }]) => (
                <button key={key}
                  className={`btn btn-sm ${statsPeriod === key ? 'btn-accent' : ''}`}
                  onClick={() => setStatsPeriod(key)}
                  style={{ padding: '3px 8px', fontSize: '0.68rem' }}
                >{label}</button>
              ))}
            </div>
            {/* Tracks / Artists toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              <button className={`btn btn-sm ${statsView === 'tracks' ? 'btn-accent' : ''}`}
                onClick={() => setStatsView('tracks')} style={{ padding: '3px 10px', fontSize: '0.72rem' }}>Tracks</button>
              <button className={`btn btn-sm ${statsView === 'artists' ? 'btn-accent' : ''}`}
                onClick={() => setStatsView('artists')} style={{ padding: '3px 10px', fontSize: '0.72rem' }}>Artists</button>
            </div>

            {/* Tracks list */}
            {statsView === 'tracks' && (
              <>
                {topTracks.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{
                      fontSize: '0.82rem', fontWeight: 700, color: i < 3 ? '#1DB954' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', minWidth: 22, textAlign: 'right',
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t.artist}</div>
                    </div>
                    {t.popularity != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0, width: 52 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${t.popularity}%`, background: t.popularity >= 70 ? '#1DB954' : t.popularity >= 40 ? 'var(--text-secondary)' : 'var(--text-muted)', borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: t.popularity >= 70 ? '#1DB954' : 'var(--text-muted)', minWidth: 18 }}>{t.popularity}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {topTracks.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {isConfigured ? 'Could not load top tracks. Your token may have expired.' : 'Connect Spotify to see your top tracks.'}
                  </div>
                )}
              </>
            )}

            {/* Artists list */}
            {statsView === 'artists' && (
              <>
                {topArtists.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{
                      fontSize: '0.82rem', fontWeight: 700, color: i < 3 ? '#1DB954' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', minWidth: 22, textAlign: 'right',
                    }}>{i + 1}</span>
                    {a.image ? (
                      <img src={a.image} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #333, #555)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Music size={14} color="var(--text-muted)" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {a.genres}{a.followers ? ` · ${a.followers.toLocaleString()} followers` : ''}
                      </div>
                    </div>
                    {a.popularity != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0, width: 52 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${a.popularity}%`, background: a.popularity >= 70 ? '#1DB954' : a.popularity >= 40 ? 'var(--text-secondary)' : 'var(--text-muted)', borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: a.popularity >= 70 ? '#1DB954' : 'var(--text-muted)', minWidth: 18 }}>{a.popularity}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {topArtists.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {isConfigured ? 'Could not load top artists. Your token may have expired.' : 'Connect Spotify to see your top artists.'}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Player Views */}
        {mainTab === 'player' && <>

        {/* Playlists View */}
        {view === 'playlists' && (
          <>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: 7, color: 'var(--text-muted)' }} />
              <input type="text" placeholder="Search playlists..." value={playlistSearch}
                onChange={e => setPlaylistSearch(e.target.value)}
                style={{ paddingLeft: 28, fontSize: '0.78rem' }} />
            </div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
              {[['default','Recent'],['name','A-Z'],['tracks','Most Tracks']].map(([key, label]) => (
                <button key={key} className={`btn btn-sm ${playlistSort === key ? 'btn-accent' : ''}`}
                  onClick={() => setPlaylistSort(key)} style={{ padding: '2px 7px', fontSize: '0.65rem' }}>{label}</button>
              ))}
            </div>
            {(() => {
              let filtered = playlists.filter(pl => !playlistSearch || pl.name.toLowerCase().includes(playlistSearch.toLowerCase()));
              if (playlistSort === 'name') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
              else if (playlistSort === 'tracks') filtered = [...filtered].sort((a, b) => b.tracks - a.tracks);
              return filtered;
            })().map(pl => (
              <div key={pl.id} onClick={() => openPlaylist(pl)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 4,
                  background: pl.image ? `url(${pl.image}) center/cover` : 'linear-gradient(135deg, #333, #555)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {!pl.image && <List size={14} color="var(--text-muted)" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{pl.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{pl.tracks} tracks</div>
                </div>
                <button onClick={(e) => playPlaylist(pl, e)} style={{
                  width: 28, height: 28, borderRadius: '50%', border: 'none',
                  background: '#1DB954', color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }} title="Play playlist">
                  <Play size={12} style={{ marginLeft: 1 }} />
                </button>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            ))}
            {playlists.length > 0 && (() => {
              let filtered = playlists.filter(pl => !playlistSearch || pl.name.toLowerCase().includes(playlistSearch.toLowerCase()));
              return filtered.length === 0;
            })() && (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>No playlists match "{playlistSearch}"</div>
            )}
          </>
        )}

        {/* Tracks View */}
        {view === 'tracks' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <button onClick={() => setView('playlists')} style={{
                background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontSize: '0.78rem', padding: 0, fontWeight: 500,
              }}>Playlists</button>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{selectedPlaylist?.name}</span>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading...</div>
            ) : (
              tracks.map((t, i) => (
                <div key={t.id || i} onClick={() => playTrack(t)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                  opacity: t.isPlaying ? 1 : 0.85,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 20, textAlign: 'right' }}>
                    {page * PAGE_SIZE + i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {t.artist}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.duration}</span>
                </div>
              ))
            )}
            {!loading && tracks.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--warning)', fontSize: '0.82rem' }}>
                No tracks loaded. Check browser console (F12) for details.
              </div>
            )}
            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => changePage(-1)} disabled={page === 0} style={{ fontSize: '0.72rem' }}>
                <ChevronLeft size={12} /> Prev
              </button>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Page {page + 1}
              </span>
              <button className="btn btn-sm" onClick={() => changePage(1)} disabled={tracks.length < PAGE_SIZE} style={{ fontSize: '0.72rem' }}>
                Next <ChevronRight size={12} />
              </button>
            </div>
          </>
        )}

        </>}

        {!isConfigured && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--accent)' }}>
            <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Add a Spotify access token in Settings to control your music.
            Get one at <a href="https://developer.spotify.com/console/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>developer.spotify.com</a>
          </div>
        )}
      </div>
    </div>
  );
}
