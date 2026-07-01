import type { TourSlide } from "../components/FeatureTour";

// ─────────────────────────────────────────────────────────────────────────────
// Tour slide data. Images live in src/assets/tour/{tools,hrside} and are loaded
// eagerly via Vite's import.meta.glob (so the bundler fingerprints them). We sort
// by the numeric index in the filename ("img (1).png", "img (2).png", …) so the
// order is deterministic regardless of how the glob returns them.
//
// To add/re-order slides: drop a numbered image into the folder and (optionally)
// add a caption below at the matching index. Captions are optional — a slide with
// no caption shows the image only.
// ─────────────────────────────────────────────────────────────────────────────

function numFromName(path: string): number {
  const m = path.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : 0;
}

function loadOrdered(glob: Record<string, string>): string[] {
  return Object.entries(glob)
    .sort((a, b) => numFromName(a[0]) - numFromName(b[0]))
    .map(([, url]) => url);
}

// eager glob → { path: url } (url is the built asset path)
const toolsImgs = loadOrdered(
  import.meta.glob("../assets/tour/tools/*.png", { eager: true, import: "default", query: "?url" }) as Record<string, string>
);
const hrImgs = loadOrdered(
  import.meta.glob("../assets/tour/hrside/*.png", { eager: true, import: "default", query: "?url" }) as Record<string, string>
);

// captions by slide index (kept alongside the images; extra images with no caption
// still show — the arrays just pair up positionally).
const TOOLS_CAPTIONS: { title: string; body?: string }[] = [
  { title: "Welcome to Canary Face", body: "Your AI-powered attendance dashboard — see who's in office, remote, or out, in real time." },
  { title: "Request Leave", body: "Apply for full, half or quarter-day leave and track its status — HR reviews it from their panel." },
  { title: "Regularize Attendance", body: "Missed a scan or worked remotely? Raise a regularization for HR to correct your record." },
  { title: "Log a Meeting", body: "Heading into a meeting? Log it so your attendance stays active without scanning." },
  { title: "Report an Issue", body: "Something wrong? Report it and it routes automatically to the right person — HR or tech." },
  { title: "Chat with HR", body: "Need help? Message HR directly from your dashboard — sign in and chat any time." },
  { title: "Sign in with Google", body: "Sign in once to unlock your tools and keep every action verified and tamper-proof." },
];

const HR_CAPTIONS: { title: string; body?: string }[] = [
  { title: "HR Dashboard", body: "Live view of attendance across the team — present, remote, absent, and forgot-to-check-out." },
  { title: "Requests & Approvals", body: "Review and approve leave and regularization requests, and reply to reported issues." },
  { title: "Manage Attendance", body: "Add leave, remote days or corrections, and export detailed Excel reports for any range." },
  { title: "Messages", body: "Chat with any employee directly, and jump to their thread from a specific request." },
];

export const TOOLS_TOUR_SLIDES: TourSlide[] = toolsImgs.map((image, idx) => ({
  image,
  title: TOOLS_CAPTIONS[idx]?.title,
  body: TOOLS_CAPTIONS[idx]?.body,
}));

export const HR_TOUR_SLIDES: TourSlide[] = hrImgs.map((image, idx) => ({
  image,
  title: HR_CAPTIONS[idx]?.title,
  body: HR_CAPTIONS[idx]?.body,
}));
