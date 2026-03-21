import { useEffect, useRef, useState } from 'react';
import { Brain, Check, Pause, Play, RefreshCw, Timer, X } from 'lucide-react';
import { getConfig, logTempoTime } from '../utils/api';
import { sendNotification } from '../utils/notifications';

export default function FocusTimerWidget({ trackedTicket, onClearTracked }) {
  const [mode, setMode] = useState('work'); // work | break
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(25 * 60);
  const [sessions, setSessions] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showTempoLog, setShowTempoLog] = useState(false);
  const [tempoTicket, setTempoTicket] = useState('');
  const [tempoNote, setTempoNote] = useState('');
  const [elapsedWork, setElapsedWork] = useState(0); // total work seconds this session
  const [jiraTimerSecs, setJiraTimerSecs] = useState(0);
  const [jiraTimerRunning, setJiraTimerRunning] = useState(false);
  const [jiraNote, setJiraNote] = useState('');
  const intervalRef = useRef(null);
  const jiraIntervalRef = useRef(null);

  const DURATIONS = { work: 25 * 60, break: 5 * 60, longBreak: 15 * 60 };

  // Start JIRA timer when tracked ticket changes
  useEffect(() => {
    if (trackedTicket) { setJiraTimerSecs(0); setJiraTimerRunning(true); setJiraNote(''); }
  }, [trackedTicket?.key]);

  useEffect(() => {
    if (jiraTimerRunning) { jiraIntervalRef.current = setInterval(() => setJiraTimerSecs(s => s + 1), 1000); }
    else { clearInterval(jiraIntervalRef.current); }
    return () => clearInterval(jiraIntervalRef.current);
  }, [jiraTimerRunning]);

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => s - 1);
        if (mode === 'work') setElapsedWork(e => e + 1);
      }, 1000);
    } else if (seconds === 0 && running) {
      clearInterval(intervalRef.current);
      setRunning(false);
      sendNotification(
        mode === 'work' ? 'Focus Session Complete!' : 'Break Over!',
        mode === 'work' ? 'Time for a break.' : 'Ready to focus again?'
      );
      if (mode === 'work') {
        setSessions(s => s + 1);
        setShowTempoLog(true); // Prompt to log time after work session
        const isLong = (sessions + 1) % 4 === 0;
        setMode(isLong ? 'longBreak' : 'break');
        setSeconds(isLong ? DURATIONS.longBreak : DURATIONS.break);
      } else {
        setMode('work');
        setSeconds(DURATIONS.work);
      }
    }
    return () => clearInterval(intervalRef.current);
  }, [running, seconds]);

  const toggle = () => setRunning(!running);
  const reset = () => { setRunning(false); setSeconds(DURATIONS[mode]); };

  const formatTimer = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const formatDuration = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const progress = 1 - (seconds / DURATIONS[mode === 'longBreak' ? 'longBreak' : mode]);

  const handleTempoLog = async () => {
    if (!tempoTicket.trim() || elapsedWork < 60) {
      setShowTempoLog(false);
      return;
    }
    const config = getConfig();
    if (config.tempoToken) {
      const rounded = Math.round(elapsedWork / 60) * 60;
      await logTempoTime(config, {
        issueKey: tempoTicket.trim().toUpperCase(),
        seconds: rounded,
        description: tempoNote || `Pomodoro focus session`,
      });
      sendNotification('Time Logged', `${formatDuration(elapsedWork)} logged to ${tempoTicket.toUpperCase()}`);
    } else {
      sendNotification('Tempo Not Connected', 'Add your Tempo API token in Settings to log time.');
    }
    setShowTempoLog(false);
    setElapsedWork(0);
    setTempoTicket('');
    setTempoNote('');
  };

  const skipTempoLog = () => {
    setShowTempoLog(false);
    setElapsedWork(0);
  };

  const handleJiraLog = async () => {
    if (!trackedTicket || jiraTimerSecs < 60) return;
    const config = getConfig();
    if (config.tempoToken) {
      await logTempoTime(config, { issueKey: trackedTicket.key, seconds: Math.round(jiraTimerSecs / 60) * 60, description: jiraNote || `Tracked time on ${trackedTicket.key}` });
      sendNotification('Time Logged', `${formatDuration(jiraTimerSecs)} logged to ${trackedTicket.key}`);
    } else { sendNotification('Tempo Not Connected', 'Add Tempo token in Settings.'); }
    setJiraTimerRunning(false); setJiraTimerSecs(0); setJiraNote(''); onClearTracked?.();
  };

  const discardJiraTimer = () => {
    setJiraTimerRunning(false); setJiraTimerSecs(0); setJiraNote(''); onClearTracked?.();
  };

  if (fullscreen) {
    return (
      <div className="focus-mode-overlay">
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {mode === 'work' ? 'Focus Time' : mode === 'break' ? 'Short Break' : 'Long Break'}
        </div>
        <div className="focus-timer-big">{formatTimer(seconds)}</div>
        <div style={{ width: 200, height: 3, background: 'var(--bg-input)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: mode === 'work' ? 'var(--accent)' : 'var(--info)', transition: 'width 1s linear' }}></div>
        </div>
        {elapsedWork > 0 && mode === 'work' && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {formatDuration(elapsedWork)} focused
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-accent" onClick={toggle}>{running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Start</>}</button>
          <button className="btn" onClick={reset}><RefreshCw size={14} /> Reset</button>
          <button className="btn" onClick={() => setFullscreen(false)}><X size={14} /> Exit</button>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Sessions today: {sessions}</div>
      </div>
    );
  }

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Timer className="icon" /> Focus Timer</div>
        <span className="badge badge-accent">{sessions} sessions</span>
      </div>
      <div className="widget-body">
        {/* JIRA Ticket Tracker */}
        {trackedTicket && (
          <div style={{ background: 'var(--info-dim)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 12, border: '1px solid rgba(96,165,250,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--info)' }}>{trackedTicket.key}</span>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2, maxWidth: 180, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{trackedTicket.summary}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--info)' }}>{formatTimer(jiraTimerSecs)}</span>
            </div>
            <input type="text" placeholder="Work description..." value={jiraNote} onChange={e => setJiraNote(e.target.value)} style={{ marginBottom: 8, fontSize: '0.8rem' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm" style={{ background: 'var(--info)', color: '#0a0a0f', borderColor: 'var(--info)', fontWeight: 600 }} onClick={handleJiraLog}><Check size={12} /> Log to Tempo</button>
              <button className={`btn btn-sm ${jiraTimerRunning ? '' : 'btn-accent'}`} onClick={() => setJiraTimerRunning(!jiraTimerRunning)}>{jiraTimerRunning ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}</button>
              <button className="btn btn-sm" onClick={discardJiraTimer}>Discard</button>
            </div>
          </div>
        )}

        {/* Tempo Log Prompt */}
        {showTempoLog && (
          <div style={{
            background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)',
            padding: 12, marginBottom: 12, border: '1px solid var(--border-accent)',
          }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>
              Log {formatDuration(elapsedWork)} to Tempo?
            </div>
            <input
              type="text"
              placeholder="JIRA ticket (e.g., PROJ-1234)"
              value={tempoTicket}
              onChange={e => setTempoTicket(e.target.value)}
              style={{ marginBottom: 6, fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
            />
            <input
              type="text"
              placeholder="Work description (optional)"
              value={tempoNote}
              onChange={e => setTempoNote(e.target.value)}
              style={{ marginBottom: 8, fontSize: '0.82rem' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-accent btn-sm" onClick={handleTempoLog}>
                <Check size={12} /> Log Time
              </button>
              <button className="btn btn-sm" onClick={skipTempoLog}>Skip</button>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            {mode === 'work' ? 'Focus' : mode === 'break' ? 'Short Break' : 'Long Break'}
          </div>
          <div className="timer-display">{formatTimer(seconds)}</div>
          <div style={{ width: '100%', height: 3, background: 'var(--bg-input)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, background: mode === 'work' ? 'var(--accent)' : 'var(--info)', transition: 'width 1s linear' }}></div>
          </div>
          {elapsedWork > 0 && mode === 'work' && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
              {formatDuration(elapsedWork)} focused this session
            </div>
          )}
          <div className="timer-controls">
            <button className="btn btn-accent" onClick={toggle}>
              {running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Start</>}
            </button>
            <button className="btn" onClick={reset}><RefreshCw size={14} /></button>
            <button className="btn" onClick={() => setFullscreen(true)}>
              <Brain size={14} /> Focus Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
