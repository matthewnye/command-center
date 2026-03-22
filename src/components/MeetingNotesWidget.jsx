import { useState } from 'react';
import { AlertCircle, Video } from 'lucide-react';
import { getMockMeetingNotes } from '../utils/api';

export default function MeetingNotesWidget() {
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
