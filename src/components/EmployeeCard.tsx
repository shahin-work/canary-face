interface Session {
  session: number;
  check_in: string;
  check_out?: string;
}

interface DayStatus {
  date: string;
  status: "present" | "absent" | "weekend" | "holiday" | "future";
  sessions?: Session[];
  totalHours?: number;
}

interface EmployeeCardData {
  emp_id: string;
  name: string;
  department: string;
  type: string;
  profile_image?: string;
  weekDays: DayStatus[];
  presentDays: number;
  totalHours: number;
  attendancePercent: number;
  todayStatus: "present" | "checked-in" | "absent";
  overtimeHours: number;
  currentlyIn: boolean;
}

interface Props {
  data: EmployeeCardData;
  viewMode: "week" | "month";
  onClick: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  permanent: "#FFD700",
  consultant: "#60A5FA",
  intern:     "#C084FC",
};

const MON_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function getDayLetter(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// Granular green scale — darker for fewer hours, brighter for more
// 0 = just checked in, 1h..10h+ progressive ramp
function presentBarColor(hrs: number): string {
  if (hrs === 0)       return "#0D300F"; // just checked in
  if (hrs < 1)         return "#0D300F";
  if (hrs < 2)         return "#0F3D12";
  if (hrs < 3)         return "#115417";
  if (hrs < 4)         return "#13661A";
  if (hrs < 5)         return "#15731B";
  if (hrs < 6)         return "#17841D";
  if (hrs < 7)         return "#1A9720";
  if (hrs < 8)         return "#1CAB23";
  if (hrs < 9)         return "#12B31E";
  if (hrs < 10)        return "#3ED95A";
  return "#80FF8A";                      // 10h+
}

// Mon-first week grid padding: (getDay()+6)%7 → 0=Mon…6=Sun
function chunkIntoWeekRows(days: DayStatus[]): (DayStatus | null)[][] {
  if (days.length === 0) return [];
  const firstDow  = new Date(days[0].date).getDay();
  const padBefore = (firstDow + 6) % 7;
  const padded: (DayStatus | null)[] = [...Array(padBefore).fill(null), ...days];
  while (padded.length % 7 !== 0) padded.push(null);
  const rows: (DayStatus | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) rows.push(padded.slice(i, i + 7));
  return rows;
}

export default function EmployeeCard({ data, viewMode, onClick }: Props) {
  const today     = new Date().toISOString().split("T")[0];
  const typeColor = TYPE_COLORS[data.type] || "#FFD700";

  const statusCfg =
    data.todayStatus === "checked-in"
      ? { color: "#FACC15", bg: "rgba(250,204,21,0.12)", border: "rgba(250,204,21,0.35)", dot: true,  text: "IN"  }
      : data.todayStatus === "present"
      ? { color: "#4ADE80", bg: "rgba(74,222,128,0.1)",  border: "rgba(74,222,128,0.3)",  dot: false, text: "OUT" }
      : { color: "#F87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)", dot: false, text: "ABS" };

  const weekRows = viewMode === "month" ? chunkIntoWeekRows(data.weekDays) : null;

  // ── bar colour helper (used in both week and month) ──
  function barBg(day: DayStatus): string {
    if (day.status === "present") return presentBarColor(day.totalHours ?? 0);
    if (day.status === "absent")  return "rgba(239,68,68,0.5)";
    if (day.status === "holiday") return "rgba(251,191,36,0.25)";   // amber — brighter than weekend
    if (day.status === "weekend") return "rgba(99,102,241,0.13)";
    return "rgba(15,20,60,0.5)"; // future
  }

  // ── single bar cell ──
  // isCheckedIn = currently inside (no checkout yet on this day)
  function WeekBar({ day, isCheckedIn = false }: { day: DayStatus; isCheckedIn?: boolean }) {
    const isToday   = day.date === today;
    const isPresent = day.status === "present";
    const isAbsent  = day.status === "absent";
    const isHoliday = day.status === "holiday";
    const isFuture  = day.status === "future";
    const hrs       = day.totalHours ?? 0;

    // For currently-checked-in: use a mid-green so it's clearly visible
    const bg = isCheckedIn && isPresent && hrs === 0
      ? "#15731B"   // 4h equiv green for "in progress"
      : barBg(day);

    const textColor = (() => {
      if (!isPresent) return "#001a00";
      if (isCheckedIn && hrs === 0) return "rgba(150,255,150,0.9)";
      return hrs < 5 ? "rgba(150,255,150,0.85)" : "#001a00";
    })();

    return (
      <div style={{
        width: "100%", height: 28, background: bg, borderRadius: 3,
        opacity: isFuture ? 0.22 : 1,
        outline: isToday ? `1.5px solid #FFD700` : "none",
        outlineOffset: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isPresent && (isCheckedIn && hrs === 0) && (
          <span style={{ color: "rgba(150,255,150,0.9)", fontSize: 8, fontWeight: 800, letterSpacing: 0.3 }}>IN</span>
        )}
        {isPresent && hrs > 0 && (
          <span style={{
            color: textColor,
            fontSize: 9.5, fontWeight: 900,
            fontFamily: "'JetBrains Mono',monospace", lineHeight: 1, letterSpacing: -0.5,
          }}>
            {hrs}h
          </span>
        )}
        {isAbsent && (
          <span style={{ color: "rgba(248,80,80,0.55)", fontSize: 9, fontWeight: 700 }}>✕</span>
        )}
        {isHoliday && (
          <span style={{ color: "rgba(251,191,36,0.7)", fontSize: 7.5, fontWeight: 700 }}>★</span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: "linear-gradient(155deg, #0D1545 0%, #070F30 100%)",
        border: "1px solid rgba(99,102,241,0.18)",
        borderRadius: 14,
        padding: "13px 13px 11px",
        display: "flex", flexDirection: "column", gap: 9,
        position: "relative", overflow: "hidden",
        boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 10px 30px rgba(0,0,0,0.55)";
        el.style.borderColor = "rgba(99,102,241,0.4)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.45)";
        el.style.borderColor = "rgba(99,102,241,0.18)";
      }}
    >
      {/* shimmer top */}
      <div style={{
        position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
        background: "linear-gradient(90deg,transparent,rgba(255,215,0,0.2),transparent)",
        pointerEvents: "none",
      }} />

      {/* ── ROW 1: Avatar · Name · Status ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {/* avatar */}
        <div style={{
          flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
          border: `2px solid ${typeColor}55`, background: "#080F2E", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 12px ${typeColor}20`,
        }}>
          {data.profile_image
            ? <img src={data.profile_image} alt={data.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            : <span style={{ color: typeColor, fontWeight: 700, fontSize: 12.5, letterSpacing: 0.3 }}>
                {getInitials(data.name)}
              </span>
          }
        </div>

        {/* name + id */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            color: "#F0F4FF", fontWeight: 600, fontSize: 12.5, lineHeight: 1.25,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
          }}>{data.name}</p>
          <p style={{ margin: "2px 0 0", fontSize: 9, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 0.2 }}>
            <span style={{ color: typeColor }}>{data.emp_id}</span>
            <span style={{ color: "#8090C0" }}> · {data.department}</span>
          </p>
        </div>

        {/* status pill */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
          background: statusCfg.bg, border: `1px solid ${statusCfg.border}`,
          borderRadius: 20, padding: "3px 7px",
        }}>
          {statusCfg.dot && (
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: statusCfg.color, boxShadow: `0 0 5px ${statusCfg.color}` }} />
          )}
          <span style={{ color: statusCfg.color, fontSize: 9, fontWeight: 700, letterSpacing: 0.8 }}>
            {statusCfg.text}
          </span>
        </div>
      </div>

      {/* ── ROW 2: Bars ── */}
      {viewMode === "week" ? (
        /* WEEK — single row */
        <div style={{ display: "flex", gap: 2.5 }}>
          {data.weekDays.map((day) => (
            <div key={day.date} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              opacity: day.status === "future" ? 0.22 : 1,
            }}>
              <span style={{ color: "#7080B8", fontSize: 7, fontWeight: 600, lineHeight: 1, letterSpacing: 0.3 }}>
                {getDayLetter(day.date)}
              </span>
              <WeekBar day={day}
                isCheckedIn={
                  day.status === "present" &&
                  (day.totalHours ?? 0) === 0 &&
                  Array.isArray(day.sessions) &&
                  day.sessions.length > 0 &&
                  !day.sessions[day.sessions.length - 1]?.check_out
                }
              />
            </div>
          ))}
        </div>
      ) : (
        /* MONTH — stacked week rows */
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* header */}
          <div style={{ display: "flex", gap: 2.5 }}>
            {MON_LABELS.map(l => (
              <div key={l} style={{ flex: 1, textAlign: "center" }}>
                <span style={{ color: "#5060A0", fontSize: 6.5, fontWeight: 600 }}>{l}</span>
              </div>
            ))}
          </div>
          {/* week rows */}
          {weekRows!.map((row, wi) => (
            <div key={wi} style={{ display: "flex", gap: 2.5 }}>
              {row.map((day, di) => {
                if (!day) return (
                  <div key={`e-${wi}-${di}`} style={{ flex: 1, height: 22, borderRadius: 3, background: "rgba(15,20,60,0.15)" }} />
                );
                const isPresent = day.status === "present";
                const isAbsent  = day.status === "absent";
                const isHoliday = day.status === "holiday";
                const isFuture  = day.status === "future";
                const isToday   = day.date === today;
                const hrs       = day.totalHours ?? 0;
                const dayNum    = new Date(day.date).getDate();

                return (
                  <div key={day.date} style={{
                    flex: 1, height: 22, background: barBg(day), borderRadius: 3,
                    opacity: isFuture ? 0.2 : 1,
                    outline: isToday ? "1.5px solid #FFD700" : "none",
                    outlineOffset: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", gap: 0, position: "relative",
                  }}>
                    <span style={{
                      color: isPresent
                           ? (hrs < 6 ? "rgba(120,255,140,0.85)" : "rgba(0,40,10,0.9)")
                           : isAbsent  ? "rgba(255,100,100,0.75)"
                           : isHoliday ? "rgba(251,191,36,0.9)"
                           : "#4A5A9A",
                      fontSize: 6.5, fontWeight: 700, lineHeight: 1,
                    }}>
                      {dayNum}
                    </span>
                    {isPresent && hrs > 0 && (
                      <span style={{
                        color: hrs < 6 ? "rgba(150,255,160,0.9)" : "rgba(0,30,5,0.85)",
                        fontSize: 6.5, fontWeight: 900,
                        fontFamily: "'JetBrains Mono',monospace", lineHeight: 1, letterSpacing: -0.3,
                      }}>
                        {hrs}h
                      </span>
                    )}
                    {isHoliday && (
                      <span style={{ color: "rgba(251,191,36,0.6)", fontSize: 5.5, lineHeight: 1 }}>★</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── ROW 3: Stats ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        borderTop: "1px solid rgba(99,102,241,0.1)",
        paddingTop: 7, gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <span style={{ color: "#FFD700", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>{data.presentDays}</span>
          <span style={{ color: "#8090C0", fontSize: 9.5 }}>days present</span>
        </div>
        <div style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(99,102,241,0.4)" }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <span style={{ color: "#FFD700", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>{data.totalHours}</span>
          <span style={{ color: "#8090C0", fontSize: 9.5 }}>hrs</span>
          {data.overtimeHours > 0 && (
            <span style={{ fontSize: 8.5, color: "#93C5FD", fontWeight: 700, marginLeft: 2 }}>+{data.overtimeHours} OT</span>
          )}
        </div>
      </div>
    </div>
  );
}

export type { EmployeeCardData, DayStatus, Session };