import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings, Bell, Clock, CheckSquare, Plus, Play, Pause, Square, Mic, MicOff,
  ExternalLink, Copy, Trash2, ChevronRight, Timer, X, Calendar, Mail,
  Ticket, BarChart3, Linkedin, MessageSquare, Video, Brain, Zap, Check,
  Volume2, AlertCircle, RefreshCw, Search, Type, Send, Globe, ChevronDown,
  LayoutGrid, SkipBack, SkipForward
} from 'lucide-react';
import { transformText, STYLE_NAMES, STYLE_KEYS } from './utils/unicode';
import { loadTasks, saveTasks, loadVoiceNotes, saveVoiceNotes, generateId } from './utils/storage';
import {
  getConfig, saveConfig, fetchJiraTickets, logTempoTime,
  getMockEmails, getMockCalendar, getMockJiraTickets,
  getMockLinkedInData, getMockRescueTimeData, getMockMeetingNotes,
  fetchRescueTimeFull, fetchRescueTimeActivities,
  fetchOutlookEmails, fetchOutlookCalendar
} from './utils/api';
import {
  requestNotificationPermission, sendNotification, scheduleReminder, restoreReminders
} from './utils/notifications';

// Enhanced components
import FocusHeartbeatWidget from './components/FocusHeartbeat';
import EnhancedJiraWidget from './components/EnhancedJira';
import EnhancedCalendarWidget from './components/EnhancedCalendar';
import EnhancedTasksWidget from './components/EnhancedTasks';
import WorldTimezoneWidget from './components/WorldTimezone';
import PinnedEmailWidget from './components/PinnedEmail';
import SpotifyWidget from './components/SpotifyWidget';
import HubWidget from './components/HubWidget';

// ═══════════════════════════════════════════
// WIDGET: Daily Tasks
// ═══════════════════════════════════════════

function TasksWidget() {
  const [tasks, setTasks] = useState(loadTasks);
  const [newTask, setNewTask] = useState('');
  const [reminderTask, setReminderTask] = useState(null);
  const [reminderTime, setReminderTime] = useState('');

  useEffect(() => { saveTasks(tasks); }, [tasks]);

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks(prev => [...prev, { id: generateId(), text: newTask.trim(), done: false, created: Date.now() }]);
    setNewTask('');
  };

  const toggleTask = (id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const deleteTask = (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const setReminder = (task) => {
    if (!reminderTime) return;
    scheduleReminder(`Task Reminder`, task.text, reminderTime, task.id);
    sendNotification('Reminder Set', `You'll be reminded about: ${task.text}`);
    setReminderTask(null);
    setReminderTime('');
  };

  const active = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><CheckSquare className="icon" /> Tasks</div>
        <span className="badge badge-accent">{active.length} active</span>
      </div>
      <div className="widget-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Add a task..."
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
          />
          <button className="btn btn-accent btn-sm" onClick={addTask}><Plus size={14} /></button>
        </div>

        {active.map(t => (
          <div className="task-item" key={t.id}>
            <button className="task-check" onClick={() => toggleTask(t.id)}></button>
            <div style={{ flex: 1 }}>
              <div className="task-text">{t.text}</div>
            </div>
            <button className="btn btn-icon btn-sm" title="Set reminder" onClick={() => setReminderTask(t.id === reminderTask ? null : t.id)}>
              <Bell size={12} />
            </button>
            <button className="btn btn-icon btn-sm" onClick={() => deleteTask(t.id)}>
              <Trash2 size={12} />
            </button>
            {reminderTask === t.id && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'absolute', right: 0, bottom: -36, background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', zIndex: 10 }}>
                <input type="datetime-local" value={reminderTime} onChange={e => setReminderTime(e.target.value)} style={{ fontSize: '0.75rem', padding: '4px 6px' }} />
                <button className="btn btn-accent btn-sm" onClick={() => setReminder(t)}>Set</button>
              </div>
            )}
          </div>
        ))}

        {completed.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 6 }}>
              {completed.length} completed
            </summary>
            {completed.map(t => (
              <div className="task-item" key={t.id}>
                <button className="task-check done" onClick={() => toggleTask(t.id)}>
                  <Check size={12} />
                </button>
                <div className="task-text done" style={{ flex: 1 }}>{t.text}</div>
                <button className="btn btn-icon btn-sm" onClick={() => deleteTask(t.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: JIRA Tickets + Tempo Time Logging
// ═══════════════════════════════════════════

function JiraWidget() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [logNote, setLogNote] = useState('');
  const timerRef = useRef(null);
  const config = getConfig();
  const isConfigured = config.jiraHost && config.jiraEmail && config.jiraToken;

  useEffect(() => {
    if (isConfigured) {
      loadTickets();
    } else {
      setTickets(getMockJiraTickets());
    }
  }, []);

  useEffect(() => {
    if (activeTimer) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [activeTimer]);

  const loadTickets = async () => {
    setLoading(true);
    const data = await fetchJiraTickets(config);
    setTickets(data || getMockJiraTickets());
    setLoading(false);
  };

  const startTimer = (key) => {
    if (activeTimer === key) {
      // Stop timer, offer to log
      setActiveTimer(null);
      return;
    }
    setActiveTimer(key);
    setTimerSeconds(0);
  };

  const logTime = async (key) => {
    if (timerSeconds < 60) return;
    const rounded = Math.round(timerSeconds / 60) * 60;
    if (config.tempoToken) {
      await logTempoTime(config, {
        issueKey: key,
        seconds: rounded,
        description: logNote,
      });
    }
    sendNotification('Time Logged', `${formatDuration(timerSeconds)} logged to ${key}`);
    setActiveTimer(null);
    setTimerSeconds(0);
    setLogNote('');
  };

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${sec.toString().padStart(2, '0')}s`;
  };

  const getPriorityColor = (p) => {
    if (p === 'Critical' || p === 'Highest') return 'var(--danger)';
    if (p === 'High') return 'var(--warning)';
    if (p === 'Medium') return 'var(--info)';
    return 'var(--text-muted)';
  };

  const getStatusBadge = (status, cat) => {
    if (cat === 'done') return 'badge-accent';
    if (cat === 'indeterminate') return 'badge-info';
    return 'badge-purple';
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Ticket className="icon" /> JIRA {!isConfigured && <span className="badge badge-warning">Demo</span>}</div>
        <button className="btn btn-sm" onClick={loadTickets} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>
      <div className="widget-body">
        {activeTimer && (
          <div style={{ background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 12, border: '1px solid var(--border-accent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent)' }}>{activeTimer}</span>
              <span className="timer-display" style={{ fontSize: '1.4rem', padding: 0 }}>{formatDuration(timerSeconds)}</span>
            </div>
            <input type="text" placeholder="Work description..." value={logNote} onChange={e => setLogNote(e.target.value)} style={{ marginBottom: 8, fontSize: '0.8rem' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-accent btn-sm" onClick={() => logTime(activeTimer)}>Log Time</button>
              <button className="btn btn-sm" onClick={() => { setActiveTimer(null); setTimerSeconds(0); }}>Discard</button>
            </div>
          </div>
        )}

        {tickets.map(t => (
          <div className="ticket" key={t.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="ticket-key">{t.key}</span>
              <span className={`badge ${getStatusBadge(t.status, t.statusCategory)}`}>{t.status}</span>
            </div>
            <div className="ticket-summary">{t.summary}</div>
            <div className="ticket-footer">
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: getPriorityColor(t.priority) }}></span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.priority} · {t.type}</span>
              </div>
              <button
                className={`btn btn-sm ${activeTimer === t.key ? 'btn-accent' : ''}`}
                onClick={() => startTimer(t.key)}
              >
                {activeTimer === t.key ? <><Pause size={11} /> Stop</> : <><Play size={11} /> Track</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: Outlook Email + Calendar
// ═══════════════════════════════════════════

function OutlookWidget() {
  const [tab, setTab] = useState('calendar');
  const [emails, setEmails] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const config = getConfig();
  const isConfigured = !!config.msGraphToken || !!config.msGraphRefreshToken;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const cfg = getConfig();
    if (!cfg.msGraphToken && !cfg.msGraphRefreshToken) {
      setEmails(getMockEmails());
      setEvents(getMockCalendar());
      return;
    }
    setLoading(true);
    const [emailData, calData] = await Promise.all([
      fetchOutlookEmails(cfg),
      fetchOutlookCalendar(cfg),
    ]);
    if (emailData) {
      setEmails(emailData.map(e => ({
        from: e.from?.emailAddress?.name || e.from?.emailAddress?.address || 'Unknown',
        subject: e.subject,
        preview: e.bodyPreview,
        time: new Date(e.receivedDateTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
        isRead: e.isRead,
      })));
    } else { setEmails(getMockEmails()); }
    if (calData) {
      setEvents(calData.map(e => ({
        title: e.subject,
        time: new Date(e.start?.dateTime + 'Z').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        duration: '',
        location: e.location?.displayName || '',
        color: 'var(--info)',
      })));
    } else { setEvents(getMockCalendar()); }
    setLoading(false);
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">{tab === 'email' ? <Mail className="icon" /> : <Calendar className="icon" />} Outlook {!isConfigured && <span className="badge badge-warning">Demo</span>}</div>
        <button className="btn btn-sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="widget-body">
        <div className="tab-bar">
          <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>Calendar</button>
          <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>Inbox</button>
        </div>

        {tab === 'calendar' && events.map((e, i) => (
          <div className="calendar-event" key={i}>
            <div className="calendar-time-block">{e.time}<br /><span style={{ opacity: 0.5 }}>{e.duration}</span></div>
            <div className="calendar-event-bar" style={{ background: e.color }}></div>
            <div className="calendar-event-details">
              <div className="calendar-event-title">{e.title}</div>
              <div className="calendar-event-location">{e.location}</div>
            </div>
          </div>
        ))}

        {tab === 'email' && emails.map((e, i) => (
          <div className="email-item" key={i}>
            <div className="email-from">
              <span style={{ color: e.isRead ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{e.from}</span>
              <span className="email-time">{e.time}</span>
            </div>
            <div className="email-subject" style={{ fontWeight: e.isRead ? 400 : 600 }}>{e.subject}</div>
            <div className="email-preview">{e.preview}</div>
          </div>
        ))}

        {!isConfigured && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--warning-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--warning)' }}>
            <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Connect Microsoft Graph API in Settings for live data
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: RescueTime Productivity
// ═══════════════════════════════════════════

function RescueTimeWidget() {
  const [view, setView] = useState('activities');
  const [activities, setActivities] = useState(null);
  const [productivity, setProductivity] = useState(null);
  const [score, setScore] = useState(null);
  const [totalHours, setTotalHours] = useState(null);
  const [loading, setLoading] = useState(false);
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
    if (!isConfigured) return;
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

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><BarChart3 className="icon" /> Productivity {!isConfigured && <span className="badge badge-warning">Demo</span>}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: displayScore >= 70 ? 'var(--accent)' : displayScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
            {displayScore}%
          </span>
          <button className="btn btn-sm" onClick={loadData} disabled={loading} style={{ padding: '3px 6px' }}>
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="widget-body">
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Today: {displayTotal}h tracked</div>
        </div>
        <div className="tab-bar">
          <button className={view === 'activities' ? 'active' : ''} onClick={() => setView('activities')}>Activities</button>
          <button className={view === 'productivity' ? 'active' : ''} onClick={() => setView('productivity')}>Productivity</button>
        </div>
        <div className="productivity-bar-group">
          {data.map((cat, i) => (
            <div className="productivity-bar-row" key={`${view}-${i}`}>
              <div className="productivity-bar-label">{cat.name}</div>
              <div className="productivity-bar-track">
                <div className="productivity-bar-fill" style={{ width: `${(cat.hours / maxHours) * 100}%`, background: cat.color }}></div>
              </div>
              <div className="productivity-bar-value" style={{ color: cat.color }}>{cat.hours}h</div>
            </div>
          ))}
        </div>
        {!isConfigured && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--accent)' }}>
            <Zap size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Add your RescueTime API key in Settings for real data
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: LinkedIn Tracking
// ═══════════════════════════════════════════

function LinkedInWidget() {
  const [tab, setTab] = useState('posts');
  const data = getMockLinkedInData();

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Linkedin className="icon" /> LinkedIn <span className="badge badge-warning">Demo</span></div>
      </div>
      <div className="widget-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>{data.profileViews}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Profile Views</div>
          </div>
          <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>{data.searchAppearances}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Searches</div>
          </div>
          <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>{data.connectionRequests}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Requests</div>
          </div>
        </div>

        <div className="tab-bar">
          <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>Posts</button>
          <button className={tab === 'ads' ? 'active' : ''} onClick={() => setTab('ads')}>Ad Campaigns</button>
        </div>

        {tab === 'posts' && data.posts.map((p, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.title}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span>{p.impressions.toLocaleString()} views</span>
              <span>{p.likes} likes</span>
              <span>{p.comments} comments</span>
              <span>{p.date}</span>
            </div>
          </div>
        ))}

        {tab === 'ads' && data.adCampaigns.map((c, i) => (
          <div key={i} style={{ padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', marginBottom: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.name}</span>
              <span className="badge badge-accent">{c.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              <span>${c.spend}</span>
              <span>{c.impressions.toLocaleString()} imp</span>
              <span>{c.clicks.toLocaleString()} clicks</span>
              <span>CTR {c.ctr}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: Unicode Text Generator
// ═══════════════════════════════════════════

function UnicodeWidget() {
  const [input, setInput] = useState('');
  const [style, setStyle] = useState('bold');
  const [copied, setCopied] = useState(false);
  const output = transformText(input, style);

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Type className="icon" /> Unicode Text</div>
      </div>
      <div className="widget-body">
        <input
          type="text"
          placeholder="Type text to transform..."
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div className="unicode-grid">
          {STYLE_KEYS.map(k => (
            <button
              key={k}
              className={`unicode-style-btn ${style === k ? 'active' : ''}`}
              onClick={() => setStyle(k)}
            >
              {STYLE_NAMES[k]}
            </button>
          ))}
        </div>
        {input && (
          <>
            <div className="unicode-output">{output}</div>
            <button className="btn btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={copyOutput}>
              {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy to Clipboard</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: Quick Launch (Claude, ChatGPT, etc.)
// ═══════════════════════════════════════════

const DEFAULT_LAUNCHES = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new', icon: '◈', bg: 'linear-gradient(135deg, #d4a574, #c9956c)' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com/', icon: '◆', bg: 'linear-gradient(135deg, #74aa9c, #5a9a8c)' },
  { id: 'jira', name: 'JIRA Board', url: 'https://atlassian.net', icon: '▣', bg: 'linear-gradient(135deg, #2684ff, #0065ff)' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/feed/', icon: '▪', bg: 'linear-gradient(135deg, #0a66c2, #004182)' },
  { id: 'rescuetime', name: 'RescueTime', url: 'https://www.rescuetime.com/dashboard', icon: '⏱', bg: 'linear-gradient(135deg, #5a8dee, #3f6fd8)' },
];

function loadLaunches() {
  try { const s = JSON.parse(localStorage.getItem('cmd_launches')); return Array.isArray(s) && s.length > 0 ? s : DEFAULT_LAUNCHES; }
  catch { return DEFAULT_LAUNCHES; }
}
function saveLaunches(l) { localStorage.setItem('cmd_launches', JSON.stringify(l)); }

function QuickLaunchWidget() {
  const [launches, setLaunches] = useState(loadLaunches);
  const [editing, setEditing] = useState(false);
  const [editItem, setEditItem] = useState(null); // null = not editing, 'new' = adding, or id

  useEffect(() => { saveLaunches(launches); }, [launches]);

  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formIcon, setFormIcon] = useState('⬡');
  const [formBg, setFormBg] = useState('linear-gradient(135deg, #6ee7b7, #34d399)');

  const BG_PRESETS = [
    'linear-gradient(135deg, #6ee7b7, #34d399)',
    'linear-gradient(135deg, #60a5fa, #3b82f6)',
    'linear-gradient(135deg, #f87171, #ef4444)',
    'linear-gradient(135deg, #fbbf24, #f59e0b)',
    'linear-gradient(135deg, #a78bfa, #8b5cf6)',
    'linear-gradient(135deg, #fb923c, #f97316)',
    'linear-gradient(135deg, #d4a574, #c9956c)',
    'linear-gradient(135deg, #74aa9c, #5a9a8c)',
  ];

  const startAdd = () => {
    setEditItem('new');
    setFormName(''); setFormUrl('https://'); setFormIcon('⬡'); setFormBg(BG_PRESETS[0]);
  };
  const startEdit = (item) => {
    setEditItem(item.id);
    setFormName(item.name); setFormUrl(item.url); setFormIcon(item.icon); setFormBg(item.bg);
  };
  const cancelEdit = () => setEditItem(null);

  const ICON_PICKS = ['◈','◆','▣','▪','⏱','⬡','★','♦','●','◎','⚡','🔗','🌐','📊','📧','💬','📝','🔍','🎯','💡','🏠','📁','🛠','🎨','📱','🖥','☁️','🔒','📈','🗂'];

  const saveItem = () => {
    if (!formName.trim() || !formUrl.trim()) return;
    if (editItem === 'new') {
      setLaunches(prev => [...prev, { id: Date.now().toString(36), name: formName.trim(), url: formUrl.trim(), icon: formIcon, bg: formBg }]);
    } else {
      setLaunches(prev => prev.map(l => l.id === editItem ? { ...l, name: formName.trim(), url: formUrl.trim(), icon: formIcon, bg: formBg } : l));
    }
    setEditItem(null);
  };

  const removeItem = (id) => setLaunches(prev => prev.filter(l => l.id !== id));

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Zap className="icon" /> Quick Launch</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn btn-sm ${editing ? 'btn-accent' : ''}`} onClick={() => { setEditing(!editing); setEditItem(null); }}>
            {editing ? <><Check size={11} /> Done</> : <><Settings size={11} /></>}
          </button>
        </div>
      </div>
      <div className="widget-body">
        {/* Edit/Add form */}
        {editItem && (
          <div style={{ padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-accent)', marginBottom: 10 }}>
            <input type="text" placeholder="Name" value={formName} onChange={e => setFormName(e.target.value)} style={{ marginBottom: 6, fontSize: '0.82rem' }} />
            <input type="url" placeholder="URL (https://...)" value={formUrl} onChange={e => setFormUrl(e.target.value)} style={{ marginBottom: 6, fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }} />
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Icon:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {ICON_PICKS.map((ic, i) => (
                  <button key={i} onClick={() => setFormIcon(ic)} style={{
                    width: 30, height: 30, borderRadius: 4, border: `1px solid ${formIcon === ic ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    background: formIcon === ic ? 'var(--accent-dim)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{ic}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Color:</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {BG_PRESETS.map((bg, i) => (
                  <div key={i} onClick={() => setFormBg(bg)} style={{
                    width: 24, height: 24, borderRadius: 4, background: bg, cursor: 'pointer',
                    border: formBg === bg ? '2px solid white' : '2px solid transparent',
                  }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-accent btn-sm" onClick={saveItem}><Check size={11} /> {editItem === 'new' ? 'Add' : 'Save'}</button>
              <button className="btn btn-sm" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}

        <div className="launch-grid">
          {launches.map(l => (
            <div key={l.id} style={{ position: 'relative' }}>
              <a
                className="launch-card"
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => {
                  if (editing) { e.preventDefault(); startEdit(l); return; }
                  if (l.url.includes('atlassian.net') || l.url === '#') {
                    e.preventDefault();
                    const cfg = getConfig();
                    if (cfg.jiraHost) window.open(`https://${cfg.jiraHost}`, '_blank');
                  }
                }}
              >
                <div className="icon-wrap" style={{ background: l.bg, borderRadius: 'var(--radius-md)', color: 'white', fontSize: '1.3rem' }}>
                  {l.icon}
                </div>
                <span>{l.name}</span>
              </a>
              {editing && (
                <button onClick={() => removeItem(l.id)} style={{
                  position: 'absolute', top: 4, right: 4, width: 20, height: 20,
                  borderRadius: '50%', background: 'var(--danger)', border: 'none',
                  color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem',
                }}>✕</button>
              )}
            </div>
          ))}
          {editing && (
            <button className="launch-card" onClick={startAdd} style={{ border: '2px dashed var(--border-default)', background: 'transparent' }}>
              <Plus size={20} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Add Link</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: Voice Notes
// ═══════════════════════════════════════════

function VoiceNotesWidget() {
  const [notes, setNotes] = useState(loadVoiceNotes);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => { saveVoiceNotes(notes); }, [notes]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      chunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => chunks.current.push(e.data);
      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const newNote = {
          id: generateId(),
          url,
          date: new Date().toLocaleString(),
          duration: recordingTime,
        };
        setNotes(prev => [newNote, ...prev]);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.current.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      sendNotification('Error', 'Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    setRecording(false);
    clearInterval(timerRef.current);
  };

  const deleteNote = (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Mic className="icon" /> Voice Notes</div>
        <span className="badge badge-accent">{notes.length}</span>
      </div>
      <div className="widget-body">
        <div className="voice-recording">
          <button
            className={`voice-btn ${recording ? 'recording' : ''}`}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? <Square size={22} /> : <Mic size={22} />}
          </button>
          {recording && (
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
              {formatTime(recordingTime)}
            </span>
          )}
        </div>

        <div className="voice-notes-list" style={{ marginTop: 12 }}>
          {notes.map(n => (
            <div className="voice-note-item" key={n.id}>
              <button className="btn btn-icon btn-sm" onClick={() => new Audio(n.url).play()}>
                <Volume2 size={14} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{n.date}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatTime(n.duration)}</div>
              </div>
              <button className="btn btn-icon btn-sm" onClick={() => deleteNote(n.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {notes.length === 0 && (
            <div style={{ textAlign: 'center', padding: 16, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Tap the mic to record a note
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: Meeting Notes (WebEx / Teams)
// ═══════════════════════════════════════════

function MeetingNotesWidget() {
  const notes = getMockMeetingNotes();

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Video className="icon" /> Meeting Notes <span className="badge badge-warning">Demo</span></div>
      </div>
      <div className="widget-body">
        {notes.map((n, i) => (
          <div className="meeting-note" key={i}>
            <div className="meeting-note-title">
              <span className={`badge ${n.platform === 'Teams' ? 'badge-purple' : 'badge-info'}`} style={{ fontSize: '0.65rem' }}>{n.platform}</span>
              {n.title}
            </div>
            <div className="meeting-note-meta">{n.date} · {n.duration}</div>
            <div className="meeting-note-body">{n.summary}</div>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: 10, background: 'var(--purple-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--purple)' }}>
          <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Connect Microsoft Graph (Teams) and WebEx API in Settings for auto-imported meeting notes
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET: Focus Timer (Pomodoro)
// ═══════════════════════════════════════════

function FocusTimerWidget({ trackedTicket, onClearTracked }) {
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

// ═══════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════

function SettingsPanel({ onClose }) {
  const [config, setConfig] = useState(getConfig);
  const [saved, setSaved] = useState(false);

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  return (
    <div className="settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Settings</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="settings-section">
          <h3>JIRA / Atlassian</h3>
          <div className="settings-field">
            <label>JIRA Host (e.g., mycompany.atlassian.net)</label>
            <input type="text" value={config.jiraHost || ''} onChange={e => update('jiraHost', e.target.value)} placeholder="company.atlassian.net" />
          </div>
          <div className="settings-field">
            <label>Email</label>
            <input type="text" value={config.jiraEmail || ''} onChange={e => update('jiraEmail', e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="settings-field">
            <label>API Token</label>
            <input type="password" value={config.jiraToken || ''} onChange={e => update('jiraToken', e.target.value)} placeholder="Atlassian API token" />
          </div>
          <div className="settings-field">
            <label>JQL Filter (optional)</label>
            <input type="text" value={config.jiraJQL || ''} onChange={e => update('jiraJQL', e.target.value)} placeholder="assignee=currentUser() AND status!=Done" />
          </div>
          <div className="settings-field">
            <label>Account ID (for Tempo)</label>
            <input type="text" value={config.jiraAccountId || ''} onChange={e => update('jiraAccountId', e.target.value)} placeholder="Atlassian Account ID" />
          </div>
        </div>

        <div className="settings-section">
          <h3>Tempo</h3>
          <div className="settings-field">
            <label>API Token</label>
            <input type="password" value={config.tempoToken || ''} onChange={e => update('tempoToken', e.target.value)} placeholder="Tempo API token" />
          </div>
        </div>

        <div className="settings-section">
          <h3>Microsoft Graph (Outlook / Teams)</h3>
          <div className="settings-field">
            <label>Access Token</label>
            <input type="password" value={config.msGraphToken || ''} onChange={e => update('msGraphToken', e.target.value)} placeholder="MS Graph access token" />
          </div>
          <div className="settings-field">
            <label>Refresh Token <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>(enables auto-refresh)</span></label>
            <input type="password" value={config.msGraphRefreshToken || ''} onChange={e => update('msGraphRefreshToken', e.target.value)} placeholder="MS Graph refresh token" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            <a href="https://login.microsoftonline.com/441cb3eb-b496-45de-8460-c359a63b5805/oauth2/v2.0/authorize?client_id=b893ab07-78ef-434f-b5b3-a22b1fd471cb&response_type=code&redirect_uri=https%3A%2F%2Fcommand-center-matthew-nyes-projects.vercel.app%2Fapi%2Fms-callback&scope=Mail.Read%20Calendars.Read%20User.Read%20offline_access" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>Click here to authorize Microsoft</a> — copy both tokens. With a refresh token, your connection stays active permanently.
          </div>
        </div>

        <div className="settings-section">
          <h3>RescueTime</h3>
          <div className="settings-field">
            <label>API Key</label>
            <input type="password" value={config.rescueTimeKey || ''} onChange={e => update('rescueTimeKey', e.target.value)} placeholder="RescueTime API key" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Get your key from <a href="https://www.rescuetime.com/anapi/manage" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>rescuetime.com/anapi/manage</a>
          </div>
        </div>

        <div className="settings-section">
          <h3>LinkedIn</h3>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            LinkedIn API requires a backend server for OAuth. See the deployment guide for instructions on setting up a lightweight proxy for LinkedIn data access.
          </div>
        </div>

        <div className="settings-section">
          <h3>WebEx</h3>
          <div className="settings-field">
            <label>Access Token</label>
            <input type="password" value={config.webexToken || ''} onChange={e => update('webexToken', e.target.value)} placeholder="WebEx API token" />
          </div>
        </div>

        <div className="settings-section">
          <h3>Spotify</h3>
          <div className="settings-field">
            <label>Access Token</label>
            <input type="password" value={config.spotifyToken || ''} onChange={e => update('spotifyToken', e.target.value)} placeholder="Spotify access token" />
          </div>
          <div className="settings-field">
            <label>Refresh Token <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>(enables auto-refresh)</span></label>
            <input type="password" value={config.spotifyRefreshToken || ''} onChange={e => update('spotifyRefreshToken', e.target.value)} placeholder="Spotify refresh token" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            <a href="https://accounts.spotify.com/authorize?client_id=70b2166f84e848da990042db762796bf&response_type=code&redirect_uri=https%3A%2F%2Fcommand-center-matthew-nyes-projects.vercel.app%2Fapi%2Fspotify-callback&scope=user-read-playback-state%20user-modify-playback-state%20user-read-currently-playing%20playlist-read-private%20playlist-read-collaborative%20user-top-read" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>Click here to authorize Spotify</a> — copy both tokens from the result page. With a refresh token, your connection stays active permanently.
          </div>
        </div>

        <div className="settings-section">
          <h3>Notifications</h3>
          <button className="btn" onClick={async () => {
            const granted = await requestNotificationPermission();
            if (granted) sendNotification('Notifications Enabled', 'You will receive task reminders and timer alerts.');
          }}>
            <Bell size={14} /> Enable Notifications
          </button>
        </div>

        <div className="settings-section">
          <h3>Export / Import Configuration</h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            Export all settings, JIRA lists, tasks, quick launch links, widget layout, and timezones. Import on another device to sync your setup.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => {
              const exportData = {};
              const keys = ['cmd_config', 'cmd_tasks', 'cmd_voice_notes', 'cmd_jira_lists', 'cmd_launches',
                'cmd_widget_visibility', 'cmd_widget_order', 'cmd_timezones', 'cmd_reminders'];
              keys.forEach(k => { const v = localStorage.getItem(k); if (v) exportData[k] = v; });
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `command-center-config-${new Date().toISOString().split('T')[0]}.json`;
              a.click(); URL.revokeObjectURL(url);
              sendNotification('Config Exported', 'Configuration file downloaded.');
            }}>
              Export Settings
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Import Settings
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const data = JSON.parse(ev.target.result);
                    let count = 0;
                    Object.entries(data).forEach(([key, value]) => {
                      if (key.startsWith('cmd_')) {
                        localStorage.setItem(key, value);
                        count++;
                      }
                    });
                    // Reload config into state
                    const newConfig = JSON.parse(localStorage.getItem('cmd_config') || '{}');
                    Object.keys(newConfig).forEach(k => update(k, newConfig[k]));
                    sendNotification('Config Imported', `${count} settings restored. Refresh the page to apply all changes.`);
                  } catch (err) {
                    sendNotification('Import Failed', 'Invalid configuration file.');
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }} />
            </label>
          </div>
        </div>

        <button className="btn btn-accent" style={{ width: '100%', marginTop: 8, padding: '10px 16px' }} onClick={handleSave}>
          {saved ? <><Check size={14} /> Saved!</> : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// WIDGET REGISTRY & VISIBILITY
// ═══════════════════════════════════════════

const WIDGET_REGISTRY = [
  { id: 'heartbeat',   label: 'Focus Heartbeat',   icon: '💓', component: FocusHeartbeatWidget },
  { id: 'hub',         label: 'Tasks / Calendar / Voice', icon: '📋', component: HubWidget },
  { id: 'jira',        label: 'JIRA Tickets',      icon: '🎫', component: EnhancedJiraWidget },
  { id: 'timer',       label: 'Focus Timer',       icon: '⏱️', component: FocusTimerWidget },
  { id: 'timezones',   label: 'World Clock',       icon: '🌍', component: WorldTimezoneWidget },
  { id: 'pinned',      label: 'Pinned Emails',     icon: '📌', component: PinnedEmailWidget },
  { id: 'spotify',     label: 'Music',           icon: '🎵', component: SpotifyWidget },
  { id: 'rescuetime',  label: 'Productivity',      icon: '📊', component: RescueTimeWidget },
  { id: 'launch',      label: 'Quick Launch',      icon: '🚀', component: QuickLaunchWidget },
  { id: 'unicode',     label: 'Unicode Text',      icon: '🔤', component: UnicodeWidget },
  { id: 'linkedin',    label: 'LinkedIn',          icon: '💼', component: LinkedInWidget },
  { id: 'meetings',    label: 'Meeting Notes',     icon: '🎥', component: MeetingNotesWidget },
  { id: 'outlook',     label: 'Outlook',           icon: '📧', component: OutlookWidget },
];

const DEFAULT_VISIBLE = WIDGET_REGISTRY.map(w => w.id);

function loadWidgetVisibility() {
  try {
    const saved = JSON.parse(localStorage.getItem('cmd_widget_visibility'));
    if (Array.isArray(saved)) return saved;
  } catch {}
  return DEFAULT_VISIBLE;
}

function saveWidgetVisibility(visible) {
  localStorage.setItem('cmd_widget_visibility', JSON.stringify(visible));
}

function loadWidgetOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem('cmd_widget_order'));
    if (Array.isArray(saved)) return saved;
  } catch {}
  return WIDGET_REGISTRY.map(w => w.id);
}

function saveWidgetOrder(order) {
  localStorage.setItem('cmd_widget_order', JSON.stringify(order));
}

// ═══════════════════════════════════════════
// EDIT MODE PANEL
// ═══════════════════════════════════════════

function EditModeBar({ visible, order, onToggle, onReorder, onClose }) {
  const [dragItem, setDragItem] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const handleDragStart = (id) => setDragItem(id);
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOver(id); };
  const handleDrop = (targetId) => {
    if (!dragItem || dragItem === targetId) { setDragItem(null); setDragOver(null); return; }
    const newOrder = [...order];
    const fromIdx = newOrder.indexOf(dragItem);
    const toIdx = newOrder.indexOf(targetId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragItem);
    onReorder(newOrder);
    setDragItem(null); setDragOver(null);
  };

  const exportConfig = () => {
    const exportData = {};
    const keys = ['cmd_config', 'cmd_tasks', 'cmd_voice_notes', 'cmd_jira_lists', 'cmd_launches',
      'cmd_widget_visibility', 'cmd_widget_order', 'cmd_timezones', 'cmd_reminders'];
    keys.forEach(k => { const v = localStorage.getItem(k); if (v) exportData[k] = v; });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `command-center-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importConfig = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        Object.entries(data).forEach(([key, value]) => { if (key.startsWith('cmd_')) localStorage.setItem(key, value); });
        window.location.reload();
      } catch { alert('Invalid configuration file.'); }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{
      position: 'sticky', top: 52, zIndex: 90,
      background: 'rgba(30, 30, 46, 0.95)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-accent)', padding: '12px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1rem' }}>⚙️</span> Edit Layout
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Drag to reorder · Click toggle to show/hide</span>
        </div>
        <button className="btn btn-accent btn-sm" onClick={onClose}>Done</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
        {order.map((id) => {
          const widget = WIDGET_REGISTRY.find(w => w.id === id);
          if (!widget) return null;
          const isVisible = visible.includes(id);
          const isDragging = dragItem === id;
          const isOver = dragOver === id;
          return (
            <div key={id}
              draggable
              onDragStart={() => handleDragStart(id)}
              onDragOver={(e) => handleDragOver(e, id)}
              onDrop={() => handleDrop(id)}
              onDragEnd={() => { setDragItem(null); setDragOver(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                background: isOver ? 'var(--accent-dim)' : isVisible ? 'rgba(110,231,183,0.06)' : 'var(--bg-input)',
                border: `1px solid ${isOver ? 'var(--accent)' : isVisible ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                cursor: 'grab', transition: 'all 0.15s',
                opacity: isDragging ? 0.4 : isVisible ? 1 : 0.5,
                transform: isOver ? 'scale(1.02)' : 'none',
              }}
            >
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'grab' }}>⠿</span>
              {/* Toggle */}
              <div onClick={(e) => { e.stopPropagation(); onToggle(id); }} style={{
                width: 32, height: 18, borderRadius: 9,
                background: isVisible ? 'var(--accent)' : 'var(--bg-elevated)',
                border: `1px solid ${isVisible ? 'var(--accent)' : 'var(--border-default)'}`,
                position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'all 0.2s',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: isVisible ? '#0a0a0f' : 'var(--text-muted)',
                  position: 'absolute', top: 1, left: isVisible ? 16 : 1, transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: '0.82rem' }}>{widget.icon}</span>
              <span style={{
                fontSize: '0.75rem', fontWeight: 500,
                color: isVisible ? 'var(--text-primary)' : 'var(--text-muted)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{widget.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={exportConfig} style={{ fontSize: '0.72rem' }}>Export All Settings</button>
          <label className="btn btn-sm" style={{ fontSize: '0.72rem', cursor: 'pointer' }}>
            Import Settings
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={importConfig} />
          </label>
        </div>
        <button className="btn btn-sm" onClick={() => {
          onReorder(WIDGET_REGISTRY.map(w => w.id));
          DEFAULT_VISIBLE.forEach(id => { if (!visible.includes(id)) onToggle(id); });
        }} style={{ fontSize: '0.72rem' }}>Reset to Default</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [time, setTime] = useState(new Date());
  const [visibleWidgets, setVisibleWidgets] = useState(loadWidgetVisibility);
  const [widgetOrder, setWidgetOrder] = useState(loadWidgetOrder);

  // Shared JIRA tracking state — bridges JIRA widget → Focus Timer
  const [trackedTicket, setTrackedTicket] = useState(null); // { key, summary }
  // Spotify now playing — for header player bar
  const [spotifyNowPlaying, setSpotifyNowPlaying] = useState(null);
  const [spotifyControls, setSpotifyControls] = useState(null); // { toggle, next, prev }

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
    .filter(Boolean);

  // Props to inject per widget
  const widgetProps = {
    jira: { onTrackTicket: setTrackedTicket },
    timer: { trackedTicket, onClearTracked: () => setTrackedTicket(null) },
    spotify: { onNowPlaying: setSpotifyNowPlaying, onControls: setSpotifyControls },
  };

  return (
    <div className="app">
      {/* Spotify Player Bar — above header */}
      {spotifyNowPlaying?.name && (
        <div style={{
          background: '#191414', borderBottom: '1px solid rgba(29,185,84,0.2)',
          height: 32, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
        }}>
          {/* Controls */}
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
          {/* Song info with marquee */}
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
          {/* Progress */}
          {spotifyNowPlaying.duration > 0 && (
            <div style={{ width: 60, height: 3, background: '#333', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${(spotifyNowPlaying.progress / spotifyNowPlaying.duration) * 100}%`, background: '#1DB954', borderRadius: 2, transition: 'width 1s linear' }} />
            </div>
          )}
          <style>{`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
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
    </div>
  );
}
