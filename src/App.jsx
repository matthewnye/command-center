import { useState, useEffect } from 'react';
import { Settings, Play, Pause, SkipBack, SkipForward, X, LayoutGrid, ShoppingBag, TrendingUp, TrendingDown } from 'lucide-react';
import { requestNotificationPermission, restoreReminders } from './utils/notifications';
import WIDGET_REGISTRY from './widgets/registry';
import SettingsPanel from './components/SettingsPanel';
import WidgetMarketplace from './components/WidgetMarketplace';
import EditModeBar, { loadWidgetVisibility, saveWidgetVisibility, loadWidgetOrder, saveWidgetOrder } from './components/EditModeBar';

const DEFAULT_VISIBLE = WIDGET_REGISTRY.map(w => w.id);

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [time, setTime] = useState(new Date());
  const [visibleWidgets, setVisibleWidgets] = useState(loadWidgetVisibility);
  const [widgetOrder, setWidgetOrder] = useState(loadWidgetOrder);

  // Shared JIRA tracking state — bridges JIRA widget → Focus Timer
  const [trackedTicket, setTrackedTicket] = useState(null);
  // Spotify now playing — for header player bar
  const [spotifyNowPlaying, setSpotifyNowPlaying] = useState(null);
  const [spotifyControls, setSpotifyControls] = useState(null);
  // Stock ticker marquee data
  const [stockMarquee, setStockMarquee] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    restoreReminders();
    requestNotificationPermission();
    return () => clearInterval(timer);
  }, []);

  const toggleWidget = (id) => {
    setVisibleWidgets(prev => {
      const next = prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id];
      saveWidgetVisibility(next);
      return next;
    });
  };

  const updateOrder = (newOrder) => {
    setWidgetOrder(newOrder);
    saveWidgetOrder(newOrder);
  };

  const formatDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const formatTime = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Build ordered, filtered widget list
  const activeWidgets = widgetOrder
    .filter(id => visibleWidgets.includes(id))
    .map(id => WIDGET_REGISTRY.find(w => w.id === id))
    .filter(w => w && w.component);

  // Props to inject per widget
  const widgetProps = {
    jira: { onTrackTicket: setTrackedTicket },
    timer: { trackedTicket, onClearTracked: () => setTrackedTicket(null) },
    spotify: { onNowPlaying: setSpotifyNowPlaying, onControls: setSpotifyControls },
    stocks: { onMarqueeData: setStockMarquee },
  };

  return (
    <div className="app">
      {/* Marquee Bar — Spotify (when playing) or Stock Ticker (when stocks loaded and no music) */}
      {spotifyNowPlaying?.name ? (
        <div style={{
          background: '#191414', borderBottom: '1px solid rgba(29,185,84,0.2)',
          height: 32, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
        }}>
          {spotifyControls && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button onClick={spotifyControls.prev} style={{ background: 'none', border: 'none', color: '#b3b3b3', cursor: 'pointer', padding: 2, display: 'flex' }}><SkipBack size={12} /></button>
              <button onClick={spotifyControls.toggle} style={{
                width: 24, height: 24, borderRadius: '50%', border: 'none',
                background: '#1DB954', color: '#000', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {spotifyNowPlaying.isPlaying ? <Pause size={11} /> : <Play size={11} style={{ marginLeft: 1 }} />}
              </button>
              <button onClick={spotifyControls.next} style={{ background: 'none', border: 'none', color: '#b3b3b3', cursor: 'pointer', padding: 2, display: 'flex' }}><SkipForward size={12} /></button>
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              whiteSpace: 'nowrap', animation: 'marquee 25s linear infinite',
              position: 'absolute', paddingLeft: '100%',
            }}>
              <span style={{ color: '#1DB954', fontSize: '0.72rem' }}>♫</span>
              <span style={{ color: '#e8e8ed', fontSize: '0.75rem', fontWeight: 500 }}>{spotifyNowPlaying.name}</span>
              <span style={{ color: '#666', fontSize: '0.72rem' }}>—</span>
              <span style={{ color: '#8888a0', fontSize: '0.72rem' }}>{spotifyNowPlaying.artist}</span>
              <span style={{ color: '#666', fontSize: '0.72rem', marginLeft: 60 }}>♫</span>
              <span style={{ color: '#e8e8ed', fontSize: '0.75rem', fontWeight: 500 }}>{spotifyNowPlaying.name}</span>
              <span style={{ color: '#666', fontSize: '0.72rem' }}>—</span>
              <span style={{ color: '#8888a0', fontSize: '0.72rem' }}>{spotifyNowPlaying.artist}</span>
            </div>
          </div>
          {spotifyNowPlaying.duration > 0 && (
            <div style={{ width: 60, height: 3, background: '#333', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${(spotifyNowPlaying.progress / spotifyNowPlaying.duration) * 100}%`, background: '#1DB954', borderRadius: 2, transition: 'width 1s linear' }} />
            </div>
          )}
          <style>{`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
        </div>
      ) : stockMarquee?.length > 0 && (
        <div style={{
          background: '#0d0d14', borderBottom: '1px solid rgba(251,191,36,0.15)',
          height: 32, display: 'flex', alignItems: 'center', overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 24,
            whiteSpace: 'nowrap', animation: `stock-scroll ${Math.max(20, stockMarquee.length * 5)}s linear infinite`,
            position: 'absolute', paddingLeft: '100%',
          }}>
            {[...stockMarquee, ...stockMarquee].map((q, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: '#e8e8ed' }}>{q.symbol}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#8888a0' }}>${q.price?.toFixed(2)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600, color: q.change >= 0 ? '#6ee7b7' : '#f87171', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  {q.change >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {q.changePercent >= 0 ? '+' : ''}{q.changePercent?.toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
          <style>{`@keyframes stock-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
        </div>
      )}

      <header className="app-header">
        <div className="app-logo">
          <span className="dot"></span>
          <span>Command Center</span>
        </div>
        <div className="header-actions">
          <span className="header-time">{formatDate(time)} — {formatTime(time)}</span>
          <button
            className={`btn btn-icon ${editMode ? 'btn-accent' : ''}`}
            onClick={() => setEditMode(!editMode)}
            title="Edit Layout"
            style={{ position: 'relative' }}
          >
            {editMode ? <X size={16} /> : <LayoutGrid size={16} />}
          </button>
          <button className="btn btn-icon" onClick={() => setShowMarketplace(true)} title="Widget Marketplace">
            <ShoppingBag size={16} />
          </button>
          <button className="btn btn-icon" onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {editMode && (
        <EditModeBar
          visible={visibleWidgets}
          order={widgetOrder}
          onToggle={toggleWidget}
          onReorder={updateOrder}
          onClose={() => setEditMode(false)}
        />
      )}

      <main className="dashboard">
        {activeWidgets.map(w => {
          const Component = w.component;
          const props = widgetProps[w.id] || {};
          return <Component key={w.id} {...props} />;
        })}
        {activeWidgets.length === 0 && (
          <div style={{
            gridColumn: '1 / -1', textAlign: 'center', padding: 48,
            color: 'var(--text-muted)', fontSize: '0.95rem',
          }}>
            No widgets visible. Click the grid icon above to add some.
          </div>
        )}
      </main>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showMarketplace && <WidgetMarketplace onClose={() => { setShowMarketplace(false); setVisibleWidgets(loadWidgetVisibility()); }} />}
    </div>
  );
}
