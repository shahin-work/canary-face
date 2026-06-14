import { useState, useEffect } from 'react'

const C = {
  surf2: "#0E1228",
  border: "rgba(99,102,241,0.15)",
  yellow: "#FFD700",
  text: "#DDE3FF",
  sub: "#68789A",
  bg: "#06080F",
};

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isChrome() {
  // Chrome on Android — exclude other Chromium-based browsers if needed
  return /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|SamsungBrowser/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isAndroid() || !isChrome()) return;
    if (isStandalone()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 20,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9999,
      background: C.surf2,
      border: `1px solid ${C.yellow}33`,
      borderRadius: 12,
      padding: "10px 12px 10px 14px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      boxShadow: `0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px ${C.yellow}18`,
      animation: "toastIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
      maxWidth: "92vw",
      fontFamily: "'Sora',sans-serif",
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>
        Install CanaryFace
      </span>
      <button
        onClick={handleInstall}
        style={{
          background: C.yellow,
          color: C.bg,
          border: "none",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
          fontFamily: "'Sora',sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: C.sub,
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginLeft: 2,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <style>{`
        @keyframes toastIn{from{opacity:0;transform:translate(-50%, 12px)}to{opacity:1;transform:translate(-50%, 0)}}
      `}</style>
    </div>
  );
}