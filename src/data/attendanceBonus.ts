// ───────────────────────────────────────────────────────────────────────────
//  SPECIAL-CASE ATTENDANCE BONUS  (temporary, isolated)
// ───────────────────────────────────────────────────────────────────────────
//  For ONE specific employee (CDAI014) we add a synthetic 10-minute present
//  session (17:50:00 → 18:00:00) to each WORKING day on which they were present
//  in the second half of the day — i.e. they have at least one REAL (non-leave)
//  check-in at/after 14:00:00.
//
//  Rules (all must hold, else the day's sessions are returned untouched):
//    • emp_id === BONUS_EMP_ID
//    • the date is NOT in the future (historical or today only)
//    • the day is a working day → enforced implicitly: a real afternoon check-in
//      only exists on days the person actually worked (never weekend/holiday)
//    • the day is NOT a leave day (no session with `leave: true`)
//    • there is ≥1 real (non-leave) check-in with time >= 14:00:00
//
//  The bonus is appended as its own session. Downstream hour calculations merge
//  overlapping intervals, so an overlap with a real session is never double-counted.
//
//  TO REMOVE LATER: delete this file + the applyAttendanceBonus() calls (each
//  call site is marked with "ATTENDANCE BONUS").
// ───────────────────────────────────────────────────────────────────────────

const BONUS_EMP_ID = "CDAI014";

const BONUS_CHECK_IN  = "17:50:00";
const BONUS_CHECK_OUT = "18:00:00";
// "second half" window: present at any moment between 14:00 and 18:00 qualifies.
const SECOND_HALF_START = 14 * 60; // 14:00 in minutes
const SECOND_HALF_END   = 18 * 60; // 18:00 in minutes

// minutes since midnight from an "HH:MM[:SS]" string
function toMins(t?: string): number {
  if (!t) return -1;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Returns the day's sessions, possibly with the 10-minute bonus session appended.
 * Safe to call for every (emp, date): it only mutates the result for the special
 * employee on qualifying days, otherwise returns the same array reference shape.
 *
 * @param empId    the employee's id
 * @param date     the day in "YYYY-MM-DD"
 * @param sessions the day's real sessions (from the DB) — may be undefined/empty
 */
export function applyAttendanceBonus<T extends { check_in?: string; leave?: boolean; [k: string]: any }>(
  empId: string,
  date: string,
  sessions: T[] | undefined | null,
): T[] {
  const list = (sessions ?? []) as T[];
  if (empId !== BONUS_EMP_ID) return list;
  if (date > localTodayStr()) return list;            // never future days

  // never on a leave day
  if (list.some(s => s && (s as any).leave)) return list;

  // need ≥1 real (non-leave) session that OVERLAPS the 14:00–18:00 window
  // (i.e. the person was physically present at some point in the second half —
  //  regardless of when they checked in). e.g. 13:30→16:00 overlaps → qualifies.
  const presentSecondHalf = list.some(s => {
    if (!s || (s as any).leave || !s.check_in) return false;
    const start = toMins(s.check_in);
    const end   = (s as any).check_out ? toMins((s as any).check_out) : start;
    return start < SECOND_HALF_END && end > SECOND_HALF_START;   // overlaps [14:00, 18:00)
  });
  if (!presentSecondHalf) return list;

  const bonus = {
    session: list.length + 1,
    check_in: BONUS_CHECK_IN,
    check_out: BONUS_CHECK_OUT,
    bonus: true,           // marker so it can be identified/removed later
    source: "bonus",
  } as unknown as T;

  return [...list, bonus];
}
