import { useEffect, useState } from 'react';
import { AlertCircle, Bell, Calendar, Mail, RefreshCw } from 'lucide-react';
import { fetchOutlookCalendar, fetchOutlookEmails, getConfig, getMockCalendar, getMockEmails } from '../utils/api';

export default function OutlookWidget() {
  const [tab, setTab] = useState('calendar');
  const [emails, setEmails] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [calReminders, setCalReminders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cmd_cal_reminders')) || {}; } catch { return {}; }
  });
  const config = getConfig();
  const isConfigured = !!config.msGraphToken || !!config.msGraphRefreshToken;

  useEffect(() => { localStorage.setItem('cmd_cal_reminders', JSON.stringify(calReminders)); }, [calReminders]);

  // Calendar reminder checker — every 30s, uses alert() to block
  useEffect(() => {
    const check = () => {
      events.forEach(e => {
        if (!e.startISO) return;
        const id = e.title + '|' + e.startISO;
        if (calReminders[id] === false) return; // Explicitly disabled
        const now = Date.now();
        const start = new Date(e.startISO).getTime();
        const diff = start - now;
        const firedKey15 = 'cmd_cal15_' + id;
        const firedKey5 = 'cmd_cal5_' + id;
        if (diff > 0 && diff <= 15 * 60000 && diff > 5 * 60000 && !sessionStorage.getItem(firedKey15)) {
          sessionStorage.setItem(firedKey15, '1');
          alert('⏰ 15 MINUTE REMINDER\n\n' + e.title + '\nStarts at ' + e.time + (e.location ? '\n' + e.location : ''));
        }
        if (diff > 0 && diff <= 5 * 60000 && !sessionStorage.getItem(firedKey5)) {
          sessionStorage.setItem(firedKey5, '1');
          alert('🚨 5 MINUTE REMINDER\n\n' + e.title + '\nStarts at ' + e.time + (e.location ? '\n' + e.location : ''));
        }
      });
    };
    const interval = setInterval(check, 30000);
    check();
    return () => clearInterval(interval);
  }, [events, calReminders]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cfg = getConfig();
    if (!cfg.msGraphToken && !cfg.msGraphRefreshToken) {
      setEmails(getMockEmails()); setEvents(getMockCalendar()); return;
    }
    setLoading(true);
    const [emailData, calData] = await Promise.all([fetchOutlookEmails(cfg), fetchOutlookCalendar(cfg)]);
    if (emailData) {
      setEmails(emailData.map(e => ({
        from: e.from?.emailAddress?.name || e.from?.emailAddress?.address || 'Unknown',
        subject: e.subject, preview: e.bodyPreview,
        time: new Date(e.receivedDateTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
        isRead: e.isRead,
      })));
    } else { setEmails(getMockEmails()); }
    if (calData) {
      setEvents(calData.map(e => {
        const d = new Date(e.start?.dateTime + 'Z');
        const today = new Date(); today.setHours(0,0,0,0);
        const eventDay = new Date(d); eventDay.setHours(0,0,0,0);
        const isToday = eventDay.getTime() === today.getTime();
        const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        let meetingUrl = e.onlineMeeting?.joinUrl || e.onlineMeetingUrl || '';
        if (!meetingUrl && e.location?.displayName) { const m = e.location.displayName.match(/https?:\/\/[^\s]+/); if (m) meetingUrl = m[0]; }
        return {
          title: e.subject,
          time: isToday ? timeStr : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + timeStr,
          startISO: d.toISOString(), dateISO: d.toISOString().split('T')[0],
          duration: '', location: e.location?.displayName || '', meetingUrl, color: 'var(--info)',
        };
      }));
    } else { setEvents(getMockCalendar()); }
    setLastRefresh(new Date()); setLoading(false);
  };

  const toggleReminder = (e) => {
    const id = e.title + '|' + e.startISO;
    setCalReminders(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));
  };
  const fmtRefresh = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">{tab === 'email' ? <Mail className="icon" /> : <Calendar className="icon" />} Outlook {!isConfigured && <span className="badge badge-warning">Demo</span>}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtRefresh(lastRefresh)}</span>}
          <button className="btn btn-sm" onClick={loadData} disabled={loading}><RefreshCw size={12} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>
      <div className="widget-body">
        <div className="tab-bar">
          <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>Calendar</button>
          <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>Inbox</button>
        </div>

        {tab === 'calendar' && events.map((e, i) => {
          const id = e.title + '|' + e.startISO;
          const reminderOn = calReminders[id] !== false;
          return (
            <div className="calendar-event" key={i} draggable onDragStart={ev => { ev.dataTransfer.setData('application/json', JSON.stringify({ type: 'calendar-event', title: e.title, time: e.time, location: e.location, dateISO: e.dateISO || null })); }} style={{ cursor: 'grab' }}>
              <div className="calendar-time-block">{e.time}<br /><span style={{ opacity: 0.5 }}>{e.duration}</span></div>
              <div className="calendar-event-bar" style={{ background: e.color }}></div>
              <div className="calendar-event-details" style={{ flex: 1 }}>
                <div className="calendar-event-title">{e.title}</div>
                <div className="calendar-event-location">
                  {e.meetingUrl ? (<a href={e.meetingUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.72rem' }} onClick={ev => ev.stopPropagation()}>🔗 Join Meeting</a>) : e.location || ''}
                </div>
              </div>
              <button onClick={() => toggleReminder(e)} title={reminderOn ? 'Reminder ON' : 'Reminder OFF'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, opacity: reminderOn ? 1 : 0.3 }}>
                <Bell size={12} style={{ color: reminderOn ? 'var(--accent)' : 'var(--text-muted)' }} />
              </button>
            </div>
          );
        })}

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
