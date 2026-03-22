import { useState, useEffect } from 'react';
import { Video, RefreshCw, ExternalLink, Play, Clock, AlertCircle, Search, FileVideo } from 'lucide-react';
import { getConfig, saveConfig } from '../utils/api';

// ── MS Graph fetch with auto-refresh ──

async function graphFetch(url, config) {
  const proxyCall = async (token) => {
    const resp = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }),
    });
    return resp.json();
  };

  let result = await proxyCall(config.msGraphToken);
  if (!result.ok && result.status === 401 && config.msGraphRefreshToken) {
    // Auto-refresh token
    try {
      const refreshResp = await fetch('/api/ms-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: config.msGraphRefreshToken }),
      });
      const refreshData = await refreshResp.json();
      if (refreshData.access_token) {
        const updated = { ...config, msGraphToken: refreshData.access_token };
        if (refreshData.refresh_token) updated.msGraphRefreshToken = refreshData.refresh_token;
        saveConfig(updated);
        result = await proxyCall(refreshData.access_token);
      }
    } catch {}
  }
  return result;
}

// ── Format helpers ──

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return 'Today ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff < 172800000) return 'Yesterday ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function cleanRecordingName(name) {
  if (!name) return 'Recording';
  // Remove file extension
  let clean = name.replace(/\.(mp4|webm|mkv)$/i, '');
  // Remove common Teams prefixes
  clean = clean.replace(/^Recording[-_ ]+/i, '');
  // Remove date/time stamps like "20240315_143022"
  clean = clean.replace(/[-_ ]\d{8}[-_]\d{6}$/, '');
  // If nothing meaningful left, use original without extension
  if (clean.length < 3) clean = name.replace(/\.(mp4|webm|mkv)$/i, '');
  return clean;
}

// ── Component ──

export default function TeamsRecordingsWidget() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const config = getConfig();
  const isConfigured = !!config.msGraphToken || !!config.msGraphRefreshToken;

  useEffect(() => { if (isConfigured) loadRecordings(); }, []);

  const loadRecordings = async () => {
    setLoading(true);
    setError(null);
    const cfg = getConfig();

    // Try multiple paths where Teams stores recordings
    const paths = [
      // Standard OneDrive Recordings folder
      'https://graph.microsoft.com/v1.0/me/drive/root:/Recordings:/children?$orderby=lastModifiedDateTime desc&$top=30&$select=id,name,size,createdDateTime,lastModifiedDateTime,webUrl,file',
      // Search for video files across OneDrive
      "https://graph.microsoft.com/v1.0/me/drive/root/search(q='.mp4')?$orderby=lastModifiedDateTime desc&$top=30&$select=id,name,size,createdDateTime,lastModifiedDateTime,webUrl,file,parentReference",
    ];

    let items = [];
    for (const url of paths) {
      const result = await graphFetch(url, cfg);
      if (result.ok && result.data?.value?.length > 0) {
        items = result.data.value;
        break;
      }
    }

    if (items.length > 0) {
      // Filter to video files only
      const videos = items.filter(f =>
        f.name?.match(/\.(mp4|webm|mkv)$/i) ||
        f.file?.mimeType?.startsWith('video/')
      );
      setRecordings(videos.map(f => ({
        id: f.id,
        name: cleanRecordingName(f.name),
        rawName: f.name,
        size: f.size,
        created: f.createdDateTime,
        modified: f.lastModifiedDateTime,
        url: f.webUrl,
        folder: f.parentReference?.name || '',
      })));
    } else {
      setRecordings([]);
      // Check if it's a permissions issue
      const testResult = await graphFetch('https://graph.microsoft.com/v1.0/me/drive/root', cfg);
      if (!testResult.ok) {
        setError('permissions');
      } else {
        setError('empty');
      }
    }

    setLastRefresh(new Date());
    setLoading(false);
  };

  const filtered = search
    ? recordings.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.rawName.toLowerCase().includes(search.toLowerCase()))
    : recordings;

  const fmtRefresh = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Video className="icon" /> Teams Recordings</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtRefresh(lastRefresh)}</span>}
          <button className="btn btn-sm" onClick={loadRecordings} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="widget-body">
        {!isConfigured && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <Video size={24} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
            Connect Microsoft Graph in the Marketplace to view your Teams recordings.
          </div>
        )}

        {isConfigured && error === 'permissions' && (
          <div style={{ padding: 12, background: 'var(--warning-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--warning)' }}>
            <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Need additional permissions. Re-authorize Microsoft with Files.Read scope in the Marketplace.
          </div>
        )}

        {isConfigured && error === 'empty' && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <FileVideo size={24} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
            No recordings found in your OneDrive Recordings folder.
          </div>
        )}

        {isConfigured && recordings.length > 0 && (
          <>
            {recordings.length > 5 && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-muted)' }} />
                <input type="text" placeholder="Search recordings..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ paddingLeft: 28, fontSize: '0.78rem', padding: '5px 8px 5px 28px' }} />
              </div>
            )}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
            </div>
            {filtered.map(r => (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)',
                  marginBottom: 4, textDecoration: 'none', color: 'inherit',
                  transition: 'background 0.15s', cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-input)'}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: 'linear-gradient(135deg, #7b83eb, #5b5fc7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Play size={14} style={{ color: 'white', marginLeft: 1 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                    <span><Clock size={9} style={{ verticalAlign: -1 }} /> {formatDate(r.modified || r.created)}</span>
                    <span>{formatSize(r.size)}</span>
                    {r.folder && r.folder !== 'Recordings' && <span style={{ opacity: 0.6 }}>📁 {r.folder}</span>}
                  </div>
                </div>
                <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </a>
            ))}
            {filtered.length === 0 && search && (
              <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: '0.78rem' }}>No recordings match "{search}"</div>
            )}
          </>
        )}

        {loading && recordings.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Loading recordings...
          </div>
        )}
      </div>
    </div>
  );
}
