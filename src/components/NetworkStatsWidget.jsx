import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, Activity, ArrowDown, ArrowUp, Globe } from 'lucide-react';

function getNetworkInfo() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return null;
  return {
    type: conn.effectiveType || conn.type || 'unknown', // 4g, 3g, 2g, slow-2g
    downlink: conn.downlink || null, // Mbps estimate
    rtt: conn.rtt || null, // Round-trip time in ms
    saveData: conn.saveData || false,
  };
}

async function measureLatency(url = 'https://www.google.com/generate_204') {
  try {
    const start = performance.now();
    await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
    return Math.round(performance.now() - start);
  } catch { return null; }
}

async function measureSpeed() {
  // Download a small known file and measure time
  try {
    const testUrl = 'https://www.google.com/images/phd/px.gif'; // ~43 bytes
    const iterations = 5;
    let totalTime = 0;
    let totalBytes = 0;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const resp = await fetch(testUrl + '?t=' + Date.now(), { cache: 'no-store', mode: 'no-cors' });
      totalTime += performance.now() - start;
      totalBytes += 43; // approximate
    }

    // This is a rough estimate — real speed tests need larger files
    // Use the browser's Network Information API as primary source
    const conn = navigator.connection || navigator.mozConnection;
    return {
      estimatedMbps: conn?.downlink || (totalBytes * 8 / totalTime / 1000).toFixed(1),
      latencyMs: Math.round(totalTime / iterations),
    };
  } catch { return null; }
}

export default function NetworkStatsWidget() {
  const [info, setInfo] = useState(getNetworkInfo);
  const [latency, setLatency] = useState(null);
  const [externalIp, setExternalIp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cmd_net_history') || '[]').slice(-20); } catch { return []; }
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setInfo(getNetworkInfo());
    const lat = await measureLatency();
    setLatency(lat);

    // Get external IP
    try {
      const resp = await fetch('https://api.ipify.org?format=json');
      const data = await resp.json();
      setExternalIp(data.ip);
    } catch {}

    // Record to history
    if (lat) {
      const entry = { time: Date.now(), latency: lat, type: getNetworkInfo()?.type };
      setHistory(prev => {
        const next = [...prev, entry].slice(-20);
        localStorage.setItem('cmd_net_history', JSON.stringify(next));
        return next;
      });
    }

    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, []);
  // Refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Listen for connection changes
  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection;
    if (!conn) return;
    const handler = () => setInfo(getNetworkInfo());
    conn.addEventListener('change', handler);
    return () => conn.removeEventListener('change', handler);
  }, []);

  const online = navigator.onLine;
  const fmtTime = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  const typeColors = { '4g': '#6ee7b7', '3g': '#fbbf24', '2g': '#f87171', 'slow-2g': '#f87171' };
  const typeColor = typeColors[info?.type] || 'var(--text-muted)';

  // Latency chart
  const maxLat = Math.max(...history.map(h => h.latency), 100);

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">
          {online ? <Wifi className="icon" style={{ color: '#6ee7b7' }} /> : <WifiOff className="icon" style={{ color: '#f87171' }} />}
          Network
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtTime(lastRefresh)}</span>}
          <button className="btn btn-sm" onClick={refresh} disabled={loading} style={{ padding: '3px 5px' }}>
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="widget-body">
        {/* Status indicator */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: online ? '#6ee7b7' : '#f87171' }}>
            {online ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <Activity size={14} style={{ color: typeColor, marginBottom: 4 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: typeColor }}>{info?.type?.toUpperCase() || '—'}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Connection</div>
          </div>
          <div style={{ padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <ArrowDown size={14} style={{ color: 'var(--info)', marginBottom: 4 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--info)' }}>{info?.downlink ? `${info.downlink}` : '—'}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Mbps (est.)</div>
          </div>
          <div style={{ padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <Globe size={14} style={{ color: 'var(--text-secondary)', marginBottom: 4 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>{externalIp || '—'}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>External IP</div>
          </div>
          <div style={{ padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <Activity size={14} style={{ color: latency && latency < 100 ? '#6ee7b7' : latency < 300 ? '#fbbf24' : '#f87171', marginBottom: 4 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: latency && latency < 100 ? '#6ee7b7' : latency < 300 ? '#fbbf24' : '#f87171' }}>{latency ? `${latency}ms` : '—'}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Latency</div>
          </div>
        </div>

        {/* Latency history chart */}
        {history.length > 2 && (
          <>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>Latency History</div>
            <svg width="100%" height={40} viewBox={`0 0 ${history.length * 15} 40`} style={{ display: 'block' }}>
              {history.map((h, i) => {
                const barH = Math.max(3, (h.latency / maxLat) * 36);
                const color = h.latency < 100 ? '#6ee7b744' : h.latency < 300 ? '#fbbf2444' : '#f8717144';
                return <rect key={i} x={i * 15} y={40 - barH} width={12} height={barH} rx={2} fill={color} />;
              })}
            </svg>
          </>
        )}
      </div>
    </div>
  );
}
