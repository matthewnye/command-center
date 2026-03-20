import { useState, useMemo } from 'react';
import { X, Search, Check, AlertCircle, ExternalLink, ChevronDown } from 'lucide-react';
import WIDGET_REGISTRY, { CATEGORIES } from '../widgets/registry';
import { getConfig } from '../utils/api';
import ENV from '../config/env';

function loadEnabled() {
  try {
    const saved = JSON.parse(localStorage.getItem('cmd_widget_visibility'));
    if (Array.isArray(saved)) return saved;
  } catch {}
  return WIDGET_REGISTRY.map(w => w.id);
}
function saveEnabled(list) {
  localStorage.setItem('cmd_widget_visibility', JSON.stringify(list));
}

export default function MarketplacePanel({ onClose }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [enabled, setEnabled] = useState(loadEnabled);
  const [expandedId, setExpandedId] = useState(null);
  const config = getConfig();

  const toggle = (id) => {
    setEnabled(prev => {
      const next = prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id];
      saveEnabled(next);
      return next;
    });
  };

  const isConfigured = (widget) => {
    if (!widget.requires || widget.requires.length === 0) return true;
    return widget.requires.every(key => !!config[key]);
  };

  const filtered = useMemo(() => {
    return WIDGET_REGISTRY.filter(w => {
      if (categoryFilter !== 'all' && w.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return w.label.toLowerCase().includes(q) || w.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, categoryFilter]);

  const statusBadge = (w) => {
    if (w.status === 'coming-soon') return { label: 'Coming Soon', color: '#fbbf24', bg: '#fbbf2418' };
    if (!isConfigured(w)) return { label: 'Setup Needed', color: '#fb923c', bg: '#fb923c18' };
    if (enabled.includes(w.id)) return { label: 'Active', color: '#6ee7b7', bg: '#6ee7b718' };
    return { label: 'Available', color: '#8888a0', bg: '#8888a018' };
  };

  const getAuthUrl = (w) => {
    if (w.requires?.includes('msGraphToken')) return ENV.MS_AUTH_URL;
    if (w.requires?.includes('spotifyToken')) return ENV.SPOTIFY_AUTH_URL;
    if (w.requires?.includes('rescueTimeKey')) return 'https://www.rescuetime.com/anapi/manage';
    return null;
  };

  return (
    <div className="settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel" style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Widget Marketplace</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Browse, enable, and configure your dashboard plugins</div>
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Search + Category Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Search widgets..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, fontSize: '0.82rem' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${categoryFilter === 'all' ? 'btn-accent' : ''}`}
            onClick={() => setCategoryFilter('all')} style={{ fontSize: '0.7rem', padding: '3px 10px' }}>
            All ({WIDGET_REGISTRY.length})
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => {
            const count = WIDGET_REGISTRY.filter(w => w.category === key).length;
            return (
              <button key={key} className={`btn btn-sm ${categoryFilter === key ? 'btn-accent' : ''}`}
                onClick={() => setCategoryFilter(key)} style={{ fontSize: '0.7rem', padding: '3px 10px' }}>
                {cat.icon} {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Widget Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          {filtered.map(w => {
            const badge = statusBadge(w);
            const isActive = enabled.includes(w.id);
            const configured = isConfigured(w);
            const expanded = expandedId === w.id;
            const authUrl = getAuthUrl(w);
            const catInfo = CATEGORIES[w.category] || {};

            return (
              <div key={w.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isActive ? 'var(--accent)33' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '14px 16px',
                transition: 'all 0.2s',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Icon */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${catInfo.color || '#666'}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', flexShrink: 0,
                  }}>
                    {w.icon}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{w.label}</span>
                      <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: badge.bg, color: badge.color, fontWeight: 500 }}>
                        {badge.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {catInfo.icon} {catInfo.label}
                    </div>
                  </div>

                  {/* Toggle + Expand */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {w.status !== 'coming-soon' && (
                      <button
                        onClick={() => toggle(w.id)}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: isActive ? 'var(--accent)' : 'var(--bg-elevated)',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: isActive ? 23 : 3,
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => setExpandedId(expanded ? null : w.id)}
                      style={{ padding: '3px 5px' }}>
                      <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
                      {w.description}
                    </div>

                    {/* Connection status */}
                    {w.requires && w.requires.length > 0 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                        background: configured ? '#6ee7b710' : '#fb923c10',
                        borderRadius: 'var(--radius-sm)', marginBottom: 8,
                        fontSize: '0.75rem',
                      }}>
                        {configured ? (
                          <>
                            <Check size={14} style={{ color: 'var(--accent)' }} />
                            <span style={{ color: 'var(--accent)' }}>Connected — {w.requiresLabel}</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} style={{ color: '#fb923c' }} />
                            <span style={{ color: '#fb923c' }}>Requires {w.requiresLabel}</span>
                            {authUrl && (
                              <a href={authUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                                Connect <ExternalLink size={10} />
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {w.requires && w.requires.length === 0 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                        background: '#6ee7b710', borderRadius: 'var(--radius-sm)', marginBottom: 8,
                        fontSize: '0.75rem', color: 'var(--accent)',
                      }}>
                        <Check size={14} />
                        <span>No configuration needed — works out of the box</span>
                      </div>
                    )}

                    {w.status === 'coming-soon' && (
                      <div style={{
                        padding: '8px 10px', background: '#fbbf2410', borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem', color: '#fbbf24',
                      }}>
                        This integration is under development. Check back soon!
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {enabled.length} of {WIDGET_REGISTRY.length} widgets active
          </span>
          <button className="btn btn-accent" onClick={() => { onClose(); window.location.reload(); }}>
            Apply & Reload
          </button>
        </div>
      </div>
    </div>
  );
}
