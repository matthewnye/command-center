import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Ticket, ChevronRight, Plus, Trash2, Play, Pause, RefreshCw,
  MessageSquare, Send, X, Clock, ArrowUp, ArrowDown, Minus,
  Edit3, Check, GripVertical, User, Search
} from 'lucide-react';
import {
  getConfig, fetchJiraTickets, logTempoTime, postJiraComment,
  getJiraLists, saveJiraLists, DEFAULT_JIRA_LISTS, getMockJiraTickets
} from '../utils/api';
import { sendNotification } from '../utils/notifications';

const PRIORITY_ICONS = {
  Critical: { icon: ArrowUp, color: 'var(--danger)', double: true },
  Highest: { icon: ArrowUp, color: 'var(--danger)' },
  High: { icon: ArrowUp, color: 'var(--warning)' },
  Medium: { icon: Minus, color: 'var(--info)' },
  Low: { icon: ArrowDown, color: 'var(--text-muted)' },
  Lowest: { icon: ArrowDown, color: 'var(--text-muted)' },
};

function getStatusStyle(status) {
  const map = {
    'To Do': { color: 'var(--purple)', bg: 'var(--purple-dim)' },
    'In Progress': { color: 'var(--info)', bg: 'var(--info-dim)' },
    'In Review': { color: 'var(--warning)', bg: 'var(--warning-dim)' },
    'Done': { color: 'var(--accent)', bg: 'var(--accent-dim)' },
  };
  return map[status] || { color: 'var(--text-muted)', bg: 'var(--bg-input)' };
}

function PriorityIcon({ priority }) {
  const p = PRIORITY_ICONS[priority];
  if (!p) return null;
  const Icon = p.icon;
  return <span style={{ display: 'inline-flex', color: p.color }}><Icon size={12} />{p.double && <Icon size={12} style={{ marginLeft: -6 }} />}</span>;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec.toString().padStart(2, '0')}s`;
}

// ═══════════════════════════════════════════
// INLINE COMMENT FORM
// ═══════════════════════════════════════════

function InlineCommentForm({ issueKey, onClose, onSent }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const config = getConfig();
    const result = await postJiraComment(config, issueKey, text.trim(), true);
    setSending(false);
    if (result) {
      sendNotification('Comment Posted', `Customer-facing comment added to ${issueKey}`);
      onSent?.();
      onClose();
    } else {
      sendNotification('Comment Failed', `Could not post comment to ${issueKey}. Check your JIRA credentials.`);
    }
  };

  return (
    <div style={{
      marginTop: 8, padding: 10, background: 'var(--bg-input)',
      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-accent)',
    }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <MessageSquare size={10} /> Customer-facing comment on {issueKey}
      </div>
      <textarea
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type your comment..."
        style={{
          width: '100%', minHeight: 60, padding: '8px 10px', fontSize: '0.82rem',
          fontFamily: 'var(--font-display)', background: 'var(--bg-primary)',
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
        }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Ctrl+Enter to send</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent btn-sm" onClick={send} disabled={sending || !text.trim()}>
            <Send size={11} /> {sending ? 'Sending...' : 'Post Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MANUAL TIME LOG FORM
// ═══════════════════════════════════════════

function ManualTimeLogForm({ issueKey, onClose, onLogged }) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const totalSeconds = (hours * 3600) + (minutes * 60);
    if (totalSeconds < 60) return;
    setSending(true);
    const config = getConfig();
    if (config.tempoToken) {
      await logTempoTime(config, { issueKey, seconds: totalSeconds, date, description: note || `Manual log for ${issueKey}` });
      sendNotification('Time Logged', `${hours}h ${minutes}m logged to ${issueKey}`);
      onLogged?.();
      onClose();
    } else {
      sendNotification('Tempo Not Connected', 'Add your Tempo API token in Settings.');
    }
    setSending(false);
  };

  return (
    <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-accent)' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Clock size={10} /> Log time to {issueKey}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" min={0} max={23} value={hours} onChange={e => setHours(parseInt(e.target.value) || 0)}
            className="no-spinner"
            style={{ width: 48, textAlign: 'center', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>h</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" min={0} max={59} step={5} value={minutes} onChange={e => setMinutes(parseInt(e.target.value) || 0)}
            className="no-spinner"
            style={{ width: 48, textAlign: 'center', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>m</span>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: '0.75rem', padding: '4px 6px', flex: 1 }} />
      </div>
      <input type="text" placeholder="Work description (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 6, fontSize: '0.8rem' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-accent btn-sm" onClick={submit} disabled={sending || (hours === 0 && minutes === 0)}>
          <Check size={11} /> {sending ? 'Logging...' : 'Log Time'}
        </button>
        <button className="btn btn-sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TICKET CARD (with drag, comment, timer, manual log)
// ═══════════════════════════════════════════

function TicketCard({ t, activeTimer, onStartTimer, commentingKey, onToggleComment, onCommentSent, onTrackToFocus, manualLogKey, onToggleManualLog, onLogManualTime }) {
  const st = getStatusStyle(t.status);
  const isTracking = activeTimer === t.key;

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'jira-ticket',
      key: t.key,
      summary: t.summary,
      priority: t.priority,
      project: t.project,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div style={{
      padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-subtle)', marginBottom: 6,
    }}>
      <div
        draggable
        onDragStart={handleDragStart}
        style={{ cursor: 'grab' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GripVertical size={12} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--info)' }}>{t.key}</span>
            <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.project}</span>
          </div>
          <span className="badge" style={{ background: st.bg, color: st.color }}>{t.status}</span>
        </div>
        <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
          <a href={`https://${getConfig().jiraHost}/browse/${t.key}`} target="_blank" rel="noreferrer"
            onClick={ev => ev.stopPropagation()}
            style={{ color: 'inherit', textDecoration: 'none' }}
            onMouseEnter={ev => ev.target.style.color = 'var(--accent)'}
            onMouseLeave={ev => ev.target.style.color = 'inherit'}
          >{t.summary}</a>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><PriorityIcon priority={t.priority} /> {t.priority}</span>
          <span>·</span>
          <span><User size={10} style={{ verticalAlign: -1 }} /> {t.assignee}</span>
          {t.updated && <><span>·</span><span>{timeAgo(t.updated)}</span></>}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          onClick={() => onTrackToFocus?.({ key: t.key, summary: t.summary })}
          style={{ fontSize: '0.72rem', background: 'var(--info-dim)', borderColor: 'var(--info)', color: 'var(--info)' }}
        >
          <Play size={10} /> Track
        </button>
        <button
          className={`btn btn-sm ${manualLogKey === t.key ? 'btn-accent' : ''}`}
          onClick={() => onToggleManualLog?.(t.key)}
          style={{ fontSize: '0.72rem' }}
        >
          <Clock size={10} /> Log Time
        </button>
        <button
          className={`btn btn-sm ${commentingKey === t.key ? 'btn-accent' : ''}`}
          onClick={() => onToggleComment(t.key)}
          style={{ fontSize: '0.72rem' }}
        >
          <MessageSquare size={10} /> Comment
        </button>
      </div>

      {/* Manual time log form */}
      {manualLogKey === t.key && (
        <ManualTimeLogForm issueKey={t.key} onClose={() => onToggleManualLog?.(null)} onLogged={onCommentSent} />
      )}

      {/* Inline comment form */}
      {commentingKey === t.key && (
        <InlineCommentForm
          issueKey={t.key}
          onClose={() => onToggleComment(null)}
          onSent={onCommentSent}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// LIST VIEW (tickets for a specific JQL list)
// ═══════════════════════════════════════════

function JiraListView({ list, onBack, onTrackToFocus }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [logNote, setLogNote] = useState('');
  const [commentingKey, setCommentingKey] = useState(null);
  const [manualLogKey, setManualLogKey] = useState(null);
  const timerRef = useRef(null);
  const config = getConfig();
  const isConfigured = config.jiraHost && config.jiraEmail && config.jiraToken;

  useEffect(() => {
    loadTickets();
  }, [list.jql]);

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
    if (isConfigured) {
      const data = await fetchJiraTickets(config, list.jql);
      setTickets(data || getMockJiraTickets());
    } else {
      setTickets(getMockJiraTickets());
    }
    setLoading(false);
  };

  const startTimer = (key) => {
    if (activeTimer === key) { setActiveTimer(null); setTimerSeconds(0); return; }
    setActiveTimer(key);
    setTimerSeconds(0);
  };

  const logTime = async () => {
    if (timerSeconds < 60 || !activeTimer) return;
    const rounded = Math.round(timerSeconds / 60) * 60;
    if (config.tempoToken) {
      await logTempoTime(config, { issueKey: activeTimer, seconds: rounded, description: logNote });
    }
    sendNotification('Time Logged', `${formatDuration(timerSeconds)} logged to ${activeTimer}`);
    setActiveTimer(null); setTimerSeconds(0); setLogNote('');
  };

  const toggleComment = (key) => setCommentingKey(prev => prev === key ? null : key);

  const filtered = tickets.filter(t => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return t.summary.toLowerCase().includes(q) || t.key.toLowerCase().includes(q);
  });

  return (
    <>
      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
        fontSize: '0.78rem', flexWrap: 'wrap',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'var(--accent)',
          cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.78rem',
          padding: 0, fontWeight: 500,
        }}>My Lists</button>
        <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{list.name}</span>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          ({loading ? '...' : `${filtered.length} issues`})
        </span>
        <button className="btn btn-sm" onClick={loadTickets} disabled={loading} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={11} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* JQL display */}
      <div style={{
        fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        padding: '4px 8px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)',
        marginBottom: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        JQL: {list.jql}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={14} style={{ position: 'absolute', left: 8, top: 7, color: 'var(--text-muted)' }} />
        <input type="text" placeholder="Filter tickets..." value={filterText}
          onChange={e => setFilterText(e.target.value)}
          style={{ paddingLeft: 28, fontSize: '0.78rem' }} />
      </div>

      {/* Active timer */}
      {activeTimer && (
        <div style={{
          background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)',
          padding: 10, marginBottom: 8, border: '1px solid var(--border-accent)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent)' }}>{activeTimer}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)' }}>{formatDuration(timerSeconds)}</span>
          </div>
          <input type="text" placeholder="Work description..." value={logNote}
            onChange={e => setLogNote(e.target.value)}
            style={{ marginBottom: 6, fontSize: '0.78rem' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-accent btn-sm" onClick={logTime}><Check size={11} /> Log to Tempo</button>
            <button className="btn btn-sm" onClick={() => { setActiveTimer(null); setTimerSeconds(0); }}>Discard</button>
          </div>
        </div>
      )}

      {/* Tickets */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading tickets...</div>
      ) : (
        filtered.map(t => (
          <TicketCard key={t.key} t={t}
            activeTimer={activeTimer}
            onStartTimer={startTimer}
            commentingKey={commentingKey}
            onToggleComment={toggleComment}
            onCommentSent={loadTickets}
            onTrackToFocus={onTrackToFocus}
            manualLogKey={manualLogKey}
            onToggleManualLog={(key) => setManualLogKey(prev => prev === key ? null : key)}
          />
        ))
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {filterText ? 'No tickets match your search' : 'No issues found for this query'}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════
// MAIN WIDGET — List of Lists
// ═══════════════════════════════════════════

export default function EnhancedJiraWidget({ onTrackTicket }) {
  const [lists, setLists] = useState(() => {
    const saved = getJiraLists();
    return saved.length > 0 ? saved : DEFAULT_JIRA_LISTS;
  });
  const [activeList, setActiveList] = useState(null);
  const [showAddList, setShowAddList] = useState(false);
  const [newName, setNewName] = useState('');
  const [newJql, setNewJql] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editJql, setEditJql] = useState('');

  const config = getConfig();
  const isConfigured = config.jiraHost && config.jiraEmail && config.jiraToken;

  useEffect(() => { saveJiraLists(lists); }, [lists]);

  const addList = () => {
    if (!newName.trim() || !newJql.trim()) return;
    const id = Date.now().toString(36);
    setLists(prev => [...prev, { id, name: newName.trim(), jql: newJql.trim() }]);
    setNewName(''); setNewJql(''); setShowAddList(false);
  };

  const deleteList = (id) => {
    setLists(prev => prev.filter(l => l.id !== id));
  };

  const startEdit = (list) => {
    setEditingId(list.id);
    setEditName(list.name);
    setEditJql(list.jql);
  };

  const saveEdit = () => {
    if (!editName.trim() || !editJql.trim()) return;
    setLists(prev => prev.map(l => l.id === editingId ? { ...l, name: editName.trim(), jql: editJql.trim() } : l));
    setEditingId(null);
  };

  // If viewing a specific list, show its tickets
  if (activeList) {
    const list = lists.find(l => l.id === activeList);
    if (!list) { setActiveList(null); return null; }
    return (
      <div className="widget">
        <div className="widget-header">
          <div className="widget-title">
            <Ticket className="icon" /> JIRA
            {!isConfigured && <span className="badge badge-warning">Demo</span>}
          </div>
        </div>
        <div className="widget-body">
          <JiraListView list={list} onBack={() => setActiveList(null)} onTrackToFocus={onTrackTicket} />
        </div>
      </div>
    );
  }

  // Default: show list of lists
  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">
          <Ticket className="icon" /> JIRA
          {!isConfigured && <span className="badge badge-warning">Demo</span>}
        </div>
        <button className="btn btn-sm" onClick={() => setShowAddList(!showAddList)}>
          <Plus size={12} /> Add List
        </button>
      </div>
      <div className="widget-body">
        {/* Add new list form */}
        {showAddList && (
          <div style={{
            padding: 12, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-accent)', marginBottom: 10,
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>New JQL List</div>
            <input type="text" placeholder="List name (e.g., Sprint Backlog)" value={newName}
              onChange={e => setNewName(e.target.value)} style={{ marginBottom: 6, fontSize: '0.82rem' }} />
            <textarea placeholder="JQL query (e.g., project=PROJ AND sprint in openSprints())" value={newJql}
              onChange={e => setNewJql(e.target.value)}
              style={{
                width: '100%', minHeight: 50, padding: '8px 10px', fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)', background: 'var(--bg-primary)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
              }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn btn-accent btn-sm" onClick={addList}><Plus size={11} /> Add</button>
              <button className="btn btn-sm" onClick={() => setShowAddList(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* JQL Lists */}
        {lists.map(list => (
          <div key={list.id}>
            {editingId === list.id ? (
              /* Edit form inline */
              <div style={{
                padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-accent)', marginBottom: 6,
              }}>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  style={{ marginBottom: 4, fontSize: '0.82rem' }} />
                <textarea value={editJql} onChange={e => setEditJql(e.target.value)}
                  style={{
                    width: '100%', minHeight: 40, padding: '6px 8px', fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)', background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
                  }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn btn-accent btn-sm" onClick={saveEdit}><Check size={11} /> Save</button>
                  <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              /* List card */
              <div
                onClick={() => setActiveList(list.id)}
                style={{
                  padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)', marginBottom: 6,
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-input)'; }}
              >
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{list.name}</div>
                  <div style={{
                    fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                    marginTop: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    maxWidth: 250,
                  }}>{list.jql}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-icon btn-sm" onClick={() => startEdit(list)} title="Edit" style={{ width: 26, height: 26 }}>
                    <Edit3 size={11} />
                  </button>
                  <button className="btn btn-icon btn-sm" onClick={() => deleteList(list.id)} title="Delete" style={{ width: 26, height: 26 }}>
                    <Trash2 size={11} />
                  </button>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            )}
          </div>
        ))}

        {lists.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No lists yet. Click "Add List" to create a JQL query list.
          </div>
        )}

        {!isConfigured && (
          <div style={{
            marginTop: 10, padding: 10, background: 'var(--warning-dim)',
            borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--warning)',
          }}>
            Demo mode — add your JIRA credentials in Settings to load real tickets.
          </div>
        )}
      </div>
    </div>
  );
}
