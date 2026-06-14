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

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAndroid()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);

      // hide after 3 seconds
      setTimeout(() => setVisible(false), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

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
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxShadow: `0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px ${C.yellow}18`,
      animation: "toastIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
      maxWidth: "90vw",
      fontFamily: "'Sora',sans-serif",
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>
        Install this app for quick access
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
        }}
      >
        Install
      </button>
      <style>{`
        @keyframes toastIn{from{opacity:0;transform:translate(-50%, 12px)}to{opacity:1;transform:translate(-50%, 0)}}
      `}</style>
    </div>
  );
}