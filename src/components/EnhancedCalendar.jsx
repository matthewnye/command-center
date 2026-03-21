import { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { getMockCalendar } from '../utils/api';

// Generate a full week of mock events for the week view
function generateWeekEvents() {
  const baseEvents = [
    { title: 'Daily Standup', time: '09:00', endTime: '09:15', color: '#6ee7b7', loc: 'Teams', days: [1,2,3,4,5] },
    { title: 'Sprint Planning', time: '10:00', endTime: '11:00', color: '#60a5fa', loc: 'Conf Room B', days: [1] },
    { title: 'Design Review', time: '13:00', endTime: '13:45', color: '#a78bfa', loc: 'WebEx', days: [2,4] },
    { title: '1:1 with Manager', time: '14:30', endTime: '15:00', color: '#fbbf24', loc: 'Teams', days: [3] },
    { title: 'Tech Debt Triage', time: '16:00', endTime: '16:30', color: '#f87171', loc: 'Slack Huddle', days: [5] },
    { title: 'Retro', time: '15:00', endTime: '16:00', color: '#60a5fa', loc: 'Teams', days: [5] },
    { title: 'Lunch & Learn', time: '12:00', endTime: '13:00', color: '#fbbf24', loc: 'Cafeteria', days: [4] },
    { title: 'Architecture Review', time: '11:00', endTime: '12:00', color: '#a78bfa', loc: 'WebEx', days: [2] },
    { title: 'Client Sync', time: '10:30', endTime: '11:00', color: '#f87171', loc: 'WebEx', days: [3] },
    { title: 'Code Review Session', time: '14:00', endTime: '15:00', color: '#6ee7b7', loc: 'VS Code Live', days: [1,4] },
  ];
  return baseEvents;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatHour(h) {
  if (h === 0 || h === 12) return '12';
  return h > 12 ? `${h - 12}` : `${h}`;
}

function getWeekDates(referenceDate) {
  const d = new Date(referenceDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7)); // Monday as start
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date);
  }
  return dates;
}

export default function EnhancedCalendarWidget({ embedded }) {
  const [view, setView] = useState('day'); // day | week
  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekEvents = useMemo(() => generateWeekEvents(), []);
  const todayEvents = getMockCalendar();

  const weekDates = getWeekDates(selectedDate);
  const today = new Date();
  const isToday = (d) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  const navigate = (dir) => {
    const d = new Date(selectedDate);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
  };

  const goToToday = () => setSelectedDate(new Date());

  const currentDayOfWeek = selectedDate.getDay();
  const dayEventsForDate = weekEvents.filter(e =>
    e.days.includes(currentDayOfWeek === 0 ? 7 : currentDayOfWeek)
  );

  // Calculate current time indicator position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const timelineStart = 8 * 60; // 8 AM
  const timelineEnd = 20 * 60; // 8 PM
  const nowPercent = Math.max(0, Math.min(100,
    ((nowMinutes - timelineStart) / (timelineEnd - timelineStart)) * 100
  ));

  const calendarInner = (
    <>
      {/* View toggle for embedded */}
      {embedded && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button className={`btn btn-sm ${view === 'day' ? 'btn-accent' : ''}`}
            onClick={() => setView('day')} style={{ padding: '3px 8px', fontSize: '0.7rem' }}>Day</button>
          <button className={`btn btn-sm ${view === 'week' ? 'btn-accent' : ''}`}
            onClick={() => setView('week')} style={{ padding: '3px 8px', fontSize: '0.7rem' }}>Week</button>
        </div>
      )}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <button className="btn btn-icon btn-sm" onClick={() => navigate(-1)}>
            <ChevronLeft size={14} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {view === 'day'
                ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                : `${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              }
            </div>
            {!isToday(selectedDate) && (
              <button
                onClick={goToToday}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent)',
                  fontSize: '0.72rem', cursor: 'pointer', padding: '2px 0',
                  fontFamily: 'var(--font-display)',
                }}
              >Go to Today</button>
            )}
          </div>
          <button className="btn btn-icon btn-sm" onClick={() => navigate(1)}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Day View */}
        {view === 'day' && (
          <div style={{ position: 'relative' }}>
            {dayEventsForDate.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No events scheduled
              </div>
            )}
            {dayEventsForDate
              .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
              .map((e, i) => {
                const startMin = timeToMinutes(e.time);
                const endMin = timeToMinutes(e.endTime);
                const duration = endMin - startMin;
                const isPast = nowMinutes > endMin;

                return (
                  <div className="calendar-event" key={i} style={{ opacity: isPast ? 0.5 : 1 }}>
                    <div className="calendar-time-block">
                      {e.time}<br />
                      <span style={{ opacity: 0.5 }}>{duration}m</span>
                    </div>
                    <div className="calendar-event-bar" style={{ background: e.color }} />
                    <div className="calendar-event-details">
                      <div className="calendar-event-title">{e.title}</div>
                      <div className="calendar-event-location">{e.loc}</div>
                      {nowMinutes >= startMin && nowMinutes <= endMin && (
                        <span className="badge badge-accent" style={{ marginTop: 4 }}>
                          <Clock size={10} /> Now
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* Week View */}
        {view === 'week' && (
          <div style={{ overflowX: 'auto' }}>
            {/* Day headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px repeat(7, 1fr)',
              gap: 2,
              marginBottom: 4,
            }}>
              <div />
              {weekDates.map((d, i) => (
                <div
                  key={i}
                  onClick={() => { setSelectedDate(d); setView('day'); }}
                  style={{
                    textAlign: 'center',
                    padding: '4px 2px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    background: isToday(d) ? 'var(--accent-dim)' : 'transparent',
                    color: isToday(d) ? 'var(--accent)' : i >= 5 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{DAY_NAMES[d.getDay()]}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{d.getDate()}</div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px repeat(7, 1fr)',
              gap: 2,
              position: 'relative',
            }}>
              {HOURS.map(h => (
                <div key={h} style={{ display: 'contents' }}>
                  <div style={{
                    fontSize: '0.65rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    textAlign: 'right',
                    paddingRight: 6,
                    height: 48,
                    lineHeight: '48px',
                  }}>
                    {formatHour(h)}{h < 12 ? 'a' : 'p'}
                  </div>
                  {weekDates.map((d, di) => {
                    const dayNum = d.getDay() === 0 ? 7 : d.getDay();
                    const eventsInHour = weekEvents.filter(e => {
                      if (!e.days.includes(dayNum)) return false;
                      const startH = parseInt(e.time.split(':')[0]);
                      return startH === h;
                    });

                    return (
                      <div key={di} style={{
                        height: 48,
                        borderTop: '1px solid var(--border-subtle)',
                        position: 'relative',
                        background: di >= 5 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      }}>
                        {eventsInHour.map((e, ei) => {
                          const startMin = timeToMinutes(e.time);
                          const endMin = timeToMinutes(e.endTime);
                          const duration = endMin - startMin;
                          const topOffset = ((startMin - h * 60) / 60) * 48;
                          const height = (duration / 60) * 48;

                          return (
                            <div
                              key={ei}
                              title={`${e.title}\n${e.time} — ${e.endTime}\n${e.loc}`}
                              style={{
                                position: 'absolute',
                                top: topOffset,
                                left: 1,
                                right: 1,
                                height: Math.max(16, height - 2),
                                background: `${e.color}22`,
                                borderLeft: `2px solid ${e.color}`,
                                borderRadius: 3,
                                padding: '1px 4px',
                                fontSize: '0.6rem',
                                fontWeight: 500,
                                color: e.color,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                cursor: 'pointer',
                                zIndex: 1,
                              }}
                            >
                              {e.title}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
  );

  if (embedded) return calendarInner;

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Calendar className="icon" /> Calendar</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className={`btn btn-sm ${view === 'day' ? 'btn-accent' : ''}`}
            onClick={() => setView('day')} style={{ padding: '3px 8px', fontSize: '0.7rem' }}>Day</button>
          <button className={`btn btn-sm ${view === 'week' ? 'btn-accent' : ''}`}
            onClick={() => setView('week')} style={{ padding: '3px 8px', fontSize: '0.7rem' }}>Week</button>
        </div>
      </div>
      <div className="widget-body">{calendarInner}</div>
    </div>
  );
}
