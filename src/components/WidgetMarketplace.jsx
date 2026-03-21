import { useState, useMemo } from 'react';
import { Search, Check, X, ChevronDown, ChevronRight, ExternalLink, Zap, Settings } from 'lucide-react';
import WIDGET_REGISTRY, { CATEGORIES } from '../widgets/registry';
import { getConfig, saveConfig } from '../utils/api';
import ENV from '../config/env';

function loadEnabledWidgets() {
  try {
    const saved = JSON.parse(localStorage.getItem('cmd_widget_visibility'));
    if (Array.isArray(saved)) return saved;
  } catch {}
  return WIDGET_REGISTRY.map(w => w.id);
}

function saveEnabledWidgets(ids) {
  localStorage.setItem('cmd_widget_visibility', JSON.stringify(ids));
}

// ── Connection status checker ──

function getConnectionStatus(widget, config) {
  if (!widget.requires || widget.requires.length === 0) return 'no-auth';
  if (widget.status === 'coming-soon') return 'coming-soon';
  const allPresent = widget.requires.every(key => !!config[key]);
  return allPresent ? 'connected' : 'not-connected';
}

const STATUS_LABELS = {
  'connected': { label: 'Connected', color: '#6ee7b7', bg: '#6ee7b711' },
  'not-connected': { label: 'Not Connected', color: '#f87171', bg: '#f8717111' },
  'no-auth': { label: 'Ready', color: '#60a5fa', bg: '#60a5fa11' },
  'coming-soon': { label: 'Coming Soon', color: '#8888a0', bg: '#8888a011' },
};

// ── Auth help links ──

function getAuthAction(widget) {
  const id = widget.id;
  if (id === 'spotify') return { label: 'Connect Spotify', url: ENV.SPOTIFY_AUTH_URL };
  if (id === 'outlook' || id === 'pinned' || id === 'teams-recordings') return { label: 'Connect Microsoft', url: ENV.MS_AUTH_URL };
  if (id === 'heartbeat' || id === 'rescuetime') return { label: 'Get API Key', url: 'https://www.rescuetime.com/anapi/manage' };
  if (id === 'jira') return { label: 'Get JIRA Token', url: 'https://id.atlassian.com/manage-profile/security/api-tokens' };
  if (id === 'stocks') return { label: 'Get Free API Key', url: 'https://finnhub.io/register' };
  return null;
}

// ── Config field definitions per widget ──

const CONFIG_FIELDS = {
  heartbeat: [
    { key: 'rescueTimeKey', label: 'RescueTime API Key', type: 'password', placeholder: 'Your RescueTime API key' },
  ],
  rescuetime: [
    { key: 'rescueTimeKey', label: 'RescueTime API Key', type: 'password', placeholder: 'Your RescueTime API key' },
  ],
  jira: [
    { key: 'jiraHost', label: 'JIRA Host', type: 'text', placeholder: 'yourcompany.atlassian.net' },
    { key: 'jiraEmail', label: 'Email', type: 'text', placeholder: 'you@company.com' },
    { key: 'jiraToken', label: 'API Token', type: 'password', placeholder: 'Atlassian API token' },
    { key: 'jiraAccountId', label: 'Account ID (for Tempo)', type: 'text', placeholder: 'Atlassian Account ID' },
    { key: 'tempoToken', label: 'Tempo API Token', type: 'password', placeholder: 'Tempo API token (optional)' },
  ],
  outlook: [
    { key: 'msGraphToken', label: 'Access Token', type: 'password', placeholder: 'MS Graph access token' },
    { key: 'msGraphRefreshToken', label: 'Refresh Token', type: 'password', placeholder: 'MS Graph refresh token' },
  ],
  pinned: [
    { key: 'msGraphToken', label: 'Access Token', type: 'password', placeholder: 'MS Graph access token' },
    { key: 'msGraphRefreshToken', label: 'Refresh Token', type: 'password', placeholder: 'MS Graph refresh token' },
  ],
  spotify: [
    { key: 'spotifyToken', label: 'Access Token', type: 'password', placeholder: 'Spotify access token' },
    { key: 'spotifyRefreshToken', label: 'Refresh Token', type: 'password', placeholder: 'Spotify refresh token' },
  ],
  stocks: [
    { key: 'finnhubKey', label: 'Finnhub API Key', type: 'password', placeholder: 'Free API key from finnhub.io' },
  ],
};

// ── Marketplace Component ──

export default function WidgetMarketplace({ onClose }) {
  const [config, setConfig] = useState(getConfig);
  const [enabled, setEnabled] = useState(loadEnabledWidgets);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [saved, setSaved] = useState(null); // widget id that was just saved

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const toggleEnabled = (id) => {
    setEnabled(prev => {
      const next = prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id];
      saveEnabledWidgets(next);
      return next;
    });
  };

  const saveWidgetConfig = (widgetId) => {
    saveConfig(config);
    setSaved(widgetId);
    setTimeout(() => setSaved(null), 2000);
  };

  const filtered = useMemo(() => {
    return WIDGET_REGISTRY.filter(w => {
      if (categoryFilter !== 'all' && w.category !== categoryFilter) return false;
      if (search && !w.label.toLowerCase().includes(search.toLowerCase()) && !w.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [search, categoryFilter]);

  const connectedCount = WIDGET_REGISTRY.filter(w => getConnectionStatus(w, config) === 'connected').length;
  const enabledCount = enabled.length;

  return (
    <div className="settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel" style={{ maxWidth: 700, width: '95vw' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Widget Marketplace</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {enabledCount} widgets active · {connectedCount} connected
            </div>
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Search + Category Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Search widgets..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, fontSize: '0.82rem' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${categoryFilter === 'all' ? 'btn-accent' : ''}`}
            onClick={() => setCategoryFilter('all')} style={{ fontSize: '0.7rem', padding: '3px 10px' }}>All</button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button key={key} className={`btn btn-sm ${categoryFilter === key ? 'btn-accent' : ''}`}
              onClick={() => setCategoryFilter(key)} style={{ fontSize: '0.7rem', padding: '3px 10px' }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Widget Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
          {filtered.map(widget => {
            const status = getConnectionStatus(widget, config);
            const statusInfo = STATUS_LABELS[status];
            const isEnabled = enabled.includes(widget.id);
            const isExpanded = expandedId === widget.id;
            const fields = CONFIG_FIELDS[widget.id] || [];
            const authAction = getAuthAction(widget);
            const cat = CATEGORIES[widget.category];

            return (
              <div key={widget.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isExpanded ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>
                {/* Card Header */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                  cursor: 'pointer',
                }} onClick={() => setExpandedId(isExpanded ? null : widget.id)}>
                  {/* Icon */}
                  <div style={{
                    minWidth: 44, width: 44, height: 44, borderRadius: 10,
                    background: `${cat?.color || '#666'}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.4rem', flexShrink: 0, overflow: 'visible',
                  }}>{widget.icon}</div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>{widget.label}</span>
                      {cat && <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: `${cat.color}15`, color: cat.color, whiteSpace: 'nowrap' }}>{cat.label}</span>}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>{widget.description}</div>
                  </div>

                  {/* Status + Toggle — stacked, right-aligned */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, paddingTop: 2, minWidth: 100 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 500, padding: '2px 8px', borderRadius: 4,
                        background: statusInfo.bg, color: statusInfo.color, whiteSpace: 'nowrap',
                      }}>{statusInfo.label}</span>
                      {isExpanded ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
                    </div>

                    {/* Enable/Disable toggle */}
                    <button onClick={(e) => { e.stopPropagation(); toggleEnabled(widget.id); }}
                      style={{
                        width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: isEnabled ? 'var(--accent)' : 'var(--bg-elevated)',
                        position: 'relative', transition: 'background 0.2s',
                      }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: 2,
                        left: isEnabled ? 20 : 2, transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }} />
                    </button>
                  </div>
                </div>

                {/* Expanded Config Panel */}
                {isExpanded && (
                  <div style={{
                    padding: '0 16px 16px',
                    borderTop: '1px solid var(--border-subtle)',
                    marginTop: 0,
                  }}>
                    {/* Auth action link */}
                    {authAction && status !== 'connected' && (
                      <a href={authAction.url} target="_blank" rel="noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600,
                          textDecoration: 'none', padding: '8px 0',
                        }}>
                        <Zap size={12} /> {authAction.label} <ExternalLink size={10} />
                      </a>
                    )}

                    {/* Config fields */}
                    {fields.map(field => (
                      <div key={field.key} style={{ marginTop: 8 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                          {field.label}
                          {config[field.key] && <Check size={10} style={{ color: 'var(--accent)', marginLeft: 6, verticalAlign: -1 }} />}
                        </label>
                        <input
                          type={field.type}
                          value={config[field.key] || ''}
                          onChange={e => update(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          style={{ fontSize: '0.78rem' }}
                        />
                      </div>
                    ))}

                    {/* Save button */}
                    {fields.length > 0 && (
                      <button className="btn btn-accent btn-sm" style={{ marginTop: 12, width: '100%', padding: '8px 0' }}
                        onClick={() => saveWidgetConfig(widget.id)}>
                        {saved === widget.id ? <><Check size={12} /> Saved!</> : 'Save Configuration'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No widgets match your search.
          </div>
        )}
      </div>
    </div>
  );
}
