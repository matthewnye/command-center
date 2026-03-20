import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Mail, Eye, Moon, Wifi, WifiOff, RefreshCw, Settings, ChevronDown, ChevronUp, Users, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getConfig, fetchRescueTimeFull, fetchRescueTimeActivities, fetchOutlookCalendar } from '../utils/api';
import { recordSnapshot, classifyIdleTime, computeBaselines, computeAdaptiveScore, getKPIDrillDown, getWeeklyTrend } from '../utils/adaptive';

// ═══════════════════════════════════════════════════════════════
// FOCUS HEARTBEAT — Real-time productivity pulse via RescueTime
//
// Polls RescueTime every 60 seconds and maps your productivity
// score (0–100) to a live ECG waveform. The heartbeat physically
// speeds up when you're productive and flatlines when you drift.
// ═══════════════════════════════════════════════════════════════

const FOCUS_STATES = [
  { min: 0,  max: 20,  label: 'Distracted',    color: '#f87171', bpm: 3,   emoji: '💤', desc: 'Mostly distracting apps' },
  { min: 20, max: 40,  label: 'Drifting',      color: '#fb923c', bpm: 4.5, emoji: '📱', desc: 'More distracting than productive' },
  { min: 40, max: 55,  label: 'Neutral',        color: '#fbbf24', bpm: 6,   emoji: '⚖️', desc: 'Mixed activity' },
  { min: 55, max: 70,  label: 'Engaged',        color: '#60a5fa', bpm: 7.5, emoji: '⚡', desc: 'Leaning productive' },
  { min: 70, max: 85,  label: 'Focused',        color: '#34d399', bpm: 9.5, emoji: '🎯', desc: 'Solidly productive' },
  { min: 85, max: 101, label: 'Deep Flow',      color: '#6ee7b7', bpm: 12,  emoji: '🔥', desc: 'Peak productivity' },
];

function getFocusState(score) {
  return FOCUS_STATES.find(s => score >= s.min && score < s.max) || FOCUS_STATES[0];
}

// ── RescueTime Polling Hook ──

function useRescueTimePoll(intervalMs = 60000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    const config = getConfig();
    if (!config.rescueTimeKey) {
      setError('no_key');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [result, activities] = await Promise.all([
        fetchRescueTimeFull(config),
        fetchRescueTimeActivities(config),
      ]);
      // Also fetch calendar for meeting-aware idle
      let calEvents = [];
      if (config.msGraphToken || config.msGraphRefreshToken) {
        try {
          const cal = await fetchOutlookCalendar(config);
          if (cal) {
            calEvents = cal.map(e => ({
              title: e.subject,
              startISO: e.start?.dateTime ? new Date(e.start.dateTime + 'Z').toISOString() : null,
              endISO: e.end?.dateTime ? new Date(e.end.dateTime + 'Z').toISOString() : null,
            }));
          }
        } catch {}
      }
      if (result) {
        result.activities = activities || [];
        result.calendarEvents = calEvents;
        setData(result);
        setLastFetch(new Date());
        // Record snapshot for adaptive learning
        recordSnapshot(result, calEvents);
        // Recompute baselines every 10 minutes
        if (!window._lastBaselineCompute || Date.now() - window._lastBaselineCompute > 600000) {
          computeBaselines();
          window._lastBaselineCompute = Date.now();
        }
      } else {
        setError('fetch_failed');
      }
    } catch (err) {
      setError('fetch_failed');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [fetchData, intervalMs]);

  return { data, loading, error, lastFetch, refresh: fetchData };
}

// ── Tab Switch Tracker ──

function useTabSwitchTracker() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const handler = () => { if (document.hidden) setCount(c => c + 1); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return count;
}

// ── Idle Time Tracker ──
// Tracks seconds since last mouse move, keypress, or click

function useIdleTracker() {
  const [idleMinutes, setIdleMinutes] = useState(0);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    const resetIdle = () => { lastActivity.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));

    const interval = setInterval(() => {
      const idleSec = Math.floor((Date.now() - lastActivity.current) / 1000);
      setIdleMinutes(Math.floor(idleSec / 60));
    }, 5000);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      clearInterval(interval);
    };
  }, []);

  return idleMinutes;
}

// ── Extract email/communication minutes from RescueTime activities ──

function getEmailMinutes(data) {
  // Try activities first (category names like "Communication & Scheduling")
  if (data?.activities?.length) {
    const emailCats = data.activities.filter(c =>
      c.name?.toLowerCase().includes('communication') ||
      c.name?.toLowerCase().includes('email') ||
      c.name?.toLowerCase().includes('messaging')
    );
    const totalHours = emailCats.reduce((sum, c) => sum + (c.hours || 0), 0);
    if (totalHours > 0) return Math.round(totalHours * 60);
  }
  // Fallback to categories from pulse data
  if (data?.categories) {
    const emailCats = data.categories.filter(c =>
      c.name?.toLowerCase().includes('communication') ||
      c.name?.toLowerCase().includes('email')
    );
    const totalHours = emailCats.reduce((sum, c) => sum + (c.hours || 0), 0);
    return Math.round(totalHours * 60);
  }
  return 0;
}

// ── Idle Time from RescueTime ──
// Idle = hours elapsed since start of day minus hours RescueTime tracked
// This captures actual away-from-computer time across ALL apps

function getIdleMinutes(data) {
  if (data?.totalHours == null) return 0;
  // Calculate hours elapsed since 8am (or midnight, whichever is later)
  const now = new Date();
  const startOfWork = new Date(now);
  startOfWork.setHours(8, 0, 0, 0);
  if (now < startOfWork) return 0; // Before work hours

  const hoursElapsed = (now.getTime() - startOfWork.getTime()) / 3600000;
  // Cap at reasonable work day (don't count after midnight)
  const cappedElapsed = Math.min(hoursElapsed, 14);
  
  // Idle = elapsed time minus tracked time
  const idleHours = Math.max(0, cappedElapsed - (data.totalHours || 0));
  return Math.round(idleHours * 60);
}

// ── EKG Monitor Canvas ──
// Sweeping line with phosphor fade, like a real bedside monitor

function HeartbeatCanvas({ score, width = 300, height = 80 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const sweepX = useRef(0);
  const traceBuffer = useRef(new Float32Array(width).fill(0.5));
  const state = getFocusState(score);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Speed: pixels per second (slow sweep like real EKG)
    const pixelsPerSecond = 15 + (state.bpm / 12) * 8; // ~15-23 px/s
    const midY = height / 2;
    const amplitude = 0.4 + (score / 100) * 0.6;

    // ECG waveform function: given a phase 0-1 within one heartbeat cycle
    function ecgY(t) {
      if (t > 0.30 && t < 0.36) {
        // P wave
        return midY - 5 * amplitude * Math.sin((t - 0.30) / 0.06 * Math.PI);
      } else if (t > 0.40 && t < 0.42) {
        // Q dip
        return midY + 6 * amplitude;
      } else if (t > 0.42 && t < 0.47) {
        // R peak — tall, sharp
        const peak = 10 + (score / 100) * 24;
        return midY - peak * Math.sin((t - 0.42) / 0.05 * Math.PI);
      } else if (t > 0.47 && t < 0.49) {
        // S dip
        return midY + 8 * amplitude;
      } else if (t > 0.52 && t < 0.62) {
        // T wave
        return midY - 6 * amplitude * Math.sin((t - 0.52) / 0.10 * Math.PI);
      } else {
        // Baseline
        return midY;
      }
    }

    // Cycle length in pixels
    const beatsPerSecond = state.bpm / 60;
    const pixelsPerBeat = pixelsPerSecond / beatsPerSecond;
    let beatPhase = 0;
    let lastTime = performance.now();

    const draw = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Advance sweep
      const advance = pixelsPerSecond * dt;
      const gapWidth = 12;

      for (let i = 0; i < Math.ceil(advance); i++) {
        const x = Math.floor(sweepX.current) % width;
        beatPhase = (beatPhase + (1 / pixelsPerBeat)) % 1;
        traceBuffer.current[x] = ecgY(beatPhase);
        // Clear ahead (the gap)
        for (let g = 1; g <= gapWidth; g++) {
          traceBuffer.current[(x + g) % width] = midY;
        }
        sweepX.current = (sweepX.current + 1) % width;
      }

      // Draw
      ctx.fillStyle = 'rgba(10, 10, 15, 1)';
      ctx.fillRect(0, 0, width, height);

      // Grid lines (subtle, like monitor)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      for (let gy = 0; gy < height; gy += 16) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke();
      }
      for (let gx = 0; gx < width; gx += 16) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, height); ctx.stroke();
      }

      const cursorX = Math.floor(sweepX.current) % width;

      // Draw the trace with phosphor fade
      for (let x = 0; x < width; x++) {
        const y = traceBuffer.current[x];
        if (y === midY && (x < cursorX - 2 || x > cursorX + gapWidth + 2)) {
          // Baseline — draw dimly
          ctx.fillStyle = `${state.color}15`;
          ctx.fillRect(x, midY, 1, 1);
          continue;
        }

        // Calculate distance behind cursor for fade
        let dist = cursorX - x;
        if (dist < 0) dist += width;

        // Gap zone: don't draw
        if (dist < 0 || (x > cursorX && x < cursorX + gapWidth)) continue;

        // Phosphor fade: bright near cursor, fading further back
        let alpha;
        if (dist < 30) alpha = 1.0;
        else if (dist < 100) alpha = 1.0 - (dist - 30) / 100;
        else if (dist < 250) alpha = 0.3 - (dist - 100) / 500;
        else alpha = 0.05;
        alpha = Math.max(0.03, alpha);

        // Draw pixel with glow
        const hexAlpha = Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fillStyle = state.color + hexAlpha;
        ctx.fillRect(x, y - 1, 1.5, 2.5);

        // Glow for recent trace
        if (alpha > 0.5) {
          ctx.fillStyle = state.color + '18';
          ctx.fillRect(x, y - 3, 1.5, 7);
        }
      }

      // Bright sweep cursor dot
      const cursorY = traceBuffer.current[cursorX] || midY;
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, 3, 0, Math.PI * 2);
      ctx.fillStyle = state.color;
      ctx.shadowColor = state.color;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Glow halo around cursor
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, 8, 0, Math.PI * 2);
      ctx.fillStyle = state.color + '20';
      ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [score, state.bpm, state.color, width, height]);

  return <canvas ref={canvasRef} style={{ width, height, display: 'block', borderRadius: 'var(--radius-md)' }} />;
}

// ── History Sparkline ──

function HistorySparkline({ history, width = 300, height = 55 }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  if (history.length < 2) return null;

  const leftPad = 28; // space for Y-axis labels
  const chartW = width - leftPad;
  const points = history.map((entry, i) => {
    const x = leftPad + (i / (history.length - 1)) * chartW;
    const y = height - (entry.score / 100) * (height - 10) - 5;
    return { x, y, score: entry.score, time: entry.time };
  });
  const linePoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${leftPad},${height} ${linePoints} ${width},${height}`;
  const latest = history[history.length - 1];
  const state = getFocusState(latest?.score ?? 50);

  const handleMouse = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    // Find closest point
    let closest = 0, closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    setHoverIdx(closestDist < 20 ? closest : null);
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <svg ref={svgRef} width={width} height={height} style={{ display: 'block', opacity: 0.85 }}
      onMouseMove={handleMouse} onMouseLeave={() => setHoverIdx(null)}>
      <defs>
        <linearGradient id="hbHistGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={state.color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={state.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Y-axis labels */}
      <text x={leftPad - 4} y={8} textAnchor="end" fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)">100</text>
      <text x={leftPad - 4} y={height / 2 + 2} textAnchor="end" fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)">50</text>
      <text x={leftPad - 4} y={height - 2} textAnchor="end" fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)">0</text>
      {/* Y-axis gridlines */}
      <line x1={leftPad} y1={height / 2} x2={width} y2={height / 2} stroke="var(--border-subtle)" strokeWidth="0.4" strokeDasharray="2,4" />
      {/* Chart area */}
      <polygon points={areaPoints} fill="url(#hbHistGrad)" />
      <polyline points={linePoints} fill="none" stroke={state.color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Latest point */}
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={state.color} />
      )}
      {/* Hover indicator */}
      {hoverIdx != null && points[hoverIdx] && (
        <>
          <line x1={points[hoverIdx].x} y1={0} x2={points[hoverIdx].x} y2={height} stroke={state.color} strokeWidth="0.6" strokeDasharray="2,2" opacity="0.5" />
          <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r="4" fill={state.color} stroke="#0a0a0f" strokeWidth="1.5" />
          {/* Tooltip above point */}
          <rect x={points[hoverIdx].x - 30} y={Math.max(0, points[hoverIdx].y - 28)} width={60} height={22} rx={4} fill="rgba(10,10,20,0.92)" stroke={state.color} strokeWidth="0.5" />
          <text x={points[hoverIdx].x} y={Math.max(10, points[hoverIdx].y - 18)} textAnchor="middle" fill={state.color} fontSize="8" fontWeight="700" fontFamily="var(--font-mono)">
            {Math.round(points[hoverIdx].score)}%
          </text>
          <text x={points[hoverIdx].x} y={Math.max(20, points[hoverIdx].y - 10)} textAnchor="middle" fill="var(--text-muted)" fontSize="6" fontFamily="var(--font-mono)">
            {formatTime(points[hoverIdx].time)}
          </text>
        </>
      )}
    </svg>
  );
}

// ── Activity Breakdown Mini-Bars ──

function ProductivityBars({ categories }) {
  if (!categories || categories.length === 0) return null;
  const maxHours = Math.max(...categories.map(c => c.hours), 0.1);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
        Activity Breakdown
      </div>
      {categories.map((cat, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ minWidth: 90, fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
            {cat.name}
          </div>
          <div style={{ flex: 1, height: 14, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${(cat.hours / maxHours) * 100}%`,
              background: cat.color,
              transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
          </div>
          <div style={{ minWidth: 32, fontSize: '0.68rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: cat.color }}>
            {cat.hours}h
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Setup Prompt (no API key) ──

function SetupPrompt() {
  return (
    <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
      <Settings size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
      <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>Connect RescueTime</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
        Add your RescueTime API key in Settings to see your real-time productivity heartbeat.
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Get your key at rescuetime.com/anapi/manage
      </div>
    </div>
  );
}

// ── Demo Mode ──

function useDemoMode() {
  const [score, setScore] = useState(55);
  useEffect(() => {
    const interval = setInterval(() => {
      setScore(prev => Math.max(5, Math.min(95, prev + (Math.random() - 0.45) * 8)));
    }, 3000);
    return () => clearInterval(interval);
  }, []);
  return {
    score: Math.round(score),
    totalHours: 4.2, productiveHours: 2.8, distractingHours: 0.9,
    categories: [
      { name: 'Very Productive', hours: 1.9, color: '#6ee7b7', level: 2 },
      { name: 'Productive', hours: 0.9, color: '#60a5fa', level: 1 },
      { name: 'Neutral', hours: 0.6, color: '#8888a0', level: 0 },
      { name: 'Distracting', hours: 0.5, color: '#fbbf24', level: -1 },
      { name: 'Very Distracting', hours: 0.3, color: '#f87171', level: -2 },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN WIDGET
// ═══════════════════════════════════════════════════════════════

export default function FocusHeartbeatWidget() {
  const { data, loading, error, lastFetch, refresh } = useRescueTimePoll(60000);
  const demo = useDemoMode();
  const tabSwitches = useTabSwitchTracker();

  const isConnected = error !== 'no_key' && data !== null;
  const source = isConnected ? data : demo;
  const score = source?.score ?? demo.score;
  const emailMins = isConnected ? getEmailMinutes(data) : 14;
  
  // Adaptive idle classification (meeting-aware)
  const calEvents = data?.calendarEvents || [];
  const idleInfo = isConnected ? classifyIdleTime(data, calEvents) : { totalIdle: 0, meetingIdle: 0, actualIdle: 0, breakdown: [] };
  const idleMins = idleInfo.actualIdle;

  // Baselines and adaptive score
  const [baselines, setBaselines] = useState(() => computeBaselines());
  const adaptive = isConnected ? computeAdaptiveScore(data, calEvents, baselines) : null;

  // Drill-down state
  const [expandedKPI, setExpandedKPI] = useState(null);
  const toggleKPI = (kpi) => setExpandedKPI(expandedKPI === kpi ? null : kpi);

  // Refresh baselines periodically
  useEffect(() => {
    const interval = setInterval(() => setBaselines(computeBaselines()), 600000);
    return () => clearInterval(interval);
  }, []);

  const [history, setHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cmd_pulse_history') || '[]');
      // Filter to today only
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      return saved.filter(h => h.time >= todayStart.getTime());
    } catch { return []; }
  });

  // Record to history on each update and persist
  useEffect(() => {
    if (score == null) return;
    setHistory(prev => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      // Filter to today, add new point, cap at 500 entries (~8hrs at 1min intervals)
      const filtered = prev.filter(h => h.time >= todayStart.getTime());
      const next = [...filtered, { score, time: Date.now() }];
      if (next.length > 500) next.shift();
      localStorage.setItem('cmd_pulse_history', JSON.stringify(next));
      return next;
    });
  }, [score, data?.lastUpdated]);

  // Trend calculation
  const recentScores = history.slice(-10).map(h => h.score);
  const trend = recentScores.length >= 6
    ? Math.round(recentScores.slice(-3).reduce((a, b) => a + b, 0) / 3) - Math.round(recentScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3)
    : 0;

  const state = getFocusState(score);
  const formatTime = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <div className="widget" style={{ border: `1px solid ${state.color}22` }}>
      <div className="widget-header">
        <div className="widget-title">
          <Activity className="icon" style={{ color: state.color }} /> Focus Heartbeat
          {!isConnected && <span className="badge badge-warning">Demo</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isConnected
            ? <Wifi size={12} style={{ color: 'var(--accent)', opacity: 0.7 }} />
            : <WifiOff size={12} style={{ color: 'var(--text-muted)' }} />
          }
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: state.color,
            boxShadow: `0 0 8px ${state.color}`,
            animation: `pulse-glow ${60 / state.bpm}s ease-in-out infinite`,
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: state.color }}>
            {score}
          </span>
          <button className="btn btn-icon btn-sm" onClick={refresh} disabled={loading}
            style={{ width: 24, height: 24, opacity: 0.6 }}
            title={lastFetch ? `Updated ${formatTime(lastFetch)}` : 'Refresh'}>
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="widget-body">
        {error === 'no_key' && !data ? <SetupPrompt /> : (
          <>
            {/* State label — click for focus drill-down */}
            <div style={{ textAlign: 'center', marginBottom: 6, cursor: 'pointer' }} onClick={() => toggleKPI('focus')}>
              <span style={{ fontSize: '1.6rem', marginRight: 8 }}>{state.emoji}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: state.color }}>{state.label}</span>
              <ChevronDown size={12} style={{ verticalAlign: -1, marginLeft: 4, color: 'var(--text-muted)', transform: expandedKPI === 'focus' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {state.desc}
                {trend > 5 && ' · Trending up ↑'}
                {trend < -5 && ' · Trending down ↓'}
              </div>
            </div>

            {/* ECG */}
            <div style={{
              display: 'flex', justifyContent: 'center', margin: '4px 0 12px',
            }}>
              <HeartbeatCanvas score={score} width={300} height={80} />
            </div>

            {/* Metrics — Clickable with drill-down */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
              {[
                { key: 'email', icon: Mail, val: `${emailMins}m`, label: 'Email', color: emailMins > 45 ? 'var(--warning)' : 'var(--info)',
                  vsAvg: baselines?.overall?.emailMins ? emailMins - Math.round(baselines.overall.emailMins) : null },
                { key: 'tabs', icon: Eye, val: `${tabSwitches}`, label: 'Tab Switches', color: tabSwitches > 20 ? 'var(--warning)' : 'var(--text-secondary)' },
                { key: 'idle', icon: Moon, 
                  val: idleInfo.totalIdle > 0 ? `${idleInfo.totalIdle}m` : '0m',
                  label: idleInfo.meetingIdle > 0 ? `Idle (${idleInfo.meetingIdle}m mtg)` : 'Idle Today',
                  color: idleInfo.actualIdle > 60 ? 'var(--warning)' : 'var(--text-muted)',
                  meetingIcon: idleInfo.meetingIdle > 0 },
              ].map((m, i) => (
                <div key={i} onClick={() => toggleKPI(m.key)}
                  style={{ textAlign: 'center', padding: '6px 2px', background: expandedKPI === m.key ? 'var(--bg-elevated)' : 'var(--bg-input)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s', border: expandedKPI === m.key ? '1px solid var(--border-default)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <m.icon size={12} style={{ color: m.color, marginBottom: 2 }} />
                    {m.meetingIcon && <Users size={9} style={{ color: 'var(--info)', opacity: 0.7 }} />}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{m.label}</div>
                  {m.vsAvg != null && (
                    <div style={{ fontSize: '0.55rem', color: m.vsAvg > 0 ? 'var(--warning)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                      {m.vsAvg > 0 ? `+${m.vsAvg}m vs avg` : `${m.vsAvg}m vs avg`}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Drill-down panels */}
            {expandedKPI && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 10, marginBottom: 10, border: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
                {expandedKPI === 'email' && (() => {
                  const d = getKPIDrillDown('email', data, calEvents, baselines);
                  return (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--info)' }}>📧 Email & Communication</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                        <div style={{ padding: 6, background: 'var(--bg-input)', borderRadius: 4 }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Today</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--info)' }}>{d.current}m</div>
                        </div>
                        <div style={{ padding: 6, background: 'var(--bg-input)', borderRadius: 4 }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Daily Avg</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-secondary)' }}>{d.avgDaily ?? '—'}m</div>
                        </div>
                      </div>
                      {d.vsAvg != null && <div style={{ color: d.vsAvg > 0 ? 'var(--warning)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                        {d.vsAvg > 0 ? '↑' : '↓'} {d.label}
                      </div>}
                      {!baselines && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Building baselines... need 3+ days of data</div>}
                    </div>
                  );
                })()}

                {expandedKPI === 'idle' && (() => {
                  const d = getKPIDrillDown('idle', data, calEvents, baselines);
                  return (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>🌙 Idle Time Breakdown</div>
                      {d.breakdown.map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          <span>{b.type === 'meeting' ? '👥 ' : '💤 '}{b.label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: b.type === 'meeting' ? 'var(--info)' : 'var(--warning)' }}>{b.mins}m</span>
                        </div>
                      ))}
                      {d.breakdown.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No idle time recorded</div>}
                      <div style={{ marginTop: 6, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Total untracked: {d.total}m = {d.inMeetings}m meetings + {d.actualIdle}m away
                      </div>
                    </div>
                  );
                })()}

                {expandedKPI === 'focus' && (() => {
                  const d = getKPIDrillDown('focus', data, calEvents, baselines);
                  return (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, color: state.color }}>🎯 Focus Score Breakdown</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                        <div style={{ padding: 6, background: 'var(--bg-input)', borderRadius: 4, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Raw Score</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.adaptive?.raw ?? '—'}</div>
                        </div>
                        <div style={{ padding: 6, background: 'var(--bg-input)', borderRadius: 4, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Your Avg</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.overallAvg ?? '—'}</div>
                        </div>
                        <div style={{ padding: 6, background: 'var(--bg-input)', borderRadius: 4, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]} Avg</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.dowAvg ?? '—'}</div>
                        </div>
                      </div>
                      {d.adaptive?.meetingAdjustment > 0 && (
                        <div style={{ color: 'var(--info)', marginBottom: 4 }}>👥 In meeting: +{d.adaptive.meetingAdjustment} adjustment (not penalizing low activity during meetings)</div>
                      )}
                      {d.adaptive?.baselineComparison != null && (
                        <div style={{ color: d.adaptive.baselineComparison >= 0 ? 'var(--accent)' : 'var(--warning)', marginBottom: 4 }}>
                          {d.adaptive.baselineComparison >= 0 ? <TrendingUp size={11} style={{ verticalAlign: -2 }} /> : <TrendingDown size={11} style={{ verticalAlign: -2 }} />}
                          {' '}{d.adaptive.baselineComparison >= 0 ? '+' : ''}{Math.round(d.adaptive.baselineComparison)} vs your overall average
                        </div>
                      )}
                      {d.weeklyScores.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 4 }}>Last {d.weeklyScores.length} days</div>
                          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 30 }}>
                            {d.weeklyScores.map((ws, i) => (
                              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <div style={{ width: '100%', background: ws.avg >= 70 ? 'var(--accent)' : ws.avg >= 50 ? 'var(--warning)' : 'var(--danger)', borderRadius: 2, height: `${Math.max(4, (ws.avg / 100) * 28)}px`, opacity: 0.7 }} />
                                <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>{new Date(ws.day + 'T12:00').toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                        {d.daysOfData > 0 ? `${d.daysOfData} days of history · Baselines active` : 'Collecting data... baselines activate after 3 days'}
                      </div>
                    </div>
                  );
                })()}

                {expandedKPI === 'tabs' && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>👁 Tab Switches</div>
                    <div style={{ color: 'var(--text-muted)' }}>Counts visibility changes in this browser session. High counts may indicate context-switching.</div>
                    <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                      {tabSwitches < 10 ? '✅ Low — good focus' : tabSwitches < 25 ? '⚡ Moderate — some context switching' : '⚠️ High — lots of multitasking'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Adaptive context line */}
            {adaptive && baselines && (
              <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                {adaptive.baselineComparison != null && (
                  <span>
                    {adaptive.baselineComparison >= 5 ? <TrendingUp size={10} style={{ verticalAlign: -2, color: 'var(--accent)' }} /> : adaptive.baselineComparison <= -5 ? <TrendingDown size={10} style={{ verticalAlign: -2, color: 'var(--warning)' }} /> : <Minus size={10} style={{ verticalAlign: -2 }} />}
                    {' '}{adaptive.baselineComparison >= 0 ? '+' : ''}{Math.round(adaptive.baselineComparison)} vs your avg
                    {adaptive.dowComparison != null && ` · ${adaptive.dowComparison >= 0 ? '+' : ''}${Math.round(adaptive.dowComparison)} vs ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]}s`}
                  </span>
                )}
                {!baselines && <span style={{ fontStyle: 'italic' }}>Learning your patterns...</span>}
              </div>
            )}

            {/* Sparkline */}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Today's Productivity Pulse</span>
              <span>{lastFetch ? `Updated ${formatTime(lastFetch)}` : `Last ${history.length}m`}</span>
            </div>
            <HistorySparkline history={history} width={300} height={45} />
          </>
        )}
      </div>
    </div>
  );
}
