// ═══════════════════════════════════════════════════════════════
// ADAPTIVE PRODUCTIVITY ENGINE
//
// Collects granular snapshots, cross-references with calendar,
// builds personal baselines, and computes context-aware scores.
// All data stored in localStorage — no server needed.
// ═══════════════════════════════════════════════════════════════

import { getConfig, fetchOutlookCalendar } from './api';

const STORAGE_KEY = 'cmd_adaptive';
const SNAPSHOT_KEY = 'cmd_adaptive_snapshots';
const BASELINE_KEY = 'cmd_adaptive_baselines';

// ── Data Storage ──

function loadStore(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}
function saveStore(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.warn('Adaptive: storage full', e); }
}

// ── Snapshot Collection ──
// Called every poll interval (~60s) with current RescueTime data

export function recordSnapshot(rtData, calendarEvents) {
  const now = Date.now();
  const today = new Date().toLocaleDateString('en-CA');
  const hour = new Date().getHours();
  const dayOfWeek = new Date().getDay(); // 0=Sun

  const snapshots = loadStore(SNAPSHOT_KEY) || {};
  if (!snapshots[today]) snapshots[today] = [];

  // Don't record more than once per minute
  const lastSnap = snapshots[today][snapshots[today].length - 1];
  if (lastSnap && now - lastSnap.t < 55000) return;

  // Determine if currently in a meeting
  const inMeeting = isInMeeting(calendarEvents);

  snapshots[today].push({
    t: now,
    h: hour,
    dow: dayOfWeek,
    score: rtData?.score ?? null,
    totalHrs: rtData?.totalHours ?? 0,
    emailMins: getEmailMinsFromData(rtData),
    productiveHrs: rtData?.productiveHours ?? 0,
    distractingHrs: rtData?.distractingHours ?? 0,
    inMeeting,
    categories: (rtData?.categories || []).map(c => ({ n: c.name, h: c.hours })),
  });

  // Cap at 600 snapshots per day (10 hours at 1/min)
  if (snapshots[today].length > 600) snapshots[today] = snapshots[today].slice(-600);

  // Keep only last 60 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toLocaleDateString('en-CA');
  for (const key of Object.keys(snapshots)) {
    if (key < cutoffStr) delete snapshots[key];
  }

  saveStore(SNAPSHOT_KEY, snapshots);
}

function getEmailMinsFromData(data) {
  if (!data?.activities?.length) return 0;
  const emailCats = data.activities.filter(c =>
    c.name?.toLowerCase().includes('communication') ||
    c.name?.toLowerCase().includes('email')
  );
  return Math.round(emailCats.reduce((sum, c) => sum + (c.hours || 0), 0) * 60);
}

// ── Calendar Integration ──

function isInMeeting(events) {
  if (!events || events.length === 0) return false;
  const now = Date.now();
  return events.some(e => {
    if (!e.startISO) return false;
    const start = new Date(e.startISO).getTime();
    // Estimate 30min duration if no end time
    const end = e.endISO ? new Date(e.endISO).getTime() : start + 30 * 60000;
    return now >= start && now <= end;
  });
}

// ── Idle Classification ──
// Returns { totalIdle, meetingIdle, actualIdle, breakdown }

export function classifyIdleTime(rtData, calendarEvents) {
  const now = new Date();
  const startOfWork = new Date(now);
  startOfWork.setHours(8, 0, 0, 0);
  if (now < startOfWork) return { totalIdle: 0, meetingIdle: 0, actualIdle: 0, breakdown: [] };

  const hoursElapsed = Math.min((now.getTime() - startOfWork.getTime()) / 3600000, 14);
  const trackedHours = rtData?.totalHours || 0;
  const totalIdleMins = Math.max(0, Math.round((hoursElapsed - trackedHours) * 60));

  if (!calendarEvents || calendarEvents.length === 0) {
    return { totalIdle: totalIdleMins, meetingIdle: 0, actualIdle: totalIdleMins, breakdown: [{ type: 'idle', mins: totalIdleMins }] };
  }

  // Calculate total meeting time today during work hours
  let meetingMins = 0;
  const todayStart = startOfWork.getTime();
  const nowMs = now.getTime();

  calendarEvents.forEach(e => {
    if (!e.startISO) return;
    const start = Math.max(new Date(e.startISO).getTime(), todayStart);
    const end = e.endISO ? Math.min(new Date(e.endISO).getTime(), nowMs) : Math.min(start + 30 * 60000, nowMs);
    if (end > start) meetingMins += (end - start) / 60000;
  });

  // Meeting idle = min of meeting time and total idle (can't have more meeting idle than total idle)
  const meetingIdle = Math.min(Math.round(meetingMins), totalIdleMins);
  const actualIdle = Math.max(0, totalIdleMins - meetingIdle);

  return {
    totalIdle: totalIdleMins,
    meetingIdle,
    actualIdle,
    breakdown: [
      ...(meetingIdle > 0 ? [{ type: 'meeting', mins: meetingIdle, label: 'In Meetings' }] : []),
      ...(actualIdle > 0 ? [{ type: 'idle', mins: actualIdle, label: 'Away/Idle' }] : []),
    ],
  };
}

// ── Baseline Computation ──
// Computes personal averages from historical data

export function computeBaselines() {
  const snapshots = loadStore(SNAPSHOT_KEY) || {};
  const days = Object.keys(snapshots).sort();
  if (days.length < 3) return null; // Need at least 3 days

  // Aggregate by day
  const dailyStats = days.map(day => {
    const snaps = snapshots[day];
    if (!snaps || snaps.length === 0) return null;
    const scores = snaps.filter(s => s.score != null).map(s => s.score);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const lastSnap = snaps[snaps.length - 1];
    const dow = snaps[0].dow;

    return {
      day,
      dow,
      avgScore,
      totalHrs: lastSnap.totalHrs,
      emailMins: lastSnap.emailMins,
      productiveHrs: lastSnap.productiveHrs,
      distractingHrs: lastSnap.distractingHrs,
      snapshotCount: snaps.length,
    };
  }).filter(Boolean);

  if (dailyStats.length < 3) return null;

  // Overall averages
  const overallAvg = {
    score: avg(dailyStats.map(d => d.avgScore).filter(Boolean)),
    totalHrs: avg(dailyStats.map(d => d.totalHrs)),
    emailMins: avg(dailyStats.map(d => d.emailMins)),
    productiveHrs: avg(dailyStats.map(d => d.productiveHrs)),
  };

  // By day of week (0=Sun...6=Sat)
  const byDow = {};
  for (let i = 0; i < 7; i++) {
    const dowDays = dailyStats.filter(d => d.dow === i);
    if (dowDays.length > 0) {
      byDow[i] = {
        score: avg(dowDays.map(d => d.avgScore).filter(Boolean)),
        totalHrs: avg(dowDays.map(d => d.totalHrs)),
        sampleSize: dowDays.length,
      };
    }
  }

  // By hour of day (aggregate snapshots across all days)
  const byHour = {};
  for (const day of days) {
    for (const snap of (snapshots[day] || [])) {
      if (snap.score == null) continue;
      if (!byHour[snap.h]) byHour[snap.h] = [];
      byHour[snap.h].push(snap.score);
    }
  }
  const hourlyAvg = {};
  for (const h of Object.keys(byHour)) {
    hourlyAvg[h] = avg(byHour[h]);
  }

  // Standard deviation for anomaly detection
  const scoreStdDev = stdDev(dailyStats.map(d => d.avgScore).filter(Boolean));

  const baselines = {
    overall: overallAvg,
    byDow,
    byHour: hourlyAvg,
    scoreStdDev,
    daysOfData: dailyStats.length,
    lastComputed: Date.now(),
  };

  saveStore(BASELINE_KEY, baselines);
  return baselines;
}

// ── Adaptive Score ──
// Computes a context-weighted score with explainable components

export function computeAdaptiveScore(rtData, calendarEvents, baselines) {
  const rawScore = rtData?.score ?? null;
  if (rawScore == null) return null;

  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay();
  const inMeeting = isInMeeting(calendarEvents);

  // Start with raw RescueTime score
  let components = {
    raw: rawScore,
    meetingAdjustment: 0,
    timeOfDayFactor: 1,
    baselineComparison: null,
    final: rawScore,
  };

  // Meeting context: if in a meeting with low RT score, don't penalize
  if (inMeeting && rawScore < 50) {
    // During meetings, bump score to at least 50 (neutral) since you're working
    components.meetingAdjustment = Math.max(0, 50 - rawScore);
  }

  // Time-of-day factor from baselines
  if (baselines?.byHour?.[hour] != null) {
    const hourAvg = baselines.byHour[hour];
    if (hourAvg > 0) {
      // If you're typically 60% productive at 2pm but 80% at 10am,
      // scoring 60% at 2pm is actually on-par, not bad
      components.timeOfDayFactor = hourAvg > 0 ? rawScore / hourAvg : 1;
    }
  }

  // Baseline comparison
  if (baselines?.overall?.score) {
    components.baselineComparison = rawScore - baselines.overall.score;
  }

  // Day-of-week comparison
  if (baselines?.byDow?.[dow]?.score) {
    components.dowComparison = rawScore - baselines.byDow[dow].score;
    components.dowAvg = baselines.byDow[dow].score;
  }

  // Compute final adaptive score
  let final = rawScore + components.meetingAdjustment;
  final = Math.max(0, Math.min(100, final));
  components.final = Math.round(final);

  return components;
}

// ── KPI Drill-Down Data ──

export function getKPIDrillDown(kpiType, rtData, calendarEvents, baselines) {
  const snapshots = loadStore(SNAPSHOT_KEY) || {};
  const today = new Date().toLocaleDateString('en-CA');
  const todaySnaps = snapshots[today] || [];

  switch (kpiType) {
    case 'email': {
      const currentMins = getEmailMinsFromData(rtData);
      const avgMins = baselines?.overall?.emailMins ?? null;
      // Hourly breakdown from today's snapshots
      const hourly = {};
      todaySnaps.forEach(s => {
        if (!hourly[s.h]) hourly[s.h] = { mins: 0, count: 0 };
        hourly[s.h].mins = Math.max(hourly[s.h].mins, s.emailMins || 0);
        hourly[s.h].count++;
      });
      return {
        current: currentMins,
        avgDaily: avgMins ? Math.round(avgMins) : null,
        vsAvg: avgMins ? currentMins - Math.round(avgMins) : null,
        hourlyPeak: Object.entries(hourly).sort((a, b) => b[1].mins - a[1].mins)[0],
        label: currentMins > (avgMins || 999) ? 'Above your daily average' : 'Below your daily average',
      };
    }

    case 'idle': {
      const idle = classifyIdleTime(rtData, calendarEvents);
      return {
        total: idle.totalIdle,
        inMeetings: idle.meetingIdle,
        actualIdle: idle.actualIdle,
        breakdown: idle.breakdown,
        label: idle.meetingIdle > 0
          ? `${idle.meetingIdle}m in meetings, ${idle.actualIdle}m away`
          : `${idle.actualIdle}m away from computer`,
      };
    }

    case 'focus': {
      const score = rtData?.score ?? 0;
      const adaptive = computeAdaptiveScore(rtData, calendarEvents, baselines);
      const days = Object.keys(snapshots).sort().slice(-7);
      const weeklyScores = days.map(d => {
        const snaps = snapshots[d] || [];
        const scores = snaps.filter(s => s.score != null).map(s => s.score);
        return { day: d, avg: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
      }).filter(d => d.avg != null);

      return {
        current: score,
        adaptive,
        weeklyScores,
        overallAvg: baselines?.overall?.score ? Math.round(baselines.overall.score) : null,
        dowAvg: adaptive?.dowAvg ? Math.round(adaptive.dowAvg) : null,
        daysOfData: baselines?.daysOfData ?? 0,
        inMeeting: isInMeeting(calendarEvents),
      };
    }

    case 'tabs': {
      // Tab switches don't have historical data from RT
      return { label: 'Browser tab switch count (this session only)' };
    }

    default: return null;
  }
}

// ── Trend Analysis ──

export function getWeeklyTrend() {
  const snapshots = loadStore(SNAPSHOT_KEY) || {};
  const days = Object.keys(snapshots).sort().slice(-14);
  return days.map(day => {
    const snaps = snapshots[day] || [];
    const scores = snaps.filter(s => s.score != null).map(s => s.score);
    return {
      day,
      dayLabel: new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      totalHrs: snaps.length > 0 ? snaps[snaps.length - 1].totalHrs : 0,
      snapCount: snaps.length,
    };
  });
}

// ── Helpers ──

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  const mean = avg(arr);
  const squareDiffs = arr.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(avg(squareDiffs));
}
