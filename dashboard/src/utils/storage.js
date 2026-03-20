// ── Local Storage Helpers ──

export function loadTasks() {
  try { return JSON.parse(localStorage.getItem('cmd_tasks') || '[]'); }
  catch { return []; }
}

export function saveTasks(tasks) {
  localStorage.setItem('cmd_tasks', JSON.stringify(tasks));
}

export function loadVoiceNotes() {
  try { return JSON.parse(localStorage.getItem('cmd_voice_notes') || '[]'); }
  catch { return []; }
}

export function saveVoiceNotes(notes) {
  localStorage.setItem('cmd_voice_notes', JSON.stringify(notes));
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
