import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Zap } from 'lucide-react';
import { fetchRescueTimeActivities, fetchRescueTimeFull, getConfig } from '../utils/api';

export default function RescueTimeWidget({ embedded }) {
  const [view, setView] = useState('activities');
  const [activities, setActivities] = useState(null);
  const [productivity, setProductivity] = useState(null);
  const [score, setScore] = useState(null);
  const [totalHours, setTotalHours] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const config = getConfig();
  const isConfigured = !!config.rescueTimeKey;

  const mockActivities = [
    { name: 'Software Dev', hours: 3.1, color: 'var(--accent)' },
    { name: 'Email & Chat', hours: 1.4, color: 'var(--info)' },
    { name: 'Reference & Docs', hours: 0.8, color: 'var(--purple)' },
    { name: 'Social Media', hours: 0.5, color: 'var(--warning)' },
    { name: 'Entertainment', hours: 0.2, color: 'var(--danger)' },
  ];
  const mockProductivity = [
    { name: 'Very Productive', hours: 2.8, color: 'var(--accent)' },
    { name: 'Productive', hours: 1.2, color: 'var(--info)' },
    { name: 'Neutral', hours: 0.9, color: 'var(--text-secondary)' },
    { name: 'Distracting', hours: 0.8, color: 'var(--warning)' },
    { name: 'Very Distracting', hours: 0.5, color: 'var(--danger)' },
  ];

  const loadData = useCallback(async () => {
    setLoading(true);
    const [fullData, actData] = await Promise.all([
      fetchRescueTimeFull(config),
      fetchRescueTimeActivities(config),
    ]);
    if (fullData) {
      setScore(fullData.score);
      setTotalHours(fullData.totalHours);
      if (fullData.categories) setProductivity(fullData.categories);
    }
    if (actData) setActivities(actData);
    setLastRefresh(new Date());
    setLoading(false);
  }, [isConfigured, config.rescueTimeKey]);

  useEffect(() => { loadData(); }, []);
  // Refresh every 5 minutes
  useEffect(() => {
    if (!isConfigured) return;
    const interval = setInterval(loadData, 300000);
    return () => clearInterval(interval);
  }, [isConfigured, loadData]);

  const displayActivities = activities || mockActivities;
  const displayProductivity = productivity || mockProductivity;
  const displayScore = score ?? 74;
  const displayTotal = totalHours ?? 6.2;
  const data = view === 'activities' ? displayActivities : displayProductivity;
  const maxHours = Math.max(...data.map(c => c.hours), 0.1);

  const innerContent = (
    <>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Today: {displayTotal}h tracked</div>
      </div>
      <div className="tab-bar">
        <button className={view === 'activities' ? 'active' : ''} onClick={() => setView('activities')}>Activities</button>
        <button className={view === 'productivity' ? 'active' : ''} onClick={() => setView('productivity')}>Productivity</button>
      </div>
      <div className="productivity-bar-group">
        {data.map((cat, i) => (
          <div className="productivity-bar-row" key={`${view}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="productivity-bar-label" style={{ width: 140, minWidth: 140, textAlign: 'right', flexShrink: 0, fontSize: '0.75rem' }}>{cat.name}</div>
            <div className="productivity-bar-track" style={{ flex: 1 }}>
              <div className="productivity-bar-fill" style={{ width: `${(cat.hours / maxHours) * 100}%`, background: cat.color }}></div>
            </div>
            <div className="productivity-bar-value" style={{ color: cat.color, width: 36, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>{cat.hours}h</div>
          </div>
        ))}
      </div>
      {!isConfigured && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--accent)' }}>
          <Zap size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Add your RescueTime API key in Settings for real data
        </div>
      )}
    </>
  );

  if (embedded) return innerContent;

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><BarChart3 className="icon" /> Productivity {!isConfigured && <span className="badge badge-warning">Demo</span>}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: displayScore >= 70 ? 'var(--accent)' : displayScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
            {displayScore}%
          </span>
          <button className="btn btn-sm" onClick={loadData} disabled={loading} style={{ padding: '3px 6px' }}>
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="widget-body">
        {innerContent}
      </div>
    </div>
  );
}
