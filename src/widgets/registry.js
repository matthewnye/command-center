// ── Widget Registry ──
// Single source of truth for all available widgets.
// To add a new widget: create a component file, then add an entry here.
// The marketplace UI reads from this registry to show available plugins.

import FocusHeartbeatWidget from '../components/FocusHeartbeat';
import HubWidget from '../components/HubWidget';
import EnhancedJiraWidget from '../components/EnhancedJira';
import FocusTimerWidget from '../components/FocusTimerWidget';
import WorldTimezoneWidget from '../components/WorldTimezone';
import PinnedEmailWidget from '../components/PinnedEmail';
import SpotifyWidget from '../components/SpotifyWidget';
import RescueTimeWidget from '../components/RescueTimeWidget';
import LinkedInWidget from '../components/LinkedInWidget';
import MeetingNotesWidget from '../components/MeetingNotesWidget';
import OutlookWidget from '../components/OutlookWidget';
import StockTickerWidget from '../components/StockTickerWidget';
import NetworkStatsWidget from '../components/NetworkStatsWidget';

const WIDGET_REGISTRY = [
  {
    id: 'heartbeat',
    label: 'Focus Heartbeat',
    icon: '💓',
    component: FocusHeartbeatWidget,
    category: 'productivity',
    description: 'Real-time EKG-style productivity pulse powered by RescueTime. Adaptive scoring learns your patterns over time.',
    requires: ['rescueTimeKey'],
    requiresLabel: 'RescueTime API key',
    status: 'stable',
  },
  {
    id: 'hub',
    label: 'Tools',
    icon: '🛠',
    component: HubWidget,
    category: 'utilities',
    description: 'Tasks, voice notes, Unicode text generator, and quick launch bookmarks in a tabbed container.',
    requires: [],
    status: 'stable',
  },
  {
    id: 'jira',
    label: 'JIRA Tickets',
    icon: '🎫',
    component: EnhancedJiraWidget,
    category: 'project-management',
    description: 'Custom JQL queries, inline comments, manual Tempo time logging, and drag tickets to Tasks.',
    requires: ['jiraHost', 'jiraEmail', 'jiraToken'],
    requiresLabel: 'JIRA + Tempo credentials',
    status: 'stable',
  },
  {
    id: 'timer',
    label: 'Focus Timer',
    icon: '⏱️',
    component: FocusTimerWidget,
    category: 'productivity',
    description: 'Pomodoro timer with JIRA ticket tracking. Start from a JIRA ticket to auto-log time.',
    requires: [],
    status: 'stable',
  },
  {
    id: 'timezones',
    label: 'World Clock',
    icon: '🌍',
    component: WorldTimezoneWidget,
    category: 'utilities',
    description: '90+ cities on a zoomable world map. Add pins, view times at a glance.',
    requires: [],
    status: 'stable',
  },
  {
    id: 'pinned',
    label: 'Flagged Emails',
    icon: '📌',
    component: PinnedEmailWidget,
    category: 'communication',
    description: 'Outlook flagged emails. Drag to Tasks to create action items.',
    requires: ['msGraphToken'],
    requiresLabel: 'Microsoft Graph token',
    status: 'stable',
  },
  {
    id: 'spotify',
    label: 'Music',
    icon: '🎵',
    component: SpotifyWidget,
    category: 'entertainment',
    description: 'Spotify playlists, playback controls in the header bar, and top tracks/artists stats.',
    requires: ['spotifyToken'],
    requiresLabel: 'Spotify token',
    status: 'stable',
  },
  {
    id: 'rescuetime',
    label: 'Productivity',
    icon: '📊',
    component: RescueTimeWidget,
    category: 'productivity',
    description: 'Activity breakdown and productivity levels from RescueTime. Auto-refreshes every 5 minutes.',
    requires: ['rescueTimeKey'],
    requiresLabel: 'RescueTime API key',
    status: 'stable',
  },
  {
    id: 'outlook',
    label: 'Outlook',
    icon: '📧',
    component: OutlookWidget,
    category: 'communication',
    description: 'Inbox emails and 3-day calendar view. Meeting links, drag events to Tasks, calendar reminders.',
    requires: ['msGraphToken'],
    requiresLabel: 'Microsoft Graph token',
    status: 'stable',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: '💼',
    component: LinkedInWidget,
    category: 'communication',
    description: 'LinkedIn post tracking and engagement metrics.',
    requires: [],
    requiresLabel: 'LinkedIn OAuth (coming soon)',
    status: 'coming-soon',
  },
  {
    id: 'meetings',
    label: 'Meeting Notes',
    icon: '🎥',
    component: MeetingNotesWidget,
    category: 'communication',
    description: 'Auto-imported meeting notes from Teams and WebEx.',
    requires: [],
    requiresLabel: 'Teams/WebEx integration (coming soon)',
    status: 'coming-soon',
  },
  {
    id: 'teams-recordings',
    label: 'Teams Recordings',
    icon: '🟣',
    component: null,
    category: 'communication',
    description: 'Browse and play your most recent Microsoft Teams meeting recordings. Requires Microsoft Graph permissions.',
    requires: ['msGraphToken'],
    requiresLabel: 'Microsoft Graph token with OnlineMeetings.Read scope',
    status: 'coming-soon',
  },
  {
    id: 'webex-recordings',
    label: 'WebEx Recordings',
    icon: '🟢',
    component: null,
    category: 'communication',
    description: 'Browse and play your most recent Cisco WebEx meeting recordings. Requires WebEx API integration.',
    requires: [],
    requiresLabel: 'WebEx API token (coming soon)',
    status: 'coming-soon',
  },
  {
    id: 'zoom-recordings',
    label: 'Zoom Recordings',
    icon: '🔵',
    component: null,
    category: 'communication',
    description: 'Browse and play your most recent Zoom meeting recordings. Requires Zoom OAuth integration.',
    requires: [],
    requiresLabel: 'Zoom OAuth (coming soon)',
    status: 'coming-soon',
  },
  {
    id: 'gmeet-recordings',
    label: 'Google Meet Recordings',
    icon: '🟡',
    component: null,
    category: 'communication',
    description: 'Browse and play your most recent Google Meet meeting recordings stored in Google Drive.',
    requires: [],
    requiresLabel: 'Google OAuth (coming soon)',
    status: 'coming-soon',
  },
  {
    id: 'stocks',
    label: 'Market Ticker',
    icon: '📈',
    component: StockTickerWidget,
    category: 'finance',
    description: 'Live US stock market quotes with customizable watchlist. Tracks indices (SPY, QQQ, DIA) and individual stocks. Optional scrolling ticker in the header bar replaces the music marquee.',
    requires: ['finnhubKey'],
    requiresLabel: 'Finnhub API key (free)',
    status: 'stable',
  },
  {
    id: 'network',
    label: 'Network Stats',
    icon: '📡',
    component: NetworkStatsWidget,
    category: 'utilities',
    description: 'Real-time network monitoring. Shows connection type (4G/WiFi), estimated bandwidth, latency measurements, external IP address, and a latency history chart. No configuration needed.',
    requires: [],
    status: 'stable',
  },
  {
    id: 'ring',
    label: 'Ring',
    icon: '🔔',
    component: null,
    category: 'smart-home',
    description: 'Ring doorbell and camera feed integration. View live camera snapshots, recent motion events, and doorbell history directly in your dashboard.',
    requires: [],
    requiresLabel: 'Ring API (coming soon — no public API exists yet)',
    status: 'coming-soon',
  },
];

// Category metadata
export const CATEGORIES = {
  'productivity': { label: 'Productivity', icon: '⚡', color: '#6ee7b7' },
  'communication': { label: 'Communication', icon: '💬', color: '#60a5fa' },
  'project-management': { label: 'Project Management', icon: '📋', color: '#c084fc' },
  'entertainment': { label: 'Entertainment', icon: '🎭', color: '#fb923c' },
  'finance': { label: 'Finance', icon: '💰', color: '#fbbf24' },
  'smart-home': { label: 'Smart Home', icon: '🏠', color: '#f472b6' },
  'utilities': { label: 'Utilities', icon: '🔧', color: '#8888a0' },
};

export default WIDGET_REGISTRY;
