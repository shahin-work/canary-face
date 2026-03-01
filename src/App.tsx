import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Attendance from "./pages/Attendance";
import EmployeeDetails from "./pages/EmployeeDetails";
import AddProfile from "./components/AddProfile";

// ── screen width hook ─────────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
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
        Please open it on a larger device.
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
        <span style={{ color: "#6366F1", fontSize: 12, fontWeight: 600 }}>
          Recommended: 1024px or wider
        </span>
      </div>
    </div>
  );
}

// ── inner app — has access to useLocation ─────────────────────────────────────
function AppInner() {
  const width    = useWindowWidth();
  const location = useLocation();

  // /phone and /phone/anything always bypass the mobile block
  const isPhoneRoute = location.pathname === "/phone" ||
                       location.pathname.startsWith("/phone/");

  if (width < 640 && !isPhoneRoute) return <MobileBlock />;

  return (
    <Routes>
      <Route path="/"               element={<Attendance />} />
      <Route path="/:empSlug"       element={<EmployeeDetails />} />
      <Route path="/phone"          element={<Attendance />} />
      <Route path="/phone/:empSlug" element={<EmployeeDetails />} />
      <Route path="/profile"    element={<AddProfile />} />
    </Routes>
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