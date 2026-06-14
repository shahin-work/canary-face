// src/pages/Guide.tsx
// Canary Face — Employee Guide (static content page)

// ─── colours (matches Canary Face) ─────────────────────────────────────────────
const BG = "#060D2E";
const BORDER = "rgba(99,102,241,0.2)";
const TEXT = "#EEF0FF";
const SUB = "#8090C0";
const DIM = "#4A5A8A";
const CYAN = "#22D3EE";

export default function Guide() {
  return (
    <div className="cf-guide">
      <style>{css}</style>

      <main className="cf-wrap">
        {/* Back to dashboard */}
        <div className="cf-topbar">
          <a className="cf-back" href="/">
            ← Back to Dashboard
          </a>
        </div>

        {/* Header */}
        <header className="cf-header">
          <p className="cf-eyebrow">AI-powered facial-recognition attendance · Canary Digital</p>
          <h1 className="cf-title">Canary Face — Employee Guide</h1>
          <p className="cf-lede">
            Canary Face is an AI-powered attendance platform that records your presence through
            intelligent face recognition. A brief look at the device marks you in or out. This guide
            explains how the system works and how to read your dashboard.
          </p>
          <p className="cf-link-row">
            Dashboard:{" "}
            <a className="cf-link" href="https://canaryface.vercel.app" target="_blank" rel="noreferrer">
              canaryface.vercel.app
            </a>
          </p>
        </header>

        {/* Marking Attendance */}
        <section className="cf-section">
          <h2 className="cf-h2">Marking Attendance</h2>
          <p className="cf-p">
            Simply bring your face in front of the Canary Face device, and your attendance is recorded
            instantly.
          </p>
          <p className="cf-p">
            The device is powered by an intelligent recognition engine that is fast and highly accurate,
            identifying you even from a partial glance. Each time you arrive or step out, a brief look is
            enough — your attendance is captured instantly and reflected in both Canary Face and Zoho.
          </p>
        </section>

        {/* Your Dashboard */}
        <section className="cf-section">
          <h2 className="cf-h2">Your Dashboard</h2>
          <p className="cf-p">
            Your personal dashboard gives you a clear, real-time view of your attendance at any time:
          </p>
          <ul className="cf-list">
            <li>Current status — Office In or Office Out</li>
            <li>Today's check-in and check-out times</li>
            <li>Total working hours and break time</li>
            <li>Attendance calendar and full history</li>
            <li>Weekly and monthly summaries</li>
          </ul>
          <p className="cf-p">Your status refreshes automatically after every scan.</p>
        </section>

        {/* Your Working Day */}
        <section className="cf-section">
          <h2 className="cf-h2">Your Working Day</h2>
          <table className="cf-table">
            <tbody>
              <tr>
                <td>Office hours</td>
                <td>9:00 AM – 6:00 PM</td>
              </tr>
              <tr>
                <td>Working hours</td>
                <td>8 hours</td>
              </tr>
              <tr>
                <td>Lunch</td>
                <td>1 hour</td>
              </tr>
              <tr>
                <td>Overtime</td>
                <td>Counted after 8 hours</td>
              </tr>
            </tbody>
          </table>
          <p className="cf-p">
            <span className="cf-strong">Non-working days:</span> every Sunday, the 2nd and 4th Saturday of
            each month, and all Canary Digital holidays.
          </p>
          <div className="cf-note">
            <p className="cf-p">
              <span className="cf-strong">Please note:</span> For client visits, approved permissions, or
              remote workdays, HR will mark you as working remotely once your notification email is
              received. Without this, the day is recorded as absent, so please inform HR in advance. The
              one-hour lunch break is currently included within your daily working-hours total. This is
              temporary and may be adjusted in a future update.
            </p>
          </div>
        </section>

        {/* Short Breaks */}
        <section className="cf-section">
          <h2 className="cf-h2">Short Breaks</h2>
          <p className="cf-p">
            You have a small allowance for quick step-outs that does not count against you or register as a
            check-out: 5 minutes in the morning (9:00 AM – 1:00 PM) and 5 minutes in the afternoon
            (2:00 PM – 6:00 PM).
          </p>
          <ul className="cf-list">
            <li>Return within the allowance and you remain marked present; nothing additional is sent to Zoho.</li>
            <li>
              Stay out longer and it becomes a standard check-out, timed from the moment the allowance
              ended. Simply scan again when you return.
            </li>
          </ul>
        </section>

        {/* Meetings */}
        <section className="cf-section">
          <h2 className="cf-h2">Meetings</h2>
          <p className="cf-p">
            When you are added to a meeting in Canary Face, your attendance for the meeting's duration is
            recorded automatically. No separate scan is required.
          </p>
        </section>

        {/* Good to Know */}
        <section className="cf-section">
          <h2 className="cf-h2">Good to Know</h2>
          <ul className="cf-list">
            <li>
              A short pause between scans is intentional: the device waits about 20 seconds before reading
              again to prevent duplicate entries. If a scan does not register, wait a moment and face the
              device again.
            </li>
            <li>
              Every scan is reliable — each one records the correct event for the moment, and scanning again
              simply begins a fresh session.
            </li>
            <li>
              If you are unable to complete a face scan for any reason, please contact HR to have your
              attendance regularised for that day.
            </li>
          </ul>
        </section>

        {/* Synchronisation with Zoho */}
        <section className="cf-section">
          <h2 className="cf-h2">Synchronisation with Zoho</h2>
          <p className="cf-flow">Face scan&nbsp;&nbsp;→&nbsp;&nbsp;Canary Face&nbsp;&nbsp;→&nbsp;&nbsp;Zoho</p>
          <p className="cf-p">
            Every check-in and check-out is sent to Zoho automatically, while short breaks within your
            allowance are not. Both systems remain fully in sync, with Canary Face serving as the single
            source of truth.
          </p>
        </section>

        {/* Need Help */}
        <section className="cf-section">
          <h2 className="cf-h2">Need Help?</h2>
          <p className="cf-p">
            For attendance, leave, or record corrections, please contact HR — Vandana (
            <a className="cf-link cf-link-plain" href="mailto:vandana@canarydigital.ai">
              vandana@canarydigital.ai
            </a>
            ). For Canary Face platform, device, or access-related matters, please contact Admin. Any record can be
            reviewed and adjusted for you.
          </p>
        </section>

        {/* Footer */}
        <footer className="cf-footer">
          <p>Canary Face · Canary Digital — AI-powered attendance.</p>
          <p>Last updated: 12 June 2026 · Version 1.0</p>
          <p>
            <a className="cf-link" href="https://canaryface.vercel.app" target="_blank" rel="noreferrer">
              canaryface.vercel.app
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

const css = `
.cf-guide {
  background: ${BG};
  color: ${TEXT};
  min-height: 100vh;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.cf-wrap {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 56px clamp(20px, 5vw, 80px) 96px;
  box-sizing: border-box;
}
.cf-topbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 36px;
}
.cf-back {
  display: inline-block;
  padding: 8px 16px;
  border: 1px solid ${BORDER};
  border-radius: 6px;
  font-size: 14px;
  color: ${SUB};
  text-decoration: none;
  white-space: nowrap;
}
.cf-back:hover { color: ${TEXT}; border-color: ${SUB}; }
.cf-back:focus-visible { outline: 2px solid ${CYAN}; outline-offset: 3px; border-radius: 6px; }

.cf-header { margin-bottom: 56px; }
.cf-eyebrow {
  margin: 0 0 14px;
  color: ${SUB};
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.cf-title {
  margin: 0 0 20px;
  font-size: 32px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: ${TEXT};
}
.cf-lede {
  margin: 0 0 18px;
  font-size: 16px;
  line-height: 1.7;
  color: ${SUB};
}
.cf-link-row {
  margin: 0;
  font-size: 15px;
  color: ${SUB};
}
.cf-link {
  color: ${CYAN};
  text-decoration: none;
  border-bottom: 1px solid rgba(34,211,238,0.35);
}
.cf-link:hover { border-bottom-color: ${CYAN}; }
.cf-link:focus-visible { outline: 2px solid ${CYAN}; outline-offset: 3px; border-radius: 2px; }
.cf-link-plain {
  color: inherit;
  border-bottom-color: ${BORDER};
}
.cf-link-plain:hover { border-bottom-color: ${SUB}; }

.cf-section { margin-bottom: 48px; }
.cf-h2 {
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${BORDER};
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.005em;
  color: ${TEXT};
}
.cf-p {
  margin: 0 0 14px;
  font-size: 15.5px;
  line-height: 1.75;
  color: ${SUB};
}
.cf-p:last-child { margin-bottom: 0; }
.cf-strong { color: ${TEXT}; font-weight: 600; }

.cf-list {
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
}
.cf-list li {
  position: relative;
  margin: 0 0 10px;
  padding-left: 20px;
  font-size: 15.5px;
  line-height: 1.7;
  color: ${SUB};
}
.cf-list li:last-child { margin-bottom: 0; }
.cf-list li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 11px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${DIM};
}

.cf-table {
  width: 100%;
  max-width: 460px;
  border-collapse: collapse;
  margin: 0 0 18px;
  background: transparent;
  border: 1px solid ${BORDER};
  border-radius: 8px;
  overflow: hidden;
}
.cf-table td {
  padding: 13px 18px;
  font-size: 15px;
  line-height: 1.5;
  border-bottom: 1px solid ${BORDER};
}
.cf-table tr:last-child td { border-bottom: none; }
.cf-table td:first-child { color: ${SUB}; width: 45%; }
.cf-table td:last-child { color: ${TEXT}; font-weight: 500; }

.cf-note {
  margin-top: 18px;
  padding: 16px 18px;
  background: transparent;
  border: 1px solid ${BORDER};
  border-left: 2px solid ${DIM};
  border-radius: 6px;
}
.cf-note .cf-p { margin: 0; }

.cf-flow {
  margin: 0 0 16px;
  padding: 14px 18px;
  background: transparent;
  border: 1px solid ${BORDER};
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14.5px;
  color: ${TEXT};
  letter-spacing: 0.01em;
}

.cf-footer {
  margin-top: 24px;
  padding-top: 28px;
  border-top: 1px solid ${BORDER};
}
.cf-footer p {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.6;
  color: ${DIM};
}
.cf-footer p:last-child { margin-bottom: 0; }

@media (max-width: 600px) {
  .cf-wrap { padding: 40px 20px 64px; }
  .cf-topbar { margin-bottom: 28px; }
  .cf-header { margin-bottom: 40px; }
  .cf-title { font-size: 26px; }
  .cf-lede { font-size: 15px; }
  .cf-section { margin-bottom: 38px; }
  .cf-h2 { font-size: 17px; }
  .cf-p, .cf-list li { font-size: 15px; }
  .cf-table { max-width: 100%; }
  .cf-flow { font-size: 13px; overflow-x: auto; white-space: nowrap; }
}
`;