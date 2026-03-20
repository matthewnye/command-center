// ── Widget Registry ──
// Single source of truth for all available widgets.
// To add a new widget: create a component file, then add an entry here.

import FocusHeartbeatWidget from '../components/FocusHeartbeat';
import HubWidget from '../components/HubWidget';
import EnhancedJiraWidget from '../components/EnhancedJira';
import FocusTimerWidget from '../components/FocusTimerWidget';
import WorldTimezoneWidget from '../components/WorldTimezone';
import PinnedEmailWidget from '../components/PinnedEmail';
import SpotifyWidget from '../components/SpotifyWidget';
import RescueTimeWidget from '../components/RescueTimeWidget';
import QuickLaunchWidget from '../components/QuickLaunchWidget';
import LinkedInWidget from '../components/LinkedInWidget';
import MeetingNotesWidget from '../components/MeetingNotesWidget';
import OutlookWidget from '../components/OutlookWidget';

const WIDGET_REGISTRY = [
  { id: 'heartbeat',   label: 'Focus Heartbeat',   icon: '💓', component: FocusHeartbeatWidget },
  { id: 'hub',         label: 'Tools',              icon: '🛠', component: HubWidget },
  { id: 'jira',        label: 'JIRA Tickets',      icon: '🎫', component: EnhancedJiraWidget },
  { id: 'timer',       label: 'Focus Timer',       icon: '⏱️', component: FocusTimerWidget },
  { id: 'timezones',   label: 'World Clock',       icon: '🌍', component: WorldTimezoneWidget },
  { id: 'pinned',      label: 'Flagged Emails',     icon: '📌', component: PinnedEmailWidget },
  { id: 'spotify',     label: 'Music',              icon: '🎵', component: SpotifyWidget },
  { id: 'rescuetime',  label: 'Productivity',       icon: '📊', component: RescueTimeWidget },
  { id: 'launch',      label: 'Quick Launch',       icon: '🚀', component: QuickLaunchWidget },
  { id: 'linkedin',    label: 'LinkedIn',           icon: '💼', component: LinkedInWidget },
  { id: 'meetings',    label: 'Meeting Notes',      icon: '🎥', component: MeetingNotesWidget },
  { id: 'outlook',     label: 'Outlook',            icon: '📧', component: OutlookWidget },
];

export default WIDGET_REGISTRY;
