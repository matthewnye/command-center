import { useState, useEffect, useCallback, useRef } from 'react';
import { Video, RefreshCw, Bell, Eye, Clock, AlertCircle, Shield, Camera, LogIn, Play, Image } from 'lucide-react';
import { getConfig, saveConfig } from '../utils/api';

// ── Ring API via proxy ──

async function ringFetch(path, token, method = 'GET') {
  const resp = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://api.ring.com/clients_api/${path}`,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'android:com.ringapp',
        'Content-Type': 'application/json',
      },
    }),
  });
  return resp.json();
}

async function refreshRingToken(refreshToken) {
  const resp = await fetch('/api/ring-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return resp.json();
}

// ── Format helpers ──

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function eventIcon(kind) {
  if (kind === 'motion') return { icon: Eye, color: '#fbbf24', label: 'Motion' };
  if (kind === 'ding') return { icon: Bell, color: '#60a5fa', label: 'Doorbell' };
  if (kind === 'on_demand') return { icon: Camera, color: '#6ee7b7', label: 'Live View' };
  return { icon: Eye, color: '#8888a0', label: kind || 'Event' };
}

// ── Login Panel ──

function RingLogin({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/ring-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, twoFactorCode: needs2fa ? twoFactorCode : undefined }),
      });
      const data = await resp.json();
      if (data.needs2fa) { setNeeds2fa(true); setLoading(false); return; }
      if (data.ok && data.access_token) { onSuccess(data.access_token, data.refresh_token); }
      else { setError(data.error || 'Login failed'); }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={{ padding: 8 }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <Shield size={24} style={{ color: 'var(--accent)', opacity: 0.5, marginBottom: 4 }} />
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sign in to your Ring account</div>
      </div>
      {error && <div style={{ padding: 6, background: 'rgba(248,113,113,0.1)', borderRadius: 4, fontSize: '0.72rem', color: '#f87171', marginBottom: 8 }}>{error}</div>}
      {!needs2fa ? (
        <>
          <input type="email" placeholder="Ring email" value={email} onChange={e => setEmail(e.target.value)} style={{ marginBottom: 6, fontSize: '0.82rem' }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={{ marginBottom: 8, fontSize: '0.82rem' }} />
        </>
      ) : (
        <>
          <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginBottom: 8, textAlign: 'center' }}>Ring sent a verification code to your phone/email</div>
          <input type="text" placeholder="Enter 2FA code" value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ marginBottom: 8, fontSize: '0.82rem', textAlign: 'center', letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }} autoFocus />
        </>
      )}
      <button className="btn btn-accent btn-sm" style={{ width: '100%', padding: '8px 0' }} onClick={handleLogin} disabled={loading}>
        {loading ? 'Connecting...' : needs2fa ? 'Verify Code' : 'Sign In'}
      </button>
      {needs2fa && <button className="btn btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={() => { setNeeds2fa(false); setTwoFactorCode(''); }}>Back</button>}
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>Credentials sent directly to Ring — never stored.</div>
    </div>
  );
}

// ── Camera Tab Panel ──

function CameraPanel({ device, getToken }) {
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotTime, setSnapshotTime] = useState(null);
  const [events, setEvents] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [view, setView] = useState('camera'); // camera | events
  const intervalRef = useRef(null);

  const batteryColor = (pct) => pct > 60 ? 'var(--accent)' : pct > 20 ? 'var(--warning)' : 'var(--danger)';

  // Request a new snapshot
  const requestSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    const token = await getToken();
    if (!token) { setSnapshotLoading(false); return; }

    // Request new snapshot
    await ringFetch(`doorbots/${device.id}/snapshot`, token, 'POST');

    // Wait a few seconds for it to process, then fetch
    setTimeout(async () => {
      const token2 = await getToken();
      try {
        const resp = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `https://api.ring.com/clients_api/snapshots/image/${device.id}`,
            headers: {
              Authorization: `Bearer ${token2}`,
              'User-Agent': 'android:com.ringapp',
              Accept: 'image/jpeg',
            },
            responseType: 'base64',
          }),
        });
        const result = await resp.json();
        if (result.ok && result.data) {
          // If proxy returns base64 data
          if (typeof result.data === 'string' && result.data.length > 100) {
            setSnapshot(`data:image/jpeg;base64,${result.data}`);
          }
        }
      } catch {}
      setSnapshotTime(new Date());
      setSnapshotLoading(false);
    }, 5000);
  }, [device.id, getToken]);

  // Load event history
  const loadEvents = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const result = await ringFetch(`doorbots/${device.id}/history?limit=15`, token);
    if (result.ok && Array.isArray(result.data)) {
      setEvents(result.data);
    }
  }, [device.id, getToken]);

  // Load video for an event
  const loadEventVideo = async (eventId) => {
    setVideoLoading(true);
    setVideoUrl(null);
    const token = await getToken();
    if (!token) { setVideoLoading(false); return; }

    const result = await ringFetch(`dings/${eventId}/share/play?disable_redirect=true`, token);
    if (result.ok && result.data?.url) {
      setVideoUrl(result.data.url);
    }
    setVideoLoading(false);
  };

  // Initial load
  useEffect(() => {
    loadEvents();
    requestSnapshot();
    // Auto-refresh snapshot every 30s
    intervalRef.current = setInterval(requestSnapshot, 30000);
    return () => clearInterval(intervalRef.current);
  }, [device.id]);

  return (
    <div>
      {/* Device info bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, padding: '5px 8px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.68rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span>{device.description || device.type}</span>
        {device.battery_life != null && <span style={{ color: batteryColor(device.battery_life) }}>🔋 {device.battery_life}%</span>}
        {device.firmware_version && <span>FW {device.firmware_version}</span>}
      </div>

      {/* Sub-tabs */}
      <div className="tab-bar" style={{ marginBottom: 8 }}>
        <button className={view === 'camera' ? 'active' : ''} onClick={() => setView('camera')}>
          <Camera size={11} style={{ verticalAlign: -2, marginRight: 3 }} />Snapshot
        </button>
        <button className={view === 'events' ? 'active' : ''} onClick={() => setView('events')}>
          <Eye size={11} style={{ verticalAlign: -2, marginRight: 3 }} />Events ({events.length})
        </button>
      </div>

      {/* Camera / Snapshot view */}
      {view === 'camera' && (
        <div>
          <div style={{
            position: 'relative', background: '#000', borderRadius: 'var(--radius-md)',
            overflow: 'hidden', marginBottom: 8, aspectRatio: '16/9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {snapshot ? (
              <img src={snapshot} alt="Camera snapshot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center', color: '#555' }}>
                <Camera size={32} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: '0.72rem', marginTop: 4 }}>{snapshotLoading ? 'Requesting snapshot...' : 'No snapshot available'}</div>
              </div>
            )}
            {/* Overlay info */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
              padding: '12px 8px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            }}>
              <span style={{ fontSize: '0.65rem', color: '#ccc' }}>
                {snapshotTime ? `Updated ${snapshotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}
              </span>
              <button onClick={requestSnapshot} disabled={snapshotLoading}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: '#fff', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={10} className={snapshotLoading ? 'spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* Last event video */}
          {videoUrl && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Last Event Recording</div>
              <video src={videoUrl} controls style={{ width: '100%', borderRadius: 'var(--radius-md)', maxHeight: 180, background: '#000' }} />
            </div>
          )}
          {videoLoading && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>Loading recording...</div>}

          {/* Quick play last event */}
          {!videoUrl && !videoLoading && events.length > 0 && (
            <button className="btn btn-sm" style={{ width: '100%', fontSize: '0.72rem' }}
              onClick={() => loadEventVideo(events[0].id)}>
              <Play size={11} /> Play Last Event Recording
            </button>
          )}
        </div>
      )}

      {/* Events view */}
      {view === 'events' && (
        <div>
          {events.map((evt, i) => {
            const { icon: Icon, color, label } = eventIcon(evt.kind);
            return (
              <div key={evt.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
                background: i % 2 === 0 ? 'var(--bg-input)' : 'transparent',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }} onClick={() => { loadEventVideo(evt.id); setView('camera'); }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, background: `${color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    <Clock size={9} style={{ verticalAlign: -1 }} /> {timeAgo(evt.created_at)}
                    {evt.answered && <span style={{ marginLeft: 6, color: 'var(--accent)' }}>✓ Answered</span>}
                    {evt.favorite && <span style={{ marginLeft: 6 }}>⭐</span>}
                  </div>
                </div>
                <Play size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </div>
            );
          })}
          {events.length === 0 && <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.78rem' }}>No recent events</div>}
        </div>
      )}
    </div>
  );
}

// ── Main Widget ──

export default function RingWidget() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const config = getConfig();
  const isConfigured = !!config.ringToken || !!config.ringRefreshToken;

  const getToken = useCallback(async () => {
    let cfg = getConfig();
    let token = cfg.ringToken;
    if (!token && cfg.ringRefreshToken) {
      const data = await refreshRingToken(cfg.ringRefreshToken);
      if (data.ok) {
        token = data.access_token;
        const updated = { ...cfg, ringToken: data.access_token };
        if (data.refresh_token) updated.ringRefreshToken = data.refresh_token;
        saveConfig(updated);
      }
    }
    return token;
  }, []);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { setError('no_token'); setLoading(false); return; }

    let result = await ringFetch('ring_devices', token);

    if (!result.ok) {
      const cfg = getConfig();
      if (cfg.ringRefreshToken) {
        const refreshed = await refreshRingToken(cfg.ringRefreshToken);
        if (refreshed.ok) {
          saveConfig({ ...cfg, ringToken: refreshed.access_token, ringRefreshToken: refreshed.refresh_token || cfg.ringRefreshToken });
          result = await ringFetch('ring_devices', refreshed.access_token);
        }
      }
      if (!result.ok) { setError('auth_failed'); setLoading(false); return; }
    }

    if (result.data) {
      const allDevices = [
        ...(result.data.doorbots || []).map(d => ({ ...d, type: 'doorbell' })),
        ...(result.data.authorized_doorbots || []).map(d => ({ ...d, type: 'doorbell' })),
        ...(result.data.stickup_cams || []).map(d => ({ ...d, type: 'camera' })),
      ];
      const seen = new Set();
      const unique = allDevices.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
      setDevices(unique);
      if (!activeTab && unique.length > 0) setActiveTab(unique[0].id);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, [getToken, activeTab]);

  useEffect(() => { if (isConfigured) loadDevices(); }, []);

  const handleAuth = (accessToken, refreshToken) => {
    const cfg = getConfig();
    saveConfig({ ...cfg, ringToken: accessToken, ringRefreshToken: refreshToken });
    setShowLogin(false);
    setError(null);
    setTimeout(loadDevices, 300);
  };

  const fmtRefresh = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Camera className="icon" /> Ring</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtRefresh(lastRefresh)}</span>}
          {isConfigured && <button className="btn btn-sm" onClick={loadDevices} disabled={loading}><RefreshCw size={12} className={loading ? 'spin' : ''} /></button>}
          {!isConfigured && <button className="btn btn-accent btn-sm" onClick={() => setShowLogin(true)}><LogIn size={12} /> Connect</button>}
        </div>
      </div>
      <div className="widget-body">
        {/* Login */}
        {(showLogin || !isConfigured) && <RingLogin onSuccess={handleAuth} />}

        {/* Auth error */}
        {error === 'auth_failed' && isConfigured && !showLogin && (
          <div style={{ padding: 10, background: 'rgba(251,191,36,0.1)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: '#fbbf24', marginBottom: 8 }}>
            <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Session expired.
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setShowLogin(true)}>Re-connect</button>
          </div>
        )}

        {/* Camera tabs */}
        {isConfigured && !showLogin && devices.length > 0 && (
          <>
            <div className="tab-bar" style={{ marginBottom: 8 }}>
              {devices.map(d => (
                <button key={d.id} className={activeTab === d.id ? 'active' : ''} onClick={() => setActiveTab(d.id)}
                  style={{ fontSize: '0.72rem', padding: '4px 8px' }}>
                  {d.type === 'doorbell' ? '🔔' : '📷'} {d.description || d.type}
                </button>
              ))}
            </div>

            {/* Active camera panel */}
            {devices.filter(d => d.id === activeTab).map(d => (
              <CameraPanel key={d.id} device={d} getToken={getToken} />
            ))}
          </>
        )}

        {isConfigured && !showLogin && devices.length === 0 && !loading && !error && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <Camera size={24} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
            No Ring devices found.
          </div>
        )}

        {loading && devices.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.82rem' }}>Connecting to Ring...</div>
        )}
      </div>
    </div>
  );
}
