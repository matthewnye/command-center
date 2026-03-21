import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Settings, X, Plus } from 'lucide-react';
import { getConfig } from '../utils/api';

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

function loadWatchlist() {
  try { const s = JSON.parse(localStorage.getItem('cmd_stocks_watchlist')); return Array.isArray(s) && s.length > 0 ? s : DEFAULT_SYMBOLS; }
  catch { return DEFAULT_SYMBOLS; }
}
function saveWatchlist(list) { localStorage.setItem('cmd_stocks_watchlist', JSON.stringify(list)); }

// Finnhub free API — 60 calls/min
async function fetchQuote(symbol, apiKey) {
  try {
    const resp = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
        method: 'GET',
        headers: {},
      }),
    });
    const result = await resp.json();
    if (result.ok && result.data?.c) {
      return {
        symbol,
        price: result.data.c,          // Current price
        change: result.data.d,          // Change
        changePercent: result.data.dp,  // Change percent
        high: result.data.h,
        low: result.data.l,
        open: result.data.o,
        prevClose: result.data.pc,
      };
    }
    return null;
  } catch { return null; }
}

export default function StockTickerWidget({ onMarqueeData }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [addSymbol, setAddSymbol] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const config = getConfig();
  const apiKey = config.finnhubKey;
  const isConfigured = !!apiKey;

  const loadQuotes = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    const results = [];
    // Fetch sequentially to respect rate limits
    for (const symbol of watchlist) {
      const quote = await fetchQuote(symbol, apiKey);
      if (quote) results.push(quote);
    }
    setQuotes(results);
    setLastRefresh(new Date());
    setLoading(false);
    // Send to header marquee
    onMarqueeData?.(results);
  }, [apiKey, watchlist, onMarqueeData]);

  useEffect(() => { loadQuotes(); }, []);
  // Refresh every 2 minutes
  useEffect(() => {
    if (!isConfigured) return;
    const interval = setInterval(loadQuotes, 120000);
    return () => clearInterval(interval);
  }, [isConfigured, loadQuotes]);

  const addToWatchlist = () => {
    const sym = addSymbol.trim().toUpperCase();
    if (!sym || watchlist.includes(sym)) return;
    const next = [...watchlist, sym];
    setWatchlist(next);
    saveWatchlist(next);
    setAddSymbol('');
    // Fetch the new one immediately
    if (apiKey) fetchQuote(sym, apiKey).then(q => { if (q) setQuotes(prev => [...prev, q]); });
  };

  const removeFromWatchlist = (sym) => {
    const next = watchlist.filter(s => s !== sym);
    setWatchlist(next);
    saveWatchlist(next);
    setQuotes(prev => prev.filter(q => q.symbol !== sym));
  };

  const fmtPrice = (n) => n != null ? `$${n.toFixed(2)}` : '—';
  const fmtPct = (n) => n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '';
  const fmtTime = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  // Demo data
  const demoQuotes = DEFAULT_SYMBOLS.slice(0, 4).map(s => ({
    symbol: s, price: 100 + Math.random() * 400, change: (Math.random() - 0.4) * 10, changePercent: (Math.random() - 0.4) * 5,
  }));
  const displayQuotes = isConfigured && quotes.length > 0 ? quotes : demoQuotes;

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><TrendingUp className="icon" /> Market {!isConfigured && <span className="badge badge-warning">Demo</span>}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtTime(lastRefresh)}</span>}
          <button className="btn btn-sm" onClick={() => setShowSettings(!showSettings)} style={{ padding: '3px 5px' }}>
            <Settings size={11} />
          </button>
          <button className="btn btn-sm" onClick={loadQuotes} disabled={loading} style={{ padding: '3px 5px' }}>
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="widget-body">
        {showSettings && (
          <div style={{ marginBottom: 10, padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input type="text" placeholder="Add symbol (e.g. AAPL)" value={addSymbol}
                onChange={e => setAddSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && addToWatchlist()}
                style={{ flex: 1, fontSize: '0.78rem' }} />
              <button className="btn btn-accent btn-sm" onClick={addToWatchlist}><Plus size={12} /></button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {watchlist.map(sym => (
                <span key={sym} style={{ fontSize: '0.68rem', padding: '2px 8px', background: 'var(--bg-elevated)', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {sym}
                  <X size={10} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => removeFromWatchlist(sym)} />
                </span>
              ))}
            </div>
          </div>
        )}

        {displayQuotes.map(q => (
          <div key={q.symbol} style={{
            display: 'flex', alignItems: 'center', padding: '7px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ minWidth: 55, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700 }}>{q.symbol}</div>
            <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>{fmtPrice(q.price)}</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600,
              color: q.change >= 0 ? '#6ee7b7' : '#f87171',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              {q.change >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {fmtPct(q.changePercent)}
            </div>
          </div>
        ))}

        {!isConfigured && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--accent)' }}>
            Add your free Finnhub API key in the Marketplace to see live data. Get one at <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>finnhub.io</a>
          </div>
        )}
      </div>
    </div>
  );
}
