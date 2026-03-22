import { useState } from 'react';
import { CheckSquare, Mic, Layers, Type, Copy, Check, Zap } from 'lucide-react';
import EnhancedTasksWidget from './EnhancedTasks';
import QuickLaunchWidget from './QuickLaunchWidget';
import { transformText, STYLE_NAMES, STYLE_KEYS } from '../utils/unicode';

// Lightweight Voice Notes (inline to avoid circular deps)
import { useEffect, useRef } from 'react';
import { Square, Volume2, Trash2 } from 'lucide-react';
import { loadVoiceNotes, saveVoiceNotes, generateId } from '../utils/storage';

function VoiceNotesInner() {
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
        setNotes(prev => [{ id: generateId(), url, date: new Date().toLocaleString(), duration: recordingTime }, ...prev]);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.current.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) { console.error('Mic denied:', err); }
  };

  const stopRecording = () => {
    if (mediaRecorder.current?.state !== 'inactive') mediaRecorder.current.stop();
    setRecording(false);
    clearInterval(timerRef.current);
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <button
          onClick={recording ? stopRecording : startRecording}
          style={{
            width: 60, height: 60, borderRadius: '50%', border: '2px solid var(--danger)',
            background: recording ? 'var(--danger)' : 'var(--danger-dim)',
            color: recording ? 'white' : 'var(--danger)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: recording ? 'recording-pulse 1.5s ease-in-out infinite' : 'none',
          }}
        >
          {recording ? <Square size={22} /> : <Mic size={22} />}
        </button>
        {recording && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>{fmt(recordingTime)}</span>}
      </div>
      <div style={{ marginTop: 12 }}>
        {notes.map(n => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}>
            <button className="btn btn-icon btn-sm" onClick={() => new Audio(n.url).play()}><Volume2 size={14} /></button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{n.date}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmt(n.duration)}</div>
            </div>
            <button onClick={() => setNotes(prev => prev.filter(x => x.id !== n.id))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={12} /></button>
          </div>
        ))}
        {notes.length === 0 && <div style={{ textAlign: 'center', padding: 16, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Tap the mic to record a note</div>}
      </div>
    </>
  );
}

// ── Unicode Text Inner ──

function UnicodeInner() {
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
    <>
      <input type="text" placeholder="Type text to transform..." value={input} onChange={e => setInput(e.target.value)} style={{ marginBottom: 10 }} />
      <div className="unicode-grid">
        {STYLE_KEYS.map(k => (
          <button key={k} className={`unicode-style-btn ${style === k ? 'active' : ''}`} onClick={() => setStyle(k)}>{STYLE_NAMES[k]}</button>
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
    </>
  );
}

// ── Hub Widget ──

export default function HubWidget() {
  const [tab, setTab] = useState('tasks');

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">
          <Layers className="icon" /> Tools
        </div>
      </div>
      <div className="widget-body">
        <div className="tab-bar" style={{ marginBottom: 12 }}>
          <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
            <CheckSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Tasks
          </button>
          <button className={tab === 'voice' ? 'active' : ''} onClick={() => setTab('voice')}>
            <Mic size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Voice
          </button>
          <button className={tab === 'unicode' ? 'active' : ''} onClick={() => setTab('unicode')}>
            <Type size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Unicode
          </button>
          <button className={tab === 'launch' ? 'active' : ''} onClick={() => setTab('launch')}>
            <Zap size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Links
          </button>
        </div>

        {tab === 'tasks' && <EnhancedTasksWidget embedded />}
        {tab === 'voice' && <VoiceNotesInner />}
        {tab === 'unicode' && <UnicodeInner />}
        {tab === 'launch' && <QuickLaunchWidget embedded />}
      </div>
    </div>
  );
}
