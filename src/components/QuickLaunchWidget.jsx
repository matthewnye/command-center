import { useEffect, useState } from 'react';
import { Check, Plus, Settings, Zap } from 'lucide-react';
import { getConfig } from '../utils/api';

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

export default function QuickLaunchWidget({ embedded }) {
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

  const innerContent = (
    <>
      {/* Edit controls */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button className={`btn btn-sm ${editing ? 'btn-accent' : ''}`} onClick={() => { setEditing(!editing); setEditItem(null); }}>
          {editing ? <><Check size={11} /> Done</> : <><Settings size={11} /></>}
        </button>
      </div>
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
    </>
  );

  if (embedded) return innerContent;

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Zap className="icon" /> Quick Launch</div>
      </div>
      <div className="widget-body">
        {innerContent}
      </div>
    </div>
  );
}
