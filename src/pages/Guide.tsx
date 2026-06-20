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
            identifying you even from a partial glance. Each time you arrive or step out, your attendance is
            captured instantly and reflected in both Canary Face and Zoho.
          </p>
        </section>

        {/* Your Dashboard */}
        <section className="cf-section">
          <h2 className="cf-h2">Your Dashboard</h2>
          <p className="cf-p">
            Your personal dashboard gives you a clear, real-time view of your attendance at any time:
          </p>
          <ul className="cf-list">
            <li><span className="cf-strong">Current status</span> — Office In or Office Out</li>
            <li><span className="cf-strong">Today's timeline</span> — Exact check-in and check-out times</li>
            <li><span className="cf-strong">Metrics</span> — Total working hours and break time</li>
            <li><span className="cf-strong">History</span> — Full attendance calendar and monthly breakdown</li>
            <li><span className="cf-strong">Interactive Tools</span> — Quick-action buttons for regularization requests, logging meetings, and reporting issues</li>
          </ul>
          <p className="cf-p">Your dashboard status refreshes automatically after every face scan.</p>
        </section>

        {/* Your Working Day */}
        <section className="cf-section">
          <h2 className="cf-h2">Your Working Day</h2>
          <table className="cf-table">
            <tbody>
              <tr>
                <td>Office Hours</td>
                <td>9:00 AM – 6:00 PM</td>
              </tr>
              <tr>
                <td>Working Hours</td>
                <td>8 Hours</td>
              </tr>
              <tr>
                <td>Lunch Break</td>
                <td>1 Hour</td>
              </tr>
              <tr>
                <td>Overtime</td>
                <td>Automatically counted after 8 hours</td>
              </tr>
            </tbody>
          </table>
          <p className="cf-p">
            <span className="cf-strong">Non-working days:</span> Every Sunday, the 2nd and 4th Saturday of
            each month, and all official Canary Digital holidays.
          </p>
          <div className="cf-note">
            <p className="cf-p">
              <span className="cf-strong">Remote Work &amp; Client Visits:</span> For client visits, approved
              permissions, or remote workdays, HR will mark your status manually once your notification email
              is received. Please inform HR in advance to ensure the day is not recorded as an absence.
            </p>
          </div>
          <div className="cf-note">
            <p className="cf-p">
              <span className="cf-strong">Important Note on Working Hours:</span> The one-hour lunch break is
              currently included in your daily working-hours total. This is temporary and will be fixed in a
              few days.
            </p>
          </div>
        </section>

        {/* Short Breaks */}
        <section className="cf-section">
          <h2 className="cf-h2">Short Breaks</h2>
          <p className="cf-p">
            You have a small, dedicated allowance for quick step-outs that does not register as a check-out
            or deduct from your time: 5 minutes in the morning (9:00 AM – 1:00 PM) and 5 minutes in the
            afternoon (2:00 PM – 6:00 PM).
          </p>
          <ul className="cf-list">
            <li>
              <span className="cf-strong">Within Allowance:</span> Return within 5 minutes, and you remain
              marked present. No check-out log is created or sent to Zoho.
            </li>
            <li>
              <span className="cf-strong">Exceeding Allowance:</span> If you stay out longer than 5 minutes,
              it automatically converts into a standard check-out, timed from the moment the 5-minute window
              ended. Simply scan your face at the device when you return.
            </li>
          </ul>
        </section>

        {/* Meetings */}
        <section className="cf-section">
          <h2 className="cf-h2">Meetings</h2>
          <p className="cf-p">
            When you leave for a work-related meeting, log it using the Log Meeting tool on your dashboard.
            Your attendance will remain active for the meeting's duration, so you do not need to scan out
            when leaving the office.
          </p>
        </section>

        {/* Dashboard Tools & Requests */}
        <section className="cf-section">
          <h2 className="cf-h2">Dashboard Tools &amp; Requests</h2>
          <p className="cf-p">
            You can manage your attendance exceptions directly from the action bar on your web dashboard:
          </p>
          <ul className="cf-list">
            <li>
              <span className="cf-strong">Regularization:</span> If you miss a scan, work remotely, or
              notice a discrepancy in your log, click this button to submit a correction request to HR.
            </li>
            <li>
              <span className="cf-strong">Log Meeting:</span> Use this to register scheduled work meetings so
              your attendance stays active without tracking device scans.
            </li>
            <li>
              <span className="cf-strong">Report Issue:</span> If you encounter a hardware problem with the
              office face device, a bug on the web app, or a workplace facility issue, click here to route a
              ticket to administration.
            </li>
          </ul>
        </section>

        {/* Good to Know */}
        <section className="cf-section">
          <h2 className="cf-h2">Good to Know</h2>
          <ul className="cf-list">
            <li>
              <span className="cf-strong">Scan Cooldown:</span> A short pause between scans is intentional.
              The device waits roughly 20 seconds before reading the same face again to prevent duplicate
              logs. If your scan doesn't instantly appear, wait a brief moment and face the camera again.
            </li>
            <li>
              <span className="cf-strong">Accidental Scans:</span> The system is built to be highly reliable.
              If you accidentally face the camera twice in a row, the 20-second cooldown filters it out,
              keeping your timeline completely clean.
            </li>
            <li>
              <span className="cf-strong">Failed Scans:</span> If you ever fail to log a scan due to
              technical issues, use the Regularization feature on your dashboard right away to correct the
              entry.
            </li>
          </ul>
        </section>

        {/* Synchronisation with Zoho */}
        <section className="cf-section">
          <h2 className="cf-h2">Synchronisation with Zoho</h2>
          <p className="cf-flow">[Face Scan]&nbsp;&nbsp;──&gt;&nbsp;&nbsp;[Canary Face Dashboard]&nbsp;&nbsp;──&gt;&nbsp;&nbsp;[Zoho People]</p>
          <p className="cf-p">
            Every valid check-in and check-out maps to Zoho automatically in real time (excluding short
            breaks within the 5-minute allowance). Both systems remain completely in sync, with Canary Face
            serving as the definitive source of truth for your time tracking.
          </p>
        </section>

        {/* Need Help */}
        <section className="cf-section">
          <h2 className="cf-h2">Need Help?</h2>
          <p className="cf-p">
            For attendance edits, leave tracking, or sync corrections, contact HR — Vandana (
            <a className="cf-link cf-link-plain" href="mailto:vandana@canarydigital.ai">
              vandana@canarydigital.ai
            </a>
            ).
          </p>
          <p className="cf-p">
            For system access bugs, application downtime, or hardware device issues, use the Report Issue
            button on your dashboard or contact Shahin directly.
          </p>
        </section>

        {/* Footer */}
        <footer className="cf-footer">
          <p>Canary Face · Canary Digital — AI-powered attendance.</p>
          <p>Last updated: June 2026 · Version 1.1 · canaryface.vercel.app</p>
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