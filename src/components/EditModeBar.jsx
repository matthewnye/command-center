import { useState } from 'react';
import WIDGET_REGISTRY from '../widgets/registry';


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

export { loadWidgetVisibility, saveWidgetVisibility, loadWidgetOrder, saveWidgetOrder };

export default function EditModeBar({ visible, order, onToggle, onReorder, onClose }) {
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
