import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Attendance from "./pages/Attendance";
import EmployeeDetails from "./pages/EmployeeDetails";
import AddProfile from "./components/AddProfile";
import AdminPanel from "./components/AdminPanel";
import HrPanel from "./components/HrPanel";
import Guide from "./pages/Guide";
import MyAttendance from "./components/MyAttendance";
import InstallPrompt from './InstallPrompt'


const MOBILE_BLOCK_ENABLED = false; // toggle: set false to allow mobile
export const DATA_START = "2026-06-01";

// Dates whose attendance data must be HIDDEN everywhere in the app. The app loads
// normally on every day; these specific days simply render as blank (no data) —
// not present, not leave, not counted — like a non-working day. All OTHER dates
// show their real data untouched. Dates are in the app's YYYY-MM-DD format.
// TO REMOVE LATER: empty this array (and the isHiddenDate() use in Attendance.tsx).
export const HIDDEN_DATES = new Set(["2026-06-23", "2026-06-24"]);

export function isHiddenDate(date: string): boolean {
  return HIDDEN_DATES.has(date);
}

// ###########################################################################
// ###  HARDCODED ATTENDANCE OVERRIDES  (temporary)                        ###
// ###########################################################################
// Some employees have wrong / missing attendance in the DB for a few specific
// dates. Rather than touch Firestore, we patch those exact (date, emp_id) cells
// here from a JSON file. Behaviour:
//   • If the JSON has an entry for that emp_id ON that date  → show it as PRESENT.
//   • If it does NOT (emp_id missing, or date missing)       → fall through to the
//                                                              real DB data, untouched.
// The JSON is keyed by date in the app's own format (YYYY-MM-DD), then by emp_id:
//   { "2026-06-23": { "cdai008": { "check_in": "09:00:15", "check_out": "18:05:22" } } }
//
// TO REMOVE LATER: delete this block + the JSON import below, and remove the
// getAttendanceOverride() call inside Attendance.tsx (also fenced with ###).
import attendanceOverrides from "./data/attendanceOverrides.json";

type OverrideEntry = { check_in: string; check_out?: string };
type OverrideMap = Record<string, Record<string, OverrideEntry>>;

/**
 * Returns a `sessions`-shaped present-day record for (emp_id, date) IF a hardcoded
 * override exists, otherwise null (caller then uses the DB data as-is).
 * The returned shape matches exactly what Attendance.tsx expects from Firestore:
 *   { sessions: [{ session, check_in, check_out }] }
 */
export function getAttendanceOverride(empId: string, date: string):
  | { sessions: { session: number; check_in: string; check_out?: string }[] }
  | null {
  const day = (attendanceOverrides as OverrideMap)[date];
  if (!day) return null;                       // no overrides for this date → use DB
  const rec = day[empId];
  if (!rec || !rec.check_in) return null;      // this employee not overridden → use DB
  return {
    sessions: [
      { session: 1, check_in: rec.check_in, check_out: rec.check_out },
    ],
  };
}
// ###########################################################################
// ###  END HARDCODED ATTENDANCE OVERRIDES                                 ###
// ###########################################################################

// ── screen width hook ─────────────────────────────────────────────────────────
function useIsMobileDevice() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor;

    const mobile =
      /android|iphone|ipad|ipod|opera mini|iemobile|mobile/i.test(ua) ||
      (navigator.maxTouchPoints > 2);

    setIsMobile(mobile);
  }, []);

  return isMobile;
}

// ── online hook ───────────────────────────────────────────────────────────────
function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

// ── mobile block screen ───────────────────────────────────────────────────────
function MobileBlock() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#060D2E",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
      fontFamily: "'Sora', sans-serif",
      textAlign: "center",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        width: 72, height: 72, borderRadius: 20, marginBottom: 28,
        background: "linear-gradient(145deg,#111C4A,#080F35)",
        border: "1px solid rgba(99,102,241,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 40px rgba(99,102,241,0.15)",
      }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="3" width="20" height="14" rx="2" stroke="#6366F1" strokeWidth="1.8"/>
          <path d="M8 21h8M12 17v4" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M9 7l6 6M15 7l-6 6" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      <h1 style={{ color: "#EEF0FF", fontWeight: 800, fontSize: 22, margin: "0 0 12px", lineHeight: 1.3 }}>
        Desktop Only
      </h1>

      <p style={{ color: "#8090C0", fontSize: 14, lineHeight: 1.7, maxWidth: 300, margin: "0 0 28px" }}>
        Canary Face attendance dashboard is designed for desktop and laptop screens.
      </p>

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.25)",
        borderRadius: 20, padding: "8px 18px",
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#6366F1" strokeWidth="2"/>
          <path d="M12 8v4l3 3" stroke="#6366F1" strokeWidth="2" strokeLinecap="round"/>
        </svg> 
      </div>
    </div>
  );
}

// ── inner app — has access to useLocation ─────────────────────────────────────
function AppInner() {
  const isMobile = useIsMobileDevice();
  const isTouch  = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const online   = useOnline();
  const location = useLocation();

  const isPhoneRoute =
    location.pathname === "/phone" ||
    location.pathname.startsWith("/phone/");

  const isAdminRoute =
    /^\/(phone\/)?(console|hr)$/.test(location.pathname);

  if (
    MOBILE_BLOCK_ENABLED &&
    (isMobile || isTouch) &&
    !isPhoneRoute
  ) {
    return <MobileBlock />;
  }
 
  return (
    <>
      <Routes>
        <Route path="/" element={<Attendance />} />
        <Route path="/:empSlug" element={<EmployeeDetails />} />
        <Route path="/profile" element={<AddProfile />} />
        <Route path="/console" element={<AdminPanel />} />
        <Route path="/hr" element={<HrPanel />} />
        <Route path="/guide" element={<Guide />} />  

        {/* mobile routes */}
        <Route path="/phone" element={<Attendance />} />
        <Route path="/phone/:empSlug" element={<EmployeeDetails />} />
        <Route path="/phone/profile" element={<AddProfile />} />
        <Route path="/phone/console" element={<AdminPanel />} />
        <Route path="/phone/hr" element={<HrPanel />} />
        <Route path="/phone/guide" element={<Guide />} />   
      </Routes>

    {!isAdminRoute && <MyAttendance />}
 
      {!online && (
        <div style={{
          position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 99999, background: "#1a0a0a", border: "1px solid rgba(248,113,113,0.4)",
          borderRadius: 12, padding: "10px 18px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          fontFamily: "'Sora', sans-serif",
          whiteSpace: "nowrap",
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#F87171", boxShadow: "0 0 8px #F87171", flexShrink: 0 }}/>
          <span style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 600 }}>No internet connection</span>
        </div>
      )}
            <InstallPrompt />
    </>
  );
}

// ── app ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}


















// import React, { useState } from "react";
// import emailjs from "@emailjs/browser";

// export default function App() {
//   const [sending, setSending] = useState(false);

//   const sendEmail = async () => {
//     try {
//       setSending(true);

//       const result = await emailjs.send(
//         "service_skoy7lm",
//         "template_lhb9bjw",
//         {
//           name: "Shahin",
//           email: "shahincanary@gmail.com",
//           subject: "React EmailJS Test",
//           message: "Hello from React + EmailJS",
//         },
//         "yRqB12zhJfiYANARr"
//       );

//       console.log("SUCCESS:", result);
//       alert("Email sent successfully!");
//     } catch (error) {
//       console.error("EMAIL ERROR:", error);
//       alert("Failed to send email. Check console.");
//     } finally {
//       setSending(false);
//     }
//   };

//   return (
//     <div
//       style={{
//         height: "100vh",
//         display: "flex",
//         justifyContent: "center",
//         alignItems: "center",
//       }}
//     >
//       <button
//         onClick={sendEmail}
//         disabled={sending}
//         style={{
//           padding: "16px 24px",
//           fontSize: "16px",
//           cursor: "pointer",
//         }}
//       >
//         {sending ? "Sending..." : "Send Email"}
//       </button>
//     </div>
//   );
// }