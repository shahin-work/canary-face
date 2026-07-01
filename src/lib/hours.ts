// ───────────────────────────────────────────────────────────────────────────
//  CENTRALISED ATTENDANCE HOURS  — single source of truth for time math.
//  Every surface (EmployeeCard, EmployeeDetails, MyAttendance, HR Weekly
//  Attendance, exports, mail) imports calcHours / formatters from here so the
//  same day always shows the SAME total everywhere.
//
//  Canonical rules for calcHours():
//    • Merges OVERLAPPING sessions → overlapping/duplicate punches are never
//      double-counted (e.g. the 10-min bonus overlapping a real session).
//    • An in-progress session (check_in but no check_out) counts up to "now"
//      on the current day; on past days it is ignored.
//    • For TODAY only, time ahead of the current clock is clipped to "now".
//    • LEAVE sessions are EXCLUDED from worked hours by default (pass
//      { includeLeave:true } only when you explicitly want leave hours).
//    • Result is rounded to 2 decimal HOURS (e.g. 5.27).
// ───────────────────────────────────────────────────────────────────────────

export interface HourSession {
  check_in?: string;       // "HH:MM" or "HH:MM:SS"
  check_out?: string;
  leave?: boolean;
  [k: string]: any;
}

// minutes since midnight from "HH:MM[:SS]" (seconds included for accuracy)
function toMins(t?: string): number {
  if (!t) return 0;
  const [h, m, s] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0) + (s || 0) / 60;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Worked hours for a day's sessions — the ONE calculation used everywhere.
 *
 * @param sessions  the day's sessions (real DB data; bonus already injected upstream)
 * @param forDate   the day in "YYYY-MM-DD". If omitted, treated as today.
 * @param opts.includeLeave  count leave sessions too (default false → worked only)
 * @returns hours, rounded to 2 decimals
 */
export function calcHours(
  sessions: HourSession[] | null | undefined,
  forDate?: string,
  opts: { includeLeave?: boolean } = {},
): number {
  if (!Array.isArray(sessions) || sessions.length === 0) return 0;

  const now = new Date();
  const todayStr = toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const isToday = !forDate || forDate === todayStr;
  const includeLeave = !!opts.includeLeave;

  // 1) build [start, end] intervals, applying the today/now clipping
  const intervals: [number, number][] = [];
  for (const s of sessions) {
    if (!s || !s.check_in) continue;
    if (s.leave && !includeLeave) continue;     // leave excluded from worked hours

    const start = toMins(s.check_in);
    let end: number;
    if (s.check_out) end = toMins(s.check_out);
    else if (isToday) end = nowMins;            // in-progress today → up to now
    else continue;                              // in-progress on a past day → ignore

    if (isToday) {
      if (start >= nowMins) continue;           // starts in the future → ignore
      if (end > nowMins) end = nowMins;         // clip the end to now
    }
    if (end > start) intervals.push([start, end]);
  }
  if (intervals.length === 0) return 0;

  // 2) merge overlaps so nothing is double-counted
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s <= curEnd) { if (e > curEnd) curEnd = e; }
    else { total += curEnd - curStart; curStart = s; curEnd = e; }
  }
  total += curEnd - curStart;

  return Math.round((total / 60) * 100) / 100;
}

/**
 * How many hours of the WORKED time fall inside the lunch window (13:00–14:00).
 * Used only for the EmployeeDetails "minus lunch" display — it never changes the
 * real worked total. Mirrors calcHours' interval building + today/now clipping, so
 * the subtraction is consistent (overlaps merged, leave excluded).
 *
 * Returns hours (0..1) of overlap, rounded to 2 decimals.
 */
const LUNCH_START_MIN = 13 * 60; // 13:00
const LUNCH_END_MIN   = 14 * 60; // 14:00

export function lunchOverlapHours(
  sessions: HourSession[] | null | undefined,
  forDate?: string,
): number {
  if (!Array.isArray(sessions) || sessions.length === 0) return 0;

  const now = new Date();
  const todayStr = toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const isToday = !forDate || forDate === todayStr;

  // build the same worked intervals calcHours uses
  const intervals: [number, number][] = [];
  for (const s of sessions) {
    if (!s || !s.check_in) continue;
    if (s.leave) continue;                       // worked time only

    const start = toMins(s.check_in);
    let end: number;
    if (s.check_out) end = toMins(s.check_out);
    else if (isToday) end = nowMins;
    else continue;

    if (isToday) {
      if (start >= nowMins) continue;
      if (end > nowMins) end = nowMins;
    }
    if (end > start) intervals.push([start, end]);
  }
  if (intervals.length === 0) return 0;

  // merge overlaps (so a 1–2pm overlap isn't double-subtracted across sessions)
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    const last = merged[merged.length - 1];
    if (s <= last[1]) { if (e > last[1]) last[1] = e; }
    else merged.push([s, e]);
  }

  // sum the part of each merged interval that lies within 13:00–14:00
  let overlap = 0;
  for (const [s, e] of merged) {
    const lo = Math.max(s, LUNCH_START_MIN);
    const hi = Math.min(e, LUNCH_END_MIN);
    if (hi > lo) overlap += hi - lo;
  }
  return Math.round((overlap / 60) * 100) / 100;
}

/**
 * Hours for a SINGLE session (used by the per-session labels on timelines).
 * Same today/now clipping as calcHours.
 */
export function calcSessionHours(s: HourSession, forDate?: string): number {
  if (!s || !s.check_in) return 0;
  const now = new Date();
  const isToday = !forDate || forDate === toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const start = toMins(s.check_in);

  if (isToday && start >= nowMins) return 0;            // entirely in the future
  if (s.check_out) {
    let end = toMins(s.check_out);
    if (isToday && end > nowMins) end = nowMins;        // clip the end to now
    return Math.round((Math.max(0, end - start) / 60) * 100) / 100;
  }
  if (isToday) return Math.round((Math.max(0, nowMins - start) / 60) * 100) / 100;
  return 0;                                             // in-progress on a past day
}

// ── Formatters (decimal hours in → string out) ────────────────────────────────

/** "H.MM" — hours.minutes, NOT decimal. e.g. 5h16m (5.27) → "5.16", 7h6m → "7.06" */
export function fmtHM(h: number): string {
  const totalMins = Math.round(h * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${hh}.${String(mm).padStart(2, "0")}`;
}

/** "8h 30m" / "8h" / "30m" / "0m" — verbose, for labels. */
export function fmtHoursLong(h: number): string {
  const totalMins = Math.round(h * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  if (hh === 0 && mm === 0) return "0m";
  if (hh === 0) return `${mm}m`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}m`;
}
