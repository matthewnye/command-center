import { useState, useEffect, useCallback } from 'react';
import { Video, RefreshCw, Bell, Eye, Clock, AlertCircle, Shield, Camera, LogIn, X } from 'lucide-react';
import { getConfig, saveConfig } from '../utils/api';

// ── Ring API via proxy ──

async function ringFetch(path, token) {
  const resp = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://api.ring.com/clients_api/${path}`,
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

      if (data.needs2fa) {
        setNeeds2fa(true);
        setError('');
        setLoading(false);
        return;
      }

      if (data.ok && data.access_token) {
        onSuccess(data.access_token, data.refresh_token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 8 }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <Shield size={24} style={{ color: 'var(--accent)', opacity: 0.5, marginBottom: 4 }} />
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sign in to your Ring account</div>
      </div>
      {error && <div style={{ padding: 6, background: 'var(--danger-dim, rgba(248,113,113,0.1))', borderRadius: 4, fontSize: '0.72rem', color: 'var(--danger, #f87171)', marginBottom: 8 }}>{error}</div>}

      {!needs2fa ? (
        <>
          <input type="email" placeholder="Ring email" value={email} onChange={e => setEmail(e.target.value)}
            style={{ marginBottom: 6, fontSize: '0.82rem' }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ marginBottom: 8, fontSize: '0.82rem' }} />
        </>
      ) : (
        <>
          <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginBottom: 8, textAlign: 'center' }}>
            Ring sent a verification code to your phone/email
          </div>
          <input type="text" placeholder="Enter 2FA code" value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ marginBottom: 8, fontSize: '0.82rem', textAlign: 'center', letterSpacing: '0.2em', fontFamily: 'var(--font-mono)' }}
            autoFocus />
        </>
      )}

      <button className="btn btn-accent btn-sm" style={{ width: '100%', padding: '8px 0' }}
        onClick={handleLogin} disabled={loading}>
        {loading ? 'Connecting...' : needs2fa ? 'Verify Code' : 'Sign In'}
      </button>
      {needs2fa && (
        <button className="btn btn-sm" style={{ width: '100%', marginTop: 4, padding: '6px 0' }}
          onClick={() => { setNeeds2fa(false); setTwoFactorCode(''); }}>Back</button>
      )}
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
        Your credentials are sent directly to Ring's servers and are not stored.
      </div>
    </div>
  );
}

// ── Main Widget ──

export default function RingWidget() {
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const config = getConfig();
  const isConfigured = !!config.ringToken || !!config.ringRefreshToken;

  const getToken = useCallback(async () => {
    let cfg = getConfig();
    let token = cfg.ringToken;
    // Try refresh if no access token
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

    const result = await ringFetch('ring_devices', token);

    if (!result.ok) {
      // Try token refresh
      const cfg = getConfig();
      if (cfg.ringRefreshToken) {
        const refreshed = await refreshRingToken(cfg.ringRefreshToken);
        if (refreshed.ok) {
          saveConfig({ ...cfg, ringToken: refreshed.access_token, ringRefreshToken: refreshed.refresh_token || cfg.ringRefreshToken });
          const retry = await ringFetch('ring_devices', refreshed.access_token);
          if (retry.ok) {
            processDevices(retry.data);
            setLastRefresh(new Date());
            setLoading(false);
            return;
          }
        }
      }
      setError('auth_failed');
      setLoading(false);
      return;
    }

    processDevices(result.data);
    setLastRefresh(new Date());
    setLoading(false);
  }, [getToken]);

  const processDevices = (data) => {
    if (!data) { setDevices([]); return; }
    const allDevices = [
      ...(data.doorbots || []).map(d => ({ ...d, type: 'doorbell' })),
      ...(data.authorized_doorbots || []).map(d => ({ ...d, type: 'doorbell' })),
      ...(data.stickup_cams || []).map(d => ({ ...d, type: 'camera' })),
      ...(data.chimes || []).map(d => ({ ...d, type: 'chime' })),
    ];
    // Dedupe by id
    const seen = new Set();
    const unique = allDevices.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
    setDevices(unique);
    // Auto-select first if none selected
    if (!selectedDevice && unique.length > 0) {
      setSelectedDevice(unique[0].id);
      loadHistory(unique[0].id);
    }
  };

  const loadHistory = async (deviceId) => {
    const token = await getToken();
    if (!token) return;
    const result = await ringFetch(`doorbots/${deviceId}/history?limit=20`, token);
    if (result.ok && Array.isArray(result.data)) {
      setEvents(result.data);
    }
  };

  useEffect(() => {
    if (isConfigured) loadDevices();
  }, []);

  const handleAuth = (accessToken, refreshToken) => {
    const cfg = getConfig();
    saveConfig({ ...cfg, ringToken: accessToken, ringRefreshToken: refreshToken });
    setShowLogin(false);
    setError(null);
    // Reload with new token
    setTimeout(loadDevices, 300);
  };

  const selectDevice = (id) => {
    setSelectedDevice(id);
    loadHistory(id);
  };

  const fmtRefresh = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const batteryColor = (pct) => pct > 60 ? 'var(--accent)' : pct > 20 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Camera className="icon" /> Ring</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtRefresh(lastRefresh)}</span>}
          {isConfigured && (
            <button className="btn btn-sm" onClick={loadDevices} disabled={loading}>
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
            </button>
          )}
          {!isConfigured && (
            <button className="btn btn-accent btn-sm" onClick={() => setShowLogin(true)}>
              <LogIn size={12} /> Connect
            </button>
          )}
        </div>
      </div>
      <div className="widget-body">
        {/* Login panel */}
        {(showLogin || (!isConfigured && !showLogin)) && (
          <RingLogin onSuccess={handleAuth} />
        )}

        {/* Auth error */}
        {error === 'auth_failed' && isConfigured && (
          <div style={{ padding: 10, background: 'var(--warning-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--warning)', marginBottom: 8 }}>
            <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Session expired.
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setShowLogin(true)}>Re-connect</button>
          </div>
        )}

        {/* Device list */}
        {isConfigured && !showLogin && devices.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {devices.filter(d => d.type !== 'chime').map(d => (
                <button key={d.id}
                  className={`btn btn-sm ${selectedDevice === d.id ? 'btn-accent' : ''}`}
                  onClick={() => selectDevice(d.id)}
                  style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                  {d.type === 'doorbell' ? '🔔' : '📷'} {d.description || d.type}
                  {d.battery_life != null && (
                    <span style={{ marginLeft: 4, fontSize: '0.6rem', color: batteryColor(d.battery_life) }}>
                      {d.battery_life}%
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Device info */}
            {(() => {
              const dev = devices.find(d => d.id === selectedDevice);
              if (!dev) return null;
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, padding: '6px 8px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>{dev.description || dev.type}</span>
                  {dev.firmware_version && <span>FW: {dev.firmware_version}</span>}
                  {dev.battery_life != null && <span style={{ color: batteryColor(dev.battery_life) }}>🔋 {dev.battery_life}%</span>}
                  {dev.address && <span>📍 {dev.address}</span>}
                </div>
              );
            })()}

            {/* Event history */}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              Recent Events ({events.length})
            </div>
            {events.map((evt, i) => {
              const { icon: Icon, color, label } = eventIcon(evt.kind);
              return (
                <div key={evt.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
                  background: i % 2 === 0 ? 'var(--bg-input)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                }}>
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
                  {evt.duration && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {evt.duration}s
                    </span>
                  )}
                </div>
              );
            })}
            {events.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.78rem' }}>No recent events</div>
            )}
          </>
        )}

        {/* No devices */}
        {isConfigured && !showLogin && devices.length === 0 && !loading && !error && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <Camera size={24} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
            No Ring devices found on this account.
          </div>
        )}

        {loading && devices.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Connecting to Ring...
          </div>
        )}
      </div>
    </div>
  );
}
