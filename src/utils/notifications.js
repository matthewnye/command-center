// ── Notification & Reminder System ──

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: options.tag || 'cmd-center',
    ...options,
  });
  if (options.onClick) n.onclick = options.onClick;
  return n;
}

// Schedule a reminder at a specific time
export function scheduleReminder(title, body, dateTime, id) {
  const ms = new Date(dateTime).getTime() - Date.now();
  if (ms <= 0) return null;
  const timerId = setTimeout(() => {
    sendNotification(title, body, { tag: id });
    removeReminder(id);
  }, ms);
  
  // Store reminder info
  const reminders = getReminders();
  reminders.push({ id, title, body, dateTime, timerId });
  saveReminders(reminders);
  return timerId;
}

export function getReminders() {
  try {
    return JSON.parse(localStorage.getItem('cmd_reminders') || '[]');
  } catch { return []; }
}

function saveReminders(reminders) {
  localStorage.setItem('cmd_reminders', JSON.stringify(
    reminders.map(r => ({ ...r, timerId: undefined }))
  ));
}

function removeReminder(id) {
  const reminders = getReminders().filter(r => r.id !== id);
  saveReminders(reminders);
}

// Restore reminders on app load
export function restoreReminders() {
  const reminders = getReminders();
  const active = [];
  for (const r of reminders) {
    const ms = new Date(r.dateTime).getTime() - Date.now();
    if (ms > 0) {
      const timerId = setTimeout(() => {
        sendNotification(r.title, r.body, { tag: r.id });
        removeReminder(r.id);
      }, ms);
      active.push({ ...r, timerId });
    }
  }
  saveReminders(active);
}
