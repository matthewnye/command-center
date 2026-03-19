import { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare, Plus, Trash2, Check, Bell, Calendar,
  Flag, Tag, GripVertical, ChevronDown, Clock, Filter, SortAsc
} from 'lucide-react';
import { loadTasks, saveTasks, generateId } from '../utils/storage';
import { scheduleReminder, sendNotification } from '../utils/notifications';

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'var(--danger)', icon: '🔴' },
  { value: 'high', label: 'High', color: 'var(--warning)', icon: '🟡' },
  { value: 'normal', label: 'Normal', color: 'var(--info)', icon: '🔵' },
  { value: 'low', label: 'Low', color: 'var(--text-muted)', icon: '⚪' },
];

const CATEGORIES = [
  { value: 'work', label: 'Work', color: 'var(--info)' },
  { value: 'personal', label: 'Personal', color: 'var(--accent)' },
  { value: 'meeting', label: 'Meeting', color: 'var(--purple)' },
  { value: 'followup', label: 'Follow-up', color: 'var(--warning)' },
  { value: 'bug', label: 'Bug', color: 'var(--danger)' },
];

const SORT_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'category', label: 'Category' },
];

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function getDaysUntilDue(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
}

function DueDateBadge({ dueDate }) {
  const days = getDaysUntilDue(dueDate);
  if (days === null) return null;

  let color, text;
  if (days < 0) { color = 'var(--danger)'; text = `${Math.abs(days)}d overdue`; }
  else if (days === 0) { color = 'var(--danger)'; text = 'Due today'; }
  else if (days === 1) { color = 'var(--warning)'; text = 'Tomorrow'; }
  else if (days <= 3) { color = 'var(--warning)'; text = `${days}d left`; }
  else { color = 'var(--text-muted)'; text = `${days}d left`; }

  return (
    <span style={{
      fontSize: '0.68rem',
      color,
      fontFamily: 'var(--font-mono)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
    }}>
      <Calendar size={10} /> {text}
    </span>
  );
}

export default function EnhancedTasksWidget({ embedded }) {
  const [tasks, setTasks] = useState(() => {
    const saved = loadTasks();
    // Migrate old tasks
    return saved.map(t => ({
      priority: 'normal',
      category: 'work',
      dueDate: null,
      ...t,
    }));
  });
  const [newTask, setNewTask] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPriority, setNewPriority] = useState('normal');
  const [newCategory, setNewCategory] = useState('work');
  const [newDueDate, setNewDueDate] = useState('');
  const [sortBy, setSortBy] = useState('priority');
  const [filterCat, setFilterCat] = useState('all');
  const [showSort, setShowSort] = useState(false);
  const [reminderTaskId, setReminderTaskId] = useState(null);
  const [reminderTime, setReminderTime] = useState('');
  const [dropHighlight, setDropHighlight] = useState(false);

  useEffect(() => { saveTasks(tasks); }, [tasks]);

  // Handle JIRA ticket drops
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropHighlight(true);
  };
  const handleDragLeave = () => setDropHighlight(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDropHighlight(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'jira-ticket') {
        const exists = tasks.find(t => t.text.includes(data.key));
        if (exists) return;
        const priMap = { Critical: 'urgent', Highest: 'urgent', High: 'high', Medium: 'normal', Low: 'low', Lowest: 'low' };
        setTasks(prev => [...prev, {
          id: generateId(),
          text: `[${data.key}] ${data.summary}`,
          done: false,
          created: Date.now(),
          priority: priMap[data.priority] || 'normal',
          category: 'work',
          dueDate: null,
          completedAt: null,
          jiraKey: data.key,
        }]);
        sendNotification('Ticket Added', `${data.key} added to tasks`);
      }
      if (data.type === 'pinned-email') {
        const exists = tasks.find(t => t.text.includes(data.subject));
        if (exists) return;
        setTasks(prev => [...prev, {
          id: generateId(),
          text: `📧 ${data.subject} (from ${data.from})`,
          done: false,
          created: Date.now(),
          priority: 'normal',
          category: 'followup',
          dueDate: null,
          completedAt: null,
        }]);
        sendNotification('Email Added', `"${data.subject}" added to tasks`);
      }
    } catch {}
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks(prev => [...prev, {
      id: generateId(),
      text: newTask.trim(),
      done: false,
      created: Date.now(),
      priority: newPriority,
      category: newCategory,
      dueDate: newDueDate || null,
      completedAt: null,
    }]);
    setNewTask('');
    setNewDueDate('');
    setShowAddForm(false);
  };

  const toggleTask = (id) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? {
        ...t,
        done: !t.done,
        completedAt: !t.done ? Date.now() : null,
      } : t
    ));
  };

  const deleteTask = (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const setReminder = (task) => {
    if (!reminderTime) return;
    scheduleReminder('Task Reminder', task.text, reminderTime, task.id);
    sendNotification('Reminder Set', `You'll be reminded: ${task.text}`);
    setReminderTaskId(null);
    setReminderTime('');
  };

  // Sort and filter
  const active = useMemo(() => {
    let filtered = tasks.filter(t => !t.done);
    if (filterCat !== 'all') filtered = filtered.filter(t => t.category === filterCat);

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return (PRIORITY_ORDER[a.priority] || 9) - (PRIORITY_ORDER[b.priority] || 9);
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        case 'category':
          return (a.category || '').localeCompare(b.category || '');
        default:
          return b.created - a.created;
      }
    });
  }, [tasks, sortBy, filterCat]);

  const completed = tasks.filter(t => t.done);
  const completedToday = completed.filter(t => {
    if (!t.completedAt) return false;
    return new Date(t.completedAt).toDateString() === new Date().toDateString();
  });

  const overdueTasks = active.filter(t => {
    const days = getDaysUntilDue(t.dueDate);
    return days !== null && days < 0;
  });

  const getPriorityInfo = (p) => PRIORITIES.find(x => x.value === p) || PRIORITIES[2];
  const getCategoryInfo = (c) => CATEGORIES.find(x => x.value === c) || CATEGORIES[0];

  const innerContent = (
    <>
      {/* Sort/Filter Controls */}
      {showSort && (
          <div style={{
            display: 'flex',
            gap: 6,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ flex: 1, fontSize: '0.78rem', minWidth: 100 }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>Sort: {o.label}</option>
              ))}
            </select>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              style={{ flex: 1, fontSize: '0.78rem', minWidth: 100 }}
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Quick Add */}
        {!showAddForm ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Add a task..."
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
              onFocus={() => newTask && setShowAddForm(true)}
            />
            <button className="btn btn-accent btn-sm" onClick={() => {
              if (newTask.trim()) addTask();
              else setShowAddForm(true);
            }}><Plus size={14} /></button>
          </div>
        ) : (
          <div style={{
            padding: 12,
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-accent)',
            marginBottom: 12,
          }}>
            <input
              type="text"
              placeholder="What needs to be done?"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setShowAddForm(false); }}
              style={{ marginBottom: 8 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {/* Priority */}
              <div style={{ display: 'flex', gap: 3 }}>
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setNewPriority(p.value)}
                    title={p.label}
                    style={{
                      width: 28, height: 28,
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${newPriority === p.value ? p.color : 'var(--border-subtle)'}`,
                      background: newPriority === p.value ? `${p.color}22` : 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >{p.icon}</button>
                ))}
              </div>
              {/* Category */}
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                style={{ fontSize: '0.75rem', padding: '4px 8px', flex: 1, minWidth: 80 }}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {/* Due date */}
              <input
                type="date"
                value={newDueDate}
                onChange={e => setNewDueDate(e.target.value)}
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-accent btn-sm" onClick={addTask}>Add Task</button>
              <button className="btn btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Task List */}
        {active.map(t => {
          const pri = getPriorityInfo(t.priority);
          const cat = getCategoryInfo(t.category);
          return (
            <div className="task-item" key={t.id} style={{ position: 'relative' }}>
              <button
                className="task-check"
                onClick={() => toggleTask(t.id)}
                style={{ borderColor: pri.color }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span className="task-text">{t.text}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '1px 6px',
                    borderRadius: 100,
                    background: `${cat.color}22`,
                    color: cat.color,
                  }}>{cat.label}</span>
                  <span style={{ fontSize: '0.68rem', color: pri.color }}>{pri.icon} {pri.label}</span>
                  <DueDateBadge dueDate={t.dueDate} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  className="btn btn-icon btn-sm"
                  title="Set reminder"
                  onClick={() => setReminderTaskId(reminderTaskId === t.id ? null : t.id)}
                  style={{ width: 26, height: 26 }}
                >
                  <Bell size={11} />
                </button>
                <button
                  className="btn btn-icon btn-sm"
                  onClick={() => deleteTask(t.id)}
                  style={{ width: 26, height: 26 }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
              {/* Reminder popover */}
              {reminderTaskId === t.id && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  background: 'var(--bg-elevated)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-elevated)',
                  zIndex: 10,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}>
                  <input
                    type="datetime-local"
                    value={reminderTime}
                    onChange={e => setReminderTime(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                  />
                  <button className="btn btn-accent btn-sm" onClick={() => setReminder(t)}>Set</button>
                </div>
              )}
            </div>
          );
        })}

        {active.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: 20,
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
          }}>
            {filterCat !== 'all' ? 'No tasks in this category' : 'All done! Add a new task above.'}
          </div>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              marginBottom: 6,
            }}>
              {completed.length} completed ({completedToday.length} today)
            </summary>
            {completed.slice(0, 10).map(t => (
              <div className="task-item" key={t.id} style={{ opacity: 0.6 }}>
                <button className="task-check done" onClick={() => toggleTask(t.id)}>
                  <Check size={12} />
                </button>
                <span className="task-text done" style={{ flex: 1 }}>{t.text}</span>
                <button className="btn btn-icon btn-sm" onClick={() => deleteTask(t.id)} style={{ width: 26, height: 26 }}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {completed.length > 10 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', paddingTop: 4 }}>
                +{completed.length - 10} more
              </div>
            )}
          </details>
        )}
    </>
  );

  if (embedded) return <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} style={dropHighlight ? { border: '2px dashed var(--accent)', background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)', padding: 4 } : {}}>{innerContent}</div>;

  return (
    <div className="widget" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={dropHighlight ? { border: '2px dashed var(--accent)', background: 'var(--accent-glow)' } : {}}>
      <div className="widget-header">
        <div className="widget-title">
          <CheckSquare className="icon" /> Tasks
          {overdueTasks.length > 0 && <span className="badge badge-danger" style={{ marginLeft: 4 }}>{overdueTasks.length} overdue</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{completedToday.length} today</span>
          <button className="btn btn-sm" onClick={() => setShowSort(!showSort)} style={{ padding: '3px 6px' }}><SortAsc size={12} /></button>
        </div>
      </div>
      <div className="widget-body">{innerContent}</div>
    </div>
  );
}
