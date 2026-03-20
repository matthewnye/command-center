import { useState } from 'react';
import { Linkedin } from 'lucide-react';
import { getMockLinkedInData } from '../utils/api';

export default function LinkedInWidget() {
  const [tab, setTab] = useState('posts');
  const data = getMockLinkedInData();

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title"><Linkedin className="icon" /> LinkedIn <span className="badge badge-warning">Demo</span></div>
      </div>
      <div className="widget-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>{data.profileViews}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Profile Views</div>
          </div>
          <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>{data.searchAppearances}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Searches</div>
          </div>
          <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>{data.connectionRequests}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Requests</div>
          </div>
        </div>

        <div className="tab-bar">
          <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>Posts</button>
          <button className={tab === 'ads' ? 'active' : ''} onClick={() => setTab('ads')}>Ad Campaigns</button>
        </div>

        {tab === 'posts' && data.posts.map((p, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.title}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span>{p.impressions.toLocaleString()} views</span>
              <span>{p.likes} likes</span>
              <span>{p.comments} comments</span>
              <span>{p.date}</span>
            </div>
          </div>
        ))}

        {tab === 'ads' && data.adCampaigns.map((c, i) => (
          <div key={i} style={{ padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', marginBottom: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.name}</span>
              <span className="badge badge-accent">{c.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              <span>${c.spend}</span>
              <span>{c.impressions.toLocaleString()} imp</span>
              <span>{c.clicks.toLocaleString()} clicks</span>
              <span>CTR {c.ctr}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
