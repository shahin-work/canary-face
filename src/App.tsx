import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Attendance from "./pages/Attendance";
import EmployeeDetails from "./pages/EmployeeDetails";
import AddProfile from "./components/AddProfile";
import AdminPanel from "./components/AdminPanel";
import HrPanel from "./components/HrPanel";
import Guide from "./pages/Guide";
import MyAttendance from "./components/MyAttendance";
import FeatureTour from "./components/FeatureTour";
import { TOOLS_TOUR_SLIDES, HR_TOUR_SLIDES } from "./data/tourSlides";
import InstallPrompt from './InstallPrompt'

const MOBILE_BLOCK_ENABLED = false; // toggle: set false to allow mobile

// Feature tours: each opens EVERY time its page loads/refreshes while its flag is
// true (no "don't show again" memory — Skip/Finish closes it for the session).
//   • SHOW_TOOLS_TOUR → employee "tools" walkthrough on the dashboard (/, /phone)
//   • SHOW_HR_TOUR    → HR-panel walkthrough inside /hr
// Flip either to false to hide that tour.
export const SHOW_TOOLS_TOUR = true;
export const SHOW_HR_TOUR = true;

// kept for backwards-compat with any existing import of SHOW_TOURS
export const SHOW_TOURS = SHOW_TOOLS_TOUR;

export const DATA_START = "2026-06-01";

export const HIDDEN_DATES = new Set([""]);

export function isHiddenDate(date: string): boolean {
  return HIDDEN_DATES.has(date);
}

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

  // Dashboard route = "/" or "/phone" (the main attendance page) → employee tools tour.
  // HR route = "/hr" or "/phone/hr" → HR-panel tour. Each re-opens on every load.
  const isDashboardRoute = location.pathname === "/" || location.pathname === "/phone";
  const isHrRoute = location.pathname === "/hr" || location.pathname === "/phone/hr";
  const [toolsTourOpen, setToolsTourOpen] = useState(SHOW_TOOLS_TOUR);
  const [hrTourOpen, setHrTourOpen] = useState(SHOW_HR_TOUR);

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

      {/* Employee tools tour — dashboard only, opens each load when SHOW_TOOLS_TOUR is true */}
      {SHOW_TOOLS_TOUR && isDashboardRoute && TOOLS_TOUR_SLIDES.length > 0 && (
        <FeatureTour open={toolsTourOpen} onClose={() => setToolsTourOpen(false)} slides={TOOLS_TOUR_SLIDES} accent="#FFD700" />
      )}

      {/* HR-panel tour — /hr only, opens each load when SHOW_HR_TOUR is true */}
      {SHOW_HR_TOUR && isHrRoute && HR_TOUR_SLIDES.length > 0 && (
        <FeatureTour open={hrTourOpen} onClose={() => setHrTourOpen(false)} slides={HR_TOUR_SLIDES} accent="#60A5FA" />
      )}
 
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
