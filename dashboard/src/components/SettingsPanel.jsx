import { useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { getConfig, saveConfig } from '../utils/api';
import { requestNotificationPermission, sendNotification } from '../utils/notifications';
import ENV from '../config/env';

export default function SettingsPanel({ onClose }) {
  const [config, setConfig] = useState(getConfig);
  const [saved, setSaved] = useState(false);

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    saveConfig(config);
    // Verify save succeeded before reloading
    const verify = getConfig();
    if (Object.keys(verify).length > 0) {
      setSaved(true);
      setTimeout(() => window.location.reload(), 600);
    } else {
      alert('Failed to save config — please try again.');
    }
  };

  return (
    <div className="settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Settings</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="settings-section">
          <h3>JIRA / Atlassian</h3>
          <div className="settings-field">
            <label>JIRA Host (e.g., mycompany.atlassian.net)</label>
            <input type="text" value={config.jiraHost || ''} onChange={e => update('jiraHost', e.target.value)} placeholder="company.atlassian.net" />
          </div>
          <div className="settings-field">
            <label>Email</label>
            <input type="text" value={config.jiraEmail || ''} onChange={e => update('jiraEmail', e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="settings-field">
            <label>API Token</label>
            <input type="password" value={config.jiraToken || ''} onChange={e => update('jiraToken', e.target.value)} placeholder="Atlassian API token" />
          </div>
          <div className="settings-field">
            <label>JQL Filter (optional)</label>
            <input type="text" value={config.jiraJQL || ''} onChange={e => update('jiraJQL', e.target.value)} placeholder="assignee=currentUser() AND status!=Done" />
          </div>
          <div className="settings-field">
            <label>Account ID (for Tempo)</label>
            <input type="text" value={config.jiraAccountId || ''} onChange={e => update('jiraAccountId', e.target.value)} placeholder="Atlassian Account ID" />
          </div>
        </div>

        <div className="settings-section">
          <h3>Tempo</h3>
          <div className="settings-field">
            <label>API Token</label>
            <input type="password" value={config.tempoToken || ''} onChange={e => update('tempoToken', e.target.value)} placeholder="Tempo API token" />
          </div>
        </div>

        <div className="settings-section">
          <h3>Microsoft Graph (Outlook / Teams)</h3>
          <div className="settings-field">
            <label>Access Token</label>
            <input type="password" value={config.msGraphToken || ''} onChange={e => update('msGraphToken', e.target.value)} placeholder="MS Graph access token" />
          </div>
          <div className="settings-field">
            <label>Refresh Token <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>(enables auto-refresh)</span></label>
            <input type="password" value={config.msGraphRefreshToken || ''} onChange={e => update('msGraphRefreshToken', e.target.value)} placeholder="MS Graph refresh token" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            <a href={ENV.MS_AUTH_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>Click here to authorize Microsoft</a> — copy both tokens. With a refresh token, your connection stays active permanently.
          </div>
        </div>

        <div className="settings-section">
          <h3>RescueTime</h3>
          <div className="settings-field">
            <label>API Key</label>
            <input type="password" value={config.rescueTimeKey || ''} onChange={e => update('rescueTimeKey', e.target.value)} placeholder="RescueTime API key" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Get your key from <a href="https://www.rescuetime.com/anapi/manage" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>rescuetime.com/anapi/manage</a>
          </div>
        </div>

        <div className="settings-section">
          <h3>LinkedIn</h3>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: 10, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            LinkedIn API requires a backend server for OAuth. See the deployment guide for instructions on setting up a lightweight proxy for LinkedIn data access.
          </div>
        </div>

        <div className="settings-section">
          <h3>WebEx</h3>
          <div className="settings-field">
            <label>Access Token</label>
            <input type="password" value={config.webexToken || ''} onChange={e => update('webexToken', e.target.value)} placeholder="WebEx API token" />
          </div>
        </div>

        <div className="settings-section">
          <h3>Spotify</h3>
          <div className="settings-field">
            <label>Access Token</label>
            <input type="password" value={config.spotifyToken || ''} onChange={e => update('spotifyToken', e.target.value)} placeholder="Spotify access token" />
          </div>
          <div className="settings-field">
            <label>Refresh Token <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>(enables auto-refresh)</span></label>
            <input type="password" value={config.spotifyRefreshToken || ''} onChange={e => update('spotifyRefreshToken', e.target.value)} placeholder="Spotify refresh token" />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            <a href={ENV.SPOTIFY_AUTH_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>Click here to authorize Spotify</a> — copy both tokens from the result page. With a refresh token, your connection stays active permanently.
          </div>
        </div>

        <div className="settings-section">
          <h3>Notifications</h3>
          <button className="btn" onClick={async () => {
            const granted = await requestNotificationPermission();
            if (granted) sendNotification('Notifications Enabled', 'You will receive task reminders and timer alerts.');
          }}>
            <Bell size={14} /> Enable Notifications
          </button>
        </div>

        <div className="settings-section">
          <h3>Export / Import Configuration</h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            Export all settings, JIRA lists, tasks, quick launch links, widget layout, and timezones. Import on another device to sync your setup.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => {
              const exportData = {};
              const keys = ['cmd_config', 'cmd_tasks', 'cmd_voice_notes', 'cmd_jira_lists', 'cmd_launches',
                'cmd_widget_visibility', 'cmd_widget_order', 'cmd_timezones', 'cmd_reminders'];
              keys.forEach(k => { const v = localStorage.getItem(k); if (v) exportData[k] = v; });
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `command-center-config-${new Date().toISOString().split('T')[0]}.json`;
              a.click(); URL.revokeObjectURL(url);
              sendNotification('Config Exported', 'Configuration file downloaded.');
            }}>
              Export Settings
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Import Settings
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const data = JSON.parse(ev.target.result);
                    let count = 0;
                    Object.entries(data).forEach(([key, value]) => {
                      if (key.startsWith('cmd_')) {
                        localStorage.setItem(key, value);
                        count++;
                      }
                    });
                    // Reload config into state
                    const newConfig = JSON.parse(localStorage.getItem('cmd_config') || '{}');
                    Object.keys(newConfig).forEach(k => update(k, newConfig[k]));
                    sendNotification('Config Imported', `${count} settings restored. Refresh the page to apply all changes.`);
                  } catch (err) {
                    sendNotification('Import Failed', 'Invalid configuration file.');
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }} />
            </label>
          </div>
        </div>

        <button className="btn btn-accent" style={{ width: '100%', marginTop: 8, padding: '10px 16px' }} onClick={handleSave}>
          {saved ? <><Check size={14} /> Saved!</> : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
