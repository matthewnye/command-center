import { useState, useEffect, useRef } from 'react';
import { Globe, List, Plus, X, MapPin, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { generateId } from '../utils/storage';

// NASA Earth at Night (public domain) - loads in user's browser
const MAP_URL = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800_geo.tif.png';
// Fallback: Wikipedia equirectangular
const MAP_FALLBACK = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/World_map_blank_without_borders.svg/1280px-World_map_blank_without_borders.svg.png';
// If neither loads, we show a dark background with grid lines only

const TZ_DATABASE = [
  { label: 'New York', tz: 'America/New_York', lat: 40.7, lng: -74, region: 'Americas' },
  { label: 'Chicago', tz: 'America/Chicago', lat: 41.9, lng: -87.6, region: 'Americas' },
  { label: 'Denver', tz: 'America/Denver', lat: 39.7, lng: -105, region: 'Americas' },
  { label: 'Los Angeles', tz: 'America/Los_Angeles', lat: 34, lng: -118.2, region: 'Americas' },
  { label: 'Portland', tz: 'America/Los_Angeles', lat: 45.5, lng: -122.7, region: 'Americas' },
  { label: 'São Paulo', tz: 'America/Sao_Paulo', lat: -23.5, lng: -46.6, region: 'Americas' },
  { label: 'Mexico City', tz: 'America/Mexico_City', lat: 19.4, lng: -99.1, region: 'Americas' },
  { label: 'Toronto', tz: 'America/Toronto', lat: 43.7, lng: -79.4, region: 'Americas' },
  { label: 'London', tz: 'Europe/London', lat: 51.5, lng: -0.1, region: 'Europe' },
  { label: 'Paris', tz: 'Europe/Paris', lat: 48.9, lng: 2.3, region: 'Europe' },
  { label: 'Berlin', tz: 'Europe/Berlin', lat: 52.5, lng: 13.4, region: 'Europe' },
  { label: 'Amsterdam', tz: 'Europe/Amsterdam', lat: 52.4, lng: 4.9, region: 'Europe' },
  { label: 'Madrid', tz: 'Europe/Madrid', lat: 40.4, lng: -3.7, region: 'Europe' },
  { label: 'Rome', tz: 'Europe/Rome', lat: 41.9, lng: 12.5, region: 'Europe' },
  { label: 'Istanbul', tz: 'Europe/Istanbul', lat: 41, lng: 29, region: 'Europe' },
  { label: 'Moscow', tz: 'Europe/Moscow', lat: 55.8, lng: 37.6, region: 'Europe' },
  { label: 'Dubai', tz: 'Asia/Dubai', lat: 25.2, lng: 55.3, region: 'Middle East' },
  { label: 'Mumbai', tz: 'Asia/Kolkata', lat: 19.1, lng: 72.9, region: 'Asia' },
  { label: 'Singapore', tz: 'Asia/Singapore', lat: 1.3, lng: 103.8, region: 'Asia' },
  { label: 'Hong Kong', tz: 'Asia/Hong_Kong', lat: 22.3, lng: 114.2, region: 'Asia' },
  { label: 'Shanghai', tz: 'Asia/Shanghai', lat: 31.2, lng: 121.5, region: 'Asia' },
  { label: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.7, lng: 139.7, region: 'Asia' },
  { label: 'Seoul', tz: 'Asia/Seoul', lat: 37.6, lng: 127, region: 'Asia' },
  { label: 'Sydney', tz: 'Australia/Sydney', lat: -33.9, lng: 151.2, region: 'Oceania' },
  { label: 'Auckland', tz: 'Pacific/Auckland', lat: -36.8, lng: 174.8, region: 'Oceania' },
  { label: 'Honolulu', tz: 'Pacific/Honolulu', lat: 21.3, lng: -157.8, region: 'Oceania' },
  { label: 'Lagos', tz: 'Africa/Lagos', lat: 6.5, lng: 3.4, region: 'Africa' },
  { label: 'Cairo', tz: 'Africa/Cairo', lat: 30, lng: 31.2, region: 'Africa' },
  { label: 'Johannesburg', tz: 'Africa/Johannesburg', lat: -26.2, lng: 28, region: 'Africa' },
];

function getTimeInTz(tz) {
  try { return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch { return '—'; }
}
function getDateInTz(tz) {
  try { return new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return ''; }
}
function getOffsetLabel(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
}
function isDaytime(tz) {
  try { const h = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', hour12: false })); return h >= 7 && h < 20; }
  catch { return true; }
}

// Convert lat/lng to percentage positions on equirectangular map
function lngToPct(lng) { return ((lng + 180) / 360) * 100; }
function latToPct(lat) { return ((90 - lat) / 180) * 100; }

function loadSavedTz() {
  try { const s = JSON.parse(localStorage.getItem('cmd_timezones')); return Array.isArray(s) ? s : []; } catch { return []; }
}
function saveTzList(list) { localStorage.setItem('cmd_timezones', JSON.stringify(list)); }

export default function WorldTimezoneWidget() {
  const [view, setView] = useState('map');
  const [saved, setSaved] = useState(loadSavedTz);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [hoveredPin, setHoveredPin] = useState(null);
  const [now, setNow] = useState(new Date());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [zoom, setZoom] = useState(() => {
    try { return parseFloat(localStorage.getItem('cmd_map_zoom')) || 1.2; } catch { return 1.2; }
  });
  const [pan, setPan] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem('cmd_map_pan')); return p && p.x != null ? p : { x: 0, y: 0 }; } catch { return { x: 0, y: 0 }; }
  });

  useEffect(() => { localStorage.setItem('cmd_map_zoom', zoom.toString()); }, [zoom]);
  useEffect(() => { localStorage.setItem('cmd_map_pan', JSON.stringify(pan)); }, [pan]);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const mapContainerRef = useRef(null);

  const handleWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.8, Math.min(3, z + (e.deltaY > 0 ? -0.15 : 0.15))));
  };
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    e.currentTarget.style.cursor = 'grabbing';
  };
  const handleMouseMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
  };
  const handleMouseUp = (e) => {
    dragRef.current.dragging = false;
    if (e.currentTarget) e.currentTarget.style.cursor = 'grab';
  };
  const resetView = () => { setZoom(1.2); setPan({ x: 0, y: 0 }); localStorage.removeItem('cmd_map_zoom'); localStorage.removeItem('cmd_map_pan'); }; // Default slightly zoomed to crop poles

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(t); }, []);
  // Non-passive wheel listener for zoom
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const handler = (e) => { e.preventDefault(); setZoom(z => Math.max(0.8, Math.min(3, z + (e.deltaY > 0 ? -0.15 : 0.15)))); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });
  useEffect(() => { saveTzList(saved); }, [saved]);
  useEffect(() => {
    if (saved.length === 0) {
      setSaved([
        { id: '1', label: 'Portland', tz: 'America/Los_Angeles', lat: 45.5, lng: -122.7 },
        { id: '2', label: 'New York', tz: 'America/New_York', lat: 40.7, lng: -74 },
        { id: '3', label: 'London', tz: 'Europe/London', lat: 51.5, lng: -0.1 },
        { id: '4', label: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.7, lng: 139.7 },
      ]);
    }
  }, []);

  const addTz = (tz) => {
    if (saved.find(s => s.tz === tz.tz && s.label === tz.label)) return;
    setSaved(prev => [...prev, { id: generateId(), ...tz }]);
    setShowAdd(false); setSearch('');
  };
  const removeTz = (id) => setSaved(prev => prev.filter(s => s.id !== id));

  const filteredDb = TZ_DATABASE.filter(tz =>
    !search || tz.label.toLowerCase().includes(search.toLowerCase()) || tz.tz.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Globe className="icon" /> World Clock</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn btn-sm ${view === 'map' ? 'btn-accent' : ''}`} onClick={() => setView('map')} style={{ padding: '3px 8px', fontSize: '0.7rem' }}><Globe size={11} /> Map</button>
          <button className={`btn btn-sm ${view === 'list' ? 'btn-accent' : ''}`} onClick={() => setView('list')} style={{ padding: '3px 8px', fontSize: '0.7rem' }}><List size={11} /> List</button>
          <button className="btn btn-sm" onClick={() => setShowAdd(!showAdd)}><Plus size={12} /></button>
        </div>
      </div>
      <div className="widget-body">
        {showAdd && (
          <div style={{ marginBottom: 10, padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <input type="text" placeholder="Search cities..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 6, fontSize: '0.8rem' }} autoFocus />
            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
              {filteredDb.map((tz, i) => (
                <div key={i} onClick={() => addTz(tz)} style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 4, display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span><MapPin size={11} style={{ verticalAlign: -1 }} /> {tz.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{getTimeInTz(tz.tz)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Map View */}
        {view === 'map' && (
          <div style={{ position: 'relative', marginBottom: 8 }}>
            {/* Zoom controls */}
            <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 30, display: 'flex', gap: 2, flexDirection: 'column' }}>
              <button onClick={() => setZoom(z => Math.min(z + 0.2, 3))} style={{
                width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(10,10,20,0.8)', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><ZoomIn size={12} /></button>
              <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.8))} style={{
                width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(10,10,20,0.8)', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><ZoomOut size={12} /></button>
              <button onClick={resetView} title="Reset view" style={{
                width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(10,10,20,0.8)', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><RotateCcw size={10} /></button>
            </div>

            {/* Map container — drag and scroll zoom */}
            <div ref={mapContainerRef} style={{
              borderRadius: 'var(--radius-md)', overflow: 'hidden',
              background: '#0a0a14', position: 'relative', cursor: 'grab',
            }}
              
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Inner zoomable + pannable content */}
              <div style={{
                position: 'relative', aspectRatio: '1.65 / 1',
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center 40%',
                transition: dragRef.current.dragging ? 'none' : 'transform 0.3s ease',
              }}>
                {/* Real map image */}
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/1280px-Equirectangular_projection_SW.jpg"
                  alt=""
                  onLoad={() => setMapLoaded(true)}
                  onError={(e) => {
                    if (!e.target.dataset.fallback) {
                      e.target.dataset.fallback = 'true';
                      e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/World_map_blank_without_borders.svg/1280px-World_map_blank_without_borders.svg.png';
                    } else { setMapError(true); }
                  }}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: 'fill', opacity: mapLoaded ? 0.5 : 0, transition: 'opacity 0.5s',
                    filter: 'saturate(0.4) brightness(0.7)',
                  }}
                />

                {/* Grid overlay */}
                <svg viewBox="0 0 360 180" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                  {[-60, -30, 0, 30, 60].map(lat => (
                    <line key={`lat${lat}`} x1={0} y1={90 - lat} x2={360} y2={90 - lat} stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" strokeDasharray="2,6" />
                  ))}
                  {[-120, -60, 0, 60, 120].map(lng => (
                    <line key={`lng${lng}`} x1={lng + 180} y1={0} x2={lng + 180} y2={180} stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" strokeDasharray="2,6" />
                  ))}
                  <line x1={0} y1={90} x2={360} y2={90} stroke="rgba(255,255,255,0.1)" strokeWidth="0.4" />
                </svg>

                {/* Pin layer */}
                {saved.map(tz => {
                  const leftPct = lngToPct(tz.lng);
                  const topPct = latToPct(tz.lat);
                  const day = isDaytime(tz.tz);
                  const hovered = hoveredPin === tz.id;
                  const pinColor = day ? '#6ee7b7' : '#60a5fa';
                  return (
                    <div key={tz.id} onMouseEnter={() => setHoveredPin(tz.id)} onMouseLeave={() => setHoveredPin(null)}
                      style={{ position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`, transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: hovered ? 20 : 10 }}>
                      {/* Pin glow */}
                      <div style={{ width: hovered ? 20 : 14, height: hovered ? 20 : 14, borderRadius: '50%', background: `${pinColor}22`, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', transition: 'all 0.2s' }} />
                      {/* Pin dot */}
                      <div style={{ width: hovered ? 10 : 7, height: hovered ? 10 : 7, borderRadius: '50%', background: pinColor, border: '1.5px solid rgba(10,10,20,0.8)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', transition: 'all 0.2s', boxShadow: `0 0 8px ${pinColor}66` }} />
                      {/* City label */}
                      {!hovered && <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: `${0.55 / zoom}rem`, fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', marginBottom: 4, pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{tz.label}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tooltip layer — outside the overflow:hidden container */}
            {saved.map(tz => {
              const hovered = hoveredPin === tz.id;
              if (!hovered) return null;
              const leftPct = lngToPct(tz.lng);
              const topPct = latToPct(tz.lat);
              const day = isDaytime(tz.tz);
              const pinColor = day ? '#6ee7b7' : '#60a5fa';
              // Calculate position accounting for zoom
              const tooltipLeft = `calc(${leftPct}% * ${zoom} - ${(zoom - 1) * 50}%)`;
              const tooltipTop = `calc(${topPct}% * ${zoom} * (1 / 2.2) - ${(zoom - 1) * 40 / 2.2}%)`;
              return (
                <div key={`tt-${tz.id}`} style={{
                  position: 'absolute', left: `${leftPct}%`, top: 0,
                  transform: 'translateX(-50%)',
                  zIndex: 50, pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center',
                }}>
                  <div style={{
                    background: 'rgba(10, 10, 20, 0.95)', border: `1px solid ${pinColor}44`,
                    borderRadius: 6, padding: '6px 12px', backdropFilter: 'blur(8px)',
                    boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 12px ${pinColor}22`,
                    display: 'inline-block',
                  }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{tz.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: pinColor }}>{getTimeInTz(tz.tz)}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{getDateInTz(tz.tz)} · {getOffsetLabel(tz.tz)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {view === 'list' && saved.map(tz => {
          const day = isDaytime(tz.tz);
          return (
            <div key={tz.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '1rem' }}>{day ? '☀️' : '🌙'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{tz.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{getDateInTz(tz.tz)} · {getOffsetLabel(tz.tz)}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: day ? 'var(--accent)' : 'var(--info)' }}>{getTimeInTz(tz.tz)}</div>
              <button onClick={() => removeTz(tz.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}><X size={12} /></button>
            </div>
          );
        })}
        {saved.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Click + to add timezones</div>}
      </div>
    </div>
  );
}
