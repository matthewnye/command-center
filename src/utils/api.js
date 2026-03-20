// ── API Integration Layer ──
// Real integrations for JIRA/Tempo/RescueTime
// All external API calls are routed through /api/proxy to bypass CORS

export function getConfig() {
  try {
    const config = JSON.parse(localStorage.getItem('cmd_config') || '{}');
    // If config is empty but backup exists, recover from backup
    if (Object.keys(config).length === 0) {
      const backup = localStorage.getItem('cmd_config_backup');
      if (backup) {
        const recovered = JSON.parse(backup);
        if (Object.keys(recovered).length > 0) {
          console.log('Config recovered from backup');
          localStorage.setItem('cmd_config', backup);
          return recovered;
        }
      }
    }
    return config;
  } catch { return {}; }
}

export function saveConfig(config) {
  // Don't save empty config over existing data
  const existing = JSON.parse(localStorage.getItem('cmd_config') || '{}');
  if (Object.keys(config).length === 0 && Object.keys(existing).length > 0) {
    console.warn('Blocked saving empty config over existing data');
    return;
  }
  localStorage.setItem('cmd_config', JSON.stringify(config));
  // Always keep a backup
  localStorage.setItem('cmd_config_backup', JSON.stringify(config));
}

// ── Proxy Helper ──
// Routes all external API calls through our Vercel serverless function

async function proxyFetch(url, options = {}) {
  const resp = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined,
    }),
  });

  const result = await resp.json();

  if (!resp.ok || !result.ok) {
    throw new Error(result.error || `Proxy error: ${result.status}`);
  }

  return result.data;
}

// ── Microsoft Graph Auto-Refresh ──

async function refreshMsGraphToken() {
  const config = getConfig();
  if (!config.msGraphRefreshToken) return null;
  try {
    const resp = await fetch('/api/ms-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: config.msGraphRefreshToken }),
    });
    const data = await resp.json();
    if (data.ok && data.access_token) {
      const updated = { ...config, msGraphToken: data.access_token };
      if (data.refresh_token) updated.msGraphRefreshToken = data.refresh_token;
      saveConfig(updated);
      console.log('Microsoft Graph token auto-refreshed');
      return data.access_token;
    }
  } catch (err) { console.error('MS Graph refresh failed:', err); }
  return null;
}

async function msGraphFetch(url, token) {
  const data = await proxyFetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  return data;
}

// ── JIRA ──

export async function fetchJiraTickets(config, customJql) {
  if (!config.jiraHost || !config.jiraEmail || !config.jiraToken) return null;
  const jql = customJql || config.jiraJQL || `resolution=Unresolved ORDER BY priority DESC, updated DESC`;
  const auth = btoa(`${config.jiraEmail}:${config.jiraToken}`);
  try {
    const data = await proxyFetch(
      `https://${config.jiraHost}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,status,priority,issuetype,assignee,reporter,project,timetracking,updated`,
      { headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' } }
    );
    return data.issues.map(i => ({
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status?.name,
      statusCategory: i.fields.status?.statusCategory?.key,
      priority: i.fields.priority?.name,
      type: i.fields.issuetype?.name,
      assignee: i.fields.assignee?.displayName || 'Unassigned',
      assigneeId: i.fields.assignee?.accountId || null,
      reporter: i.fields.reporter?.displayName || 'Unknown',
      reporterId: i.fields.reporter?.accountId || null,
      project: i.fields.project?.key,
      projectName: i.fields.project?.name,
      timeSpent: i.fields.timetracking?.timeSpent,
      timeEstimate: i.fields.timetracking?.originalEstimate,
      updated: i.fields.updated,
    }));
  } catch (err) {
    console.error('JIRA fetch error:', err);
    return null;
  }
}

// ── Tempo Time Logging ──

export async function logTempoTime(config, { issueKey, seconds, date, description }) {
  if (!config.tempoToken) { console.error('Tempo: no token'); return null; }
  if (!config.jiraAccountId) { console.error('Tempo: no jiraAccountId — set it in Settings'); return null; }
  
  // Tempo v4 requires numeric issueId, not issueKey. Look it up from JIRA first.
  let issueId = null;
  try {
    const auth = btoa(`${config.jiraEmail}:${config.jiraToken}`);
    const issueData = await proxyFetch(`https://${config.jiraHost}/rest/api/3/issue/${issueKey}?fields=summary`, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    issueId = issueData.id;
    console.log(`Tempo: resolved ${issueKey} to issueId ${issueId}`);
  } catch (err) {
    console.error(`Tempo: failed to look up issueId for ${issueKey}:`, err);
    return null;
  }
  
  if (!issueId) { console.error('Tempo: could not resolve issueId'); return null; }

  const body = {
    issueId: parseInt(issueId),
    timeSpentSeconds: seconds,
    startDate: date || new Date().toLocaleDateString('en-CA'),
    startTime: '09:00:00',
    description: description || '',
    authorAccountId: config.jiraAccountId,
  };
  console.log('Tempo log request:', JSON.stringify(body));
  try {
    const resp = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.tempo.io/4/worklogs',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.tempoToken}`, 'Content-Type': 'application/json' },
        body,
      }),
    });
    const result = await resp.json();
    console.log('Tempo log response:', result.ok, result.status, JSON.stringify(result.data)?.slice(0, 300));
    if (!result.ok) {
      throw new Error(result.data?.errors?.[0]?.message || result.data?.message || `Tempo error: ${result.status}`);
    }
    return result.data;
  } catch (err) {
    console.error('Tempo log error:', err);
    return null;
  }
}

// ── JIRA Comments ──

export async function postJiraComment(config, issueKey, commentBody, isPublic = true) {
  if (!config.jiraHost || !config.jiraEmail || !config.jiraToken) return null;
  const auth = btoa(`${config.jiraEmail}:${config.jiraToken}`);
  try {
    const data = await proxyFetch(`https://${config.jiraHost}/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: {
        body: {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: commentBody }]
          }]
        },
        properties: isPublic ? [{ key: 'sd.public.comment', value: { internal: false } }] : [],
      }
    });
    return data;
  } catch (err) {
    console.error('JIRA comment error:', err);
    return null;
  }
}

// ── JIRA Lists Storage ──

export function getJiraLists() {
  try { return JSON.parse(localStorage.getItem('cmd_jira_lists') || '[]'); }
  catch { return []; }
}

export function saveJiraLists(lists) {
  localStorage.setItem('cmd_jira_lists', JSON.stringify(lists));
}

export const DEFAULT_JIRA_LISTS = [
  { id: 'my-open', name: 'My Open Issues', jql: 'assignee=currentUser() AND resolution=Unresolved ORDER BY priority DESC' },
  { id: 'reported', name: 'Reported by Me', jql: 'reporter=currentUser() AND resolution=Unresolved ORDER BY updated DESC' },
  { id: 'watching', name: 'Watching', jql: 'watcher=currentUser() AND resolution=Unresolved ORDER BY updated DESC' },
];

// ── Outlook Flagged/Pinned Emails ──

export async function fetchOutlookFlaggedEmails(config) {
  if (!config.msGraphToken && !config.msGraphRefreshToken) return null;
  // Use server-side filter: ne 'notFlagged' catches both 'flagged' and 'complete' statuses
  const url = "https://graph.microsoft.com/v1.0/me/messages?$top=30&$orderby=receivedDateTime%20desc&$select=subject,from,receivedDateTime,bodyPreview,isRead,flag,importance&$filter=flag/flagStatus%20ne%20'notFlagged'";
  try {
    const data = await proxyFetch(url, { headers: { 'Authorization': `Bearer ${config.msGraphToken}` } });
    console.log(`Flagged emails loaded: ${data.value?.length || 0}`);
    return data.value || [];
  } catch (err) {
    const newToken = await refreshMsGraphToken();
    if (newToken) {
      try {
        const data = await proxyFetch(url, { headers: { 'Authorization': `Bearer ${newToken}` } });
        console.log(`Flagged emails loaded (retry): ${data.value?.length || 0}`);
        return data.value || [];
      } catch (e) { console.error('Flagged emails retry failed:', e); }
    }
    console.error('Outlook flagged error:', err);
    return null;
  }
}

export function getMockFlaggedEmails() {
  return [
    { subject: 'ACTION: Q2 Budget Approval Needed', from: 'CFO Office', time: 'Today 9:15 AM', preview: 'Please review and approve the Q2 budget allocation by end of week...', importance: 'high' },
    { subject: 'Re: Client contract — final review', from: 'Legal Team', time: 'Yesterday', preview: 'Updated terms attached. Need your sign-off before we send to client...', importance: 'high' },
    { subject: 'Interview feedback for Sr. Engineer role', from: 'HR - Recruiting', time: 'Yesterday', preview: 'Please submit your feedback on the candidate interview from Tuesday...', importance: 'normal' },
    { subject: 'Expense report — receipts missing', from: 'Finance', time: 'Mar 15', preview: 'Your March expense report is missing receipts for the Chicago trip...', importance: 'normal' },
    { subject: 'Renewal: DataDog Enterprise License', from: 'Vendor Management', time: 'Mar 14', preview: 'Our DataDog license expires April 1. Need approval to proceed with renewal...', importance: 'high' },
  ];
}

export async function fetchTempoWorklogs(config) {
  if (!config.tempoToken || !config.jiraAccountId) return null;
  const today = new Date().toLocaleDateString('en-CA');
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-CA');
  try {
    const data = await proxyFetch(`https://api.tempo.io/4/worklogs/user/${config.jiraAccountId}?from=${weekAgo}&to=${today}`, {
      headers: { 'Authorization': `Bearer ${config.tempoToken}` }
    });
    return data;
  } catch (err) {
    console.error('Tempo fetch error:', err);
    return null;
  }
}

// ── RescueTime ──

// Fetch detailed activity data for today, broken by productivity level
export async function fetchRescueTimeData(config) {
  if (!config.rescueTimeKey) return null;
  const today = new Date().toLocaleDateString('en-CA');
  try {
    const data = await proxyFetch(`https://www.rescuetime.com/anapi/data?key=${config.rescueTimeKey}&format=json&perspective=rank&restrict_kind=productivity&interval=hour&restrict_begin=${today}&restrict_end=${today}`);
    return data;
  } catch (err) {
    console.error('RescueTime error:', err);
    return null;
  }
}

// Fetch today's daily summary — includes productivity_pulse (0-100)
export async function fetchRescueTimeSummary(config) {
  if (!config.rescueTimeKey) return null;
  try {
    const data = await proxyFetch(`https://www.rescuetime.com/anapi/daily_summary_feed?key=${config.rescueTimeKey}&format=json`);
    return data;
  } catch (err) {
    console.error('RescueTime summary error:', err);
    return null;
  }
}

// Fetch current-hour efficiency data for real-time heartbeat
// Uses the "interval=minute" resolution restricted to the last hour
export async function fetchRescueTimeCurrentPulse(config) {
  if (!config.rescueTimeKey) return null;
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const today = now.toLocaleDateString('en-CA');
  try {
    // Get productivity-categorized time for the last hour
    const data = await proxyFetch(
      `https://www.rescuetime.com/anapi/data?key=${config.rescueTimeKey}` +
      `&format=json&perspective=rank&restrict_kind=productivity` +
      `&interval=hour&restrict_begin=${today}&restrict_end=${today}`
    );

    // RescueTime productivity levels:
    //   -2 = Very Distracting, -1 = Distracting, 0 = Neutral,
    //    1 = Productive, 2 = Very Productive
    // rows: [Rank, Time (sec), Num People, Productivity]
    const rows = data.rows || [];
    let totalSeconds = 0;
    let weightedSum = 0;

    for (const row of rows) {
      const seconds = row[1];
      const productivity = row[3]; // -2 to 2
      totalSeconds += seconds;
      // Normalize: -2..2 → 0..100
      weightedSum += seconds * ((productivity + 2) / 4) * 100;
    }

    const score = totalSeconds > 0 ? Math.round(weightedSum / totalSeconds) : null;

    // Also build category breakdown
    const categories = {};
    for (const row of rows) {
      const level = row[3];
      const label = level === 2 ? 'Very Productive' : level === 1 ? 'Productive' :
                    level === 0 ? 'Neutral' : level === -1 ? 'Distracting' : 'Very Distracting';
      const color = level === 2 ? '#6ee7b7' : level === 1 ? '#60a5fa' :
                    level === 0 ? '#8888a0' : level === -1 ? '#fbbf24' : '#f87171';
      if (!categories[label]) categories[label] = { seconds: 0, color, level };
      categories[label].seconds += row[1];
    }

    return {
      score,
      totalSeconds,
      totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
      categories: Object.entries(categories)
        .map(([name, data]) => ({ name, hours: Math.round((data.seconds / 3600) * 10) / 10, ...data }))
        .sort((a, b) => b.level - a.level),
      lastUpdated: Date.now(),
    };
  } catch (err) {
    console.error('RescueTime pulse error:', err);
    return null;
  }
}

// Combined fetch: gets both the pulse score and the daily summary
export async function fetchRescueTimeFull(config) {
  if (!config.rescueTimeKey) return null;
  const [pulse, summaryArr] = await Promise.all([
    fetchRescueTimeCurrentPulse(config),
    fetchRescueTimeSummary(config),
  ]);

  const summary = Array.isArray(summaryArr) && summaryArr.length > 0 ? summaryArr[0] : null;

  return {
    score: pulse?.score ?? (summary?.productivity_pulse ?? null),
    dailyPulse: summary?.productivity_pulse ?? null,
    productiveHours: summary?.all_productive_hours ?? null,
    distractingHours: summary?.all_distracting_hours ?? null,
    totalHours: (pulse?.totalHours > 0 ? pulse.totalHours : null) ?? summary?.total_hours ?? null,
    categories: (pulse?.categories?.length > 0 ? pulse.categories : null) ?? null,
    lastUpdated: Date.now(),
  };
}

// Fetch activities grouped by category name (Software Development, Email, etc.)
export async function fetchRescueTimeActivities(config) {
  if (!config.rescueTimeKey) return null;
  const today = new Date().toLocaleDateString('en-CA');
  try {
    const data = await proxyFetch(
      `https://www.rescuetime.com/anapi/data?key=${config.rescueTimeKey}&format=json&perspective=rank&restrict_kind=overview&interval=day&restrict_begin=${today}&restrict_end=${today}`
    );
    const rows = data.rows || [];
    const activityColors = {
      'Software Development': 'var(--accent)',
      'Communication & Scheduling': 'var(--info)',
      'Reference & Learning': 'var(--purple)',
      'Social Networking': 'var(--warning)',
      'Entertainment': 'var(--danger)',
      'News & Opinion': 'var(--warning)',
      'Shopping': 'var(--danger)',
      'Utilities': 'var(--text-muted)',
      'Design & Composition': 'var(--purple)',
      'Business': 'var(--info)',
      'Uncategorized': 'var(--text-muted)',
    };
    // rows: [Rank, Time (sec), Num People, Category]
    return rows.map(row => ({
      name: row[3] || 'Other',
      hours: Math.round((row[1] / 3600) * 10) / 10,
      color: activityColors[row[3]] || 'var(--text-muted)',
    })).filter(c => c.hours > 0).sort((a, b) => b.hours - a.hours);
  } catch (err) {
    console.error('RescueTime activities error:', err);
    return null;
  }
}

// ── Microsoft Graph (Outlook/Teams) ──
// These require OAuth — placeholder for integration

export async function fetchOutlookEmails(config) {
  if (!config.msGraphToken && !config.msGraphRefreshToken) return null;
  let token = config.msGraphToken;
  try {
    const data = await proxyFetch('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=10&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,bodyPreview,isRead', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return data.value;
  } catch (err) {
    // Try refresh
    const newToken = await refreshMsGraphToken();
    if (newToken) {
      try {
        const data = await proxyFetch('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=10&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,bodyPreview,isRead', {
          headers: { 'Authorization': `Bearer ${newToken}` }
        });
        return data.value;
      } catch (e) { console.error('Outlook retry failed:', e); }
    }
    console.error('Outlook error:', err);
    return null;
  }
}

export async function fetchOutlookCalendar(config) {
  if (!config.msGraphToken && !config.msGraphRefreshToken) return null;
  let token = config.msGraphToken;
  const now = new Date().toISOString();
  const future = new Date(); future.setDate(future.getDate() + 3); future.setHours(23, 59, 59);
  const end = future.toISOString();
  try {
    const data = await proxyFetch(`https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now}&endDateTime=${end}&$orderby=start/dateTime&$top=30`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Prefer': 'outlook.timezone="UTC"' }
    });
    return data.value;
  } catch (err) {
    const newToken = await refreshMsGraphToken();
    if (newToken) {
      try {
        const data = await proxyFetch(`https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now}&endDateTime=${end}&$orderby=start/dateTime&$top=30`, {
          headers: { 'Authorization': `Bearer ${newToken}`, 'Prefer': 'outlook.timezone="UTC"' }
        });
        return data.value;
      } catch (e) { console.error('Calendar retry failed:', e); }
    }
    console.error('Calendar error:', err);
    return null;
  }
}

// ── LinkedIn (requires backend OAuth) ──

export async function fetchLinkedInMetrics(config) {
  // LinkedIn API requires server-side OAuth
  // Return null to show placeholder
  return null;
}

// ── Mock Data Generators (for placeholder display) ──

export function getMockEmails() {
  return [
    { subject: 'Q2 OKR Review — Action Items', from: 'Sarah Chen', time: '10:42 AM', preview: 'Following up from our discussion on the product roadmap priorities...', isRead: false },
    { subject: 'Re: Sprint 14 Retro Notes', from: 'Mike Rivera', time: '9:15 AM', preview: 'Added the updated velocity chart to the shared doc. Let me know if...', isRead: false },
    { subject: 'Infrastructure Cost Report', from: 'DevOps Team', time: '8:30 AM', preview: 'Monthly AWS cost breakdown attached. Notable increase in Lambda...', isRead: true },
    { subject: 'Updated Design System v3.2', from: 'Priya Patel', time: 'Yesterday', preview: 'New component library pushed to Figma. Key changes include...', isRead: true },
    { subject: 'Vendor Contract Renewal', from: 'Legal', time: 'Yesterday', preview: 'Please review the updated terms for the DataDog enterprise agreement...', isRead: true },
  ];
}

export function getMockCalendar() {
  const today = new Date();
  const events = [
    { title: 'Daily Standup', time: '9:00', duration: '15m', color: 'var(--accent)', location: 'Teams' },
    { title: 'Sprint Planning', time: '10:00', duration: '1h', color: 'var(--info)', location: 'Conf Room B' },
    { title: 'Design Review', time: '13:00', duration: '45m', color: 'var(--purple)', location: 'WebEx' },
    { title: '1:1 with Manager', time: '14:30', duration: '30m', color: 'var(--warning)', location: 'Teams' },
    { title: 'Tech Debt Triage', time: '16:00', duration: '30m', color: 'var(--danger)', location: 'Slack Huddle' },
  ];
  return events;
}

export function getMockJiraTickets() {
  return [
    { key: 'PROJ-1234', summary: 'Implement OAuth2 refresh token rotation', status: 'In Progress', priority: 'High', type: 'Story', statusCategory: 'indeterminate', project: 'PROJ', projectName: 'Platform', assignee: 'You', reporter: 'Sarah Chen', updated: '2026-03-17T10:00:00Z' },
    { key: 'PROJ-1201', summary: 'Fix memory leak in WebSocket handler', status: 'In Review', priority: 'Critical', type: 'Bug', statusCategory: 'indeterminate', project: 'PROJ', projectName: 'Platform', assignee: 'You', reporter: 'Mike Rivera', updated: '2026-03-17T09:30:00Z' },
    { key: 'PROJ-1189', summary: 'Add rate limiting to public API endpoints', status: 'To Do', priority: 'High', type: 'Story', statusCategory: 'new', project: 'PROJ', projectName: 'Platform', assignee: 'You', reporter: 'You', updated: '2026-03-16T14:00:00Z' },
    { key: 'DATA-445', summary: 'Update dependency versions for security audit', status: 'To Do', priority: 'Medium', type: 'Task', statusCategory: 'new', project: 'DATA', projectName: 'Data Pipeline', assignee: 'Priya Patel', reporter: 'You', updated: '2026-03-16T11:00:00Z' },
    { key: 'DATA-432', summary: 'Design system — Dark mode color tokens', status: 'In Progress', priority: 'Medium', type: 'Story', statusCategory: 'indeterminate', project: 'DATA', projectName: 'Data Pipeline', assignee: 'You', reporter: 'Priya Patel', updated: '2026-03-15T16:00:00Z' },
    { key: 'INFRA-88', summary: 'Write integration tests for payment flow', status: 'To Do', priority: 'Low', type: 'Task', statusCategory: 'new', project: 'INFRA', projectName: 'Infrastructure', assignee: 'Mike Rivera', reporter: 'Sarah Chen', updated: '2026-03-15T09:00:00Z' },
    { key: 'INFRA-91', summary: 'Migrate Redis cluster to new region', status: 'To Do', priority: 'High', type: 'Task', statusCategory: 'new', project: 'INFRA', projectName: 'Infrastructure', assignee: 'You', reporter: 'DevOps Team', updated: '2026-03-14T15:00:00Z' },
    { key: 'PROJ-1250', summary: 'Implement SSO for enterprise clients', status: 'In Progress', priority: 'High', type: 'Story', statusCategory: 'indeterminate', project: 'PROJ', projectName: 'Platform', assignee: 'Sarah Chen', reporter: 'You', updated: '2026-03-14T10:00:00Z' },
  ];
}

export function getMockLinkedInData() {
  return {
    posts: [
      { title: 'Engineering leadership lessons...', impressions: 12453, likes: 234, comments: 47, date: '3 days ago' },
      { title: 'Why we moved to a monorepo...', impressions: 8901, likes: 156, comments: 31, date: '1 week ago' },
      { title: '5 things I learned from scaling...', impressions: 21087, likes: 412, comments: 89, date: '2 weeks ago' },
    ],
    adCampaigns: [
      { name: 'Brand Awareness Q1', spend: 2450, impressions: 145000, clicks: 3200, ctr: '2.21%', status: 'Active' },
      { name: 'Talent Recruitment', spend: 1800, impressions: 89000, clicks: 1900, ctr: '2.13%', status: 'Active' },
    ],
    profileViews: 847,
    searchAppearances: 234,
    connectionRequests: 12,
  };
}

export function getMockRescueTimeData() {
  return {
    productivityScore: 74,
    totalHours: 6.2,
    categories: [
      { name: 'Software Dev', hours: 3.1, productivity: 2, color: 'var(--accent)' },
      { name: 'Communication', hours: 1.4, productivity: 1, color: 'var(--info)' },
      { name: 'Reference', hours: 0.8, productivity: 1, color: 'var(--purple)' },
      { name: 'Social Media', hours: 0.5, productivity: -1, color: 'var(--warning)' },
      { name: 'Entertainment', hours: 0.2, productivity: -2, color: 'var(--danger)' },
      { name: 'Other', hours: 0.2, productivity: 0, color: 'var(--text-muted)' },
    ]
  };
}

export function getMockMeetingNotes() {
  return [
    { title: 'Sprint 14 Planning', platform: 'Teams', date: 'Today, 10:00 AM', duration: '58 min', summary: 'Discussed Q2 priorities. Agreed on 34 story points. Key decisions: defer infrastructure migration to Sprint 16, prioritize auth refactor.' },
    { title: 'Design System Review', platform: 'WebEx', date: 'Yesterday, 2:00 PM', duration: '42 min', summary: 'Reviewed dark mode tokens. Action: update Figma library by Friday. Discussed component API changes for v3.' },
    { title: 'Client Demo — Acme Corp', platform: 'WebEx', date: 'Mar 15, 11:00 AM', duration: '35 min', summary: 'Demoed new dashboard features. Client requested export to PDF functionality. Follow-up scheduled for next Tuesday.' },
  ];
}
