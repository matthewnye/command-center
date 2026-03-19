import { useState, useEffect } from 'react';
import { Flag, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { getConfig, fetchOutlookFlaggedEmails, getMockFlaggedEmails } from '../utils/api';

export default function PinnedEmailWidget() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const config = getConfig();
  const isConfigured = !!config.msGraphToken;

  useEffect(() => {
    if (isConfigured) {
      loadEmails();
    } else {
      setEmails(getMockFlaggedEmails());
    }
  }, []);

  const loadEmails = async () => {
    setLoading(true);
    const data = await fetchOutlookFlaggedEmails(config);
    setEmails(data ? data.map(e => ({
      subject: e.subject,
      from: e.from?.emailAddress?.name || e.from?.emailAddress?.address || 'Unknown',
      time: new Date(e.receivedDateTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      preview: e.bodyPreview,
      importance: e.importance,
      isRead: e.isRead,
    })) : getMockFlaggedEmails());
    setLoading(false);
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title">
          <Flag className="icon" /> Pinned Emails
          {!isConfigured && <span className="badge badge-warning">Demo</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {emails.length} flagged
          </span>
          <button className="btn btn-sm" onClick={loadEmails} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="widget-body">
        {emails.map((e, i) => (
          <div key={i}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData('application/json', JSON.stringify({
                type: 'pinned-email',
                subject: e.subject,
                from: e.from,
              }));
              ev.dataTransfer.effectAllowed = 'copy';
            }}
            style={{
              padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'grab',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Flag size={12} style={{ color: e.importance === 'high' ? 'var(--danger)' : 'var(--warning)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', fontWeight: e.isRead === false ? 600 : 400 }}>
                  {e.from}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                {e.time}
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: 3, fontWeight: e.isRead === false ? 600 : 400 }}>
              {e.subject}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {e.preview}
            </div>
          </div>
        ))}

        {emails.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No flagged emails
          </div>
        )}

        {!isConfigured && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--warning-dim)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--warning)' }}>
            <AlertCircle size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Connect Microsoft Graph API in Settings to see your flagged emails
          </div>
        )}
      </div>
    </div>
  );
}
