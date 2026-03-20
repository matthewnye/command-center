import { useState, useRef, useCallback, useEffect } from 'react';

// ── Persistent Size Storage ──

function loadWidgetSizes() {
  try { return JSON.parse(localStorage.getItem('cmd_widget_sizes')) || {}; } catch { return {}; }
}
function saveWidgetSizes(sizes) {
  localStorage.setItem('cmd_widget_sizes', JSON.stringify(sizes));
}

// ── ResizableWidget Wrapper ──

export default function ResizableWidget({ id, children }) {
  const allSizes = loadWidgetSizes();
  const saved = allSizes[id] || {};
  const [colSpan, setColSpan] = useState(saved.colSpan || 1);
  const [height, setHeight] = useState(saved.height || null); // null = auto
  const containerRef = useRef(null);
  const stateRef = useRef({ colSpan: saved.colSpan || 1, height: saved.height || null });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startW: 0, startH: 0, startColSpan: 1 });

  // Keep ref in sync
  useEffect(() => { stateRef.current = { colSpan, height }; }, [colSpan, height]);

  const persist = useCallback((cs, h) => {
    const sizes = loadWidgetSizes();
    sizes[id] = { colSpan: cs, height: h };
    saveWidgetSizes(sizes);
  }, [id]);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    // Vertical: free-form, min 150px
    const newH = Math.max(150, dragRef.current.startH + dy);
    setHeight(Math.round(newH));

    // Horizontal: snap to columns based on width change
    const colWidth = dragRef.current.startW / dragRef.current.startColSpan;
    const newCols = Math.max(1, Math.min(4, Math.round((dragRef.current.startW + dx) / colWidth)));
    setColSpan(newCols);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Use ref for current values
    persist(stateRef.current.colSpan, stateRef.current.height);
  }, [persist, handleMouseMove]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      startColSpan: stateRef.current.colSpan,
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  };

  // Double-click handle to reset size
  const handleDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setColSpan(1);
    setHeight(null);
    persist(1, null);
  };

  return (
    <div
      ref={containerRef}
      style={{
        gridColumn: `span ${colSpan}`,
        height: height ? `${height}px` : 'auto',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Drag to resize · Double-click to reset"
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
        onMouseLeave={e => { if (!dragRef.current.active) e.currentTarget.style.opacity = '0'; }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ color: 'var(--text-muted)' }}>
          <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
