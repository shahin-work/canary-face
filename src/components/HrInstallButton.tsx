import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// HR-specific PWA install. Installs a SEPARATE app ("CanaryFace HR") whose
// start_url is /hr, so launching it opens straight to the HR panel — independent
// of the main dashboard install.
//
// How it works: a PWA installs using whatever <link rel="manifest"> is active when
// the browser fires the install. On mount (HR page only) we point the manifest at
// /hr-manifest.webmanifest (start_url:/hr, name "CanaryFace HR"); on unmount we
// restore the original so the rest of the app still installs to the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

const BLUE   = "#60A5FA";

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;
}

export default function HrInstallButton() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const prevHref = useRef<string | null>(null);

  // Swap the active manifest to the HR one while this button is mounted.
  useEffect(() => {
    if (installed) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    prevHref.current = link.getAttribute("href");
    link.setAttribute("href", "/hr-manifest.webmanifest");

    return () => {
      // restore the original dashboard manifest
      const l = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (l && prevHref.current !== null) l.setAttribute("href", prevHref.current);
    };
  }, [installed]);

  // capture the install prompt (fired against the now-active HR manifest)
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
  };

  // Already installed/standalone, or the browser can't install (iOS Safari, desktop
  // without support) → show nothing.
  if (installed || !deferred) return null;

  return (
    <button onClick={install} title="Install the HR Panel as an app" style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "rgba(96,165,250,0.1)", border: `1px solid ${BLUE}55`,
      borderRadius: 9, color: BLUE, fontSize: 10.5, fontWeight: 700, padding: "8px 12px",
      cursor: "pointer", fontFamily: "'Sora',sans-serif", whiteSpace: "nowrap",
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Install HR Panel
    </button>
  );
}
