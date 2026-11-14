// Keep in sync with package.json on each release.
export const VERSION = "0.21.1";

// GitHub API returns fresh content immediately; raw.githubusercontent.com
// is CDN-cached for up to 5 minutes which delays update detection.
const LATEST_VERSION_URL = "https://api.github.com/repos/rohit-pathak/vimcode/contents/package.json?ref=main";

type Toast = (opts: { message: string; variant: "info" | "success" | "warning" | "error"; duration: number }) => void;
// The v1 TuiKV is synchronous; the v2 facade (src/v2.ts) is async. Accept both:
// results go through Promise.resolve, which passes plain values and promises alike.
type KV = { get(key: string): unknown; set(key: string, value: string): unknown };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function checkForUpdate(toast: Toast, kv?: KV) {
  let last: unknown;
  try {
    last = kv?.get("lastUpdateCheck");
  } catch {
    fetchLatest(toast);
    return;
  }
  Promise.resolve(last)
    .then((ts) => {
      if (ts && Date.now() - Number(ts) < ONE_DAY_MS) return;
      fetchLatest(toast, kv);
    })
    .catch(() => {});
}

function fetchLatest(toast: Toast, kv?: KV) {
  fetch(LATEST_VERSION_URL, {
    headers: { Accept: "application/vnd.github.v3.raw" },
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => r.json())
    // biome-ignore lint/suspicious/noExplicitAny: untyped JSON response
    .then((pkg: any) => {
      Promise.resolve(kv?.set("lastUpdateCheck", Date.now().toString())).catch(() => {});
      const latest = pkg?.version;
      if (latest && latest !== VERSION) {
        toast({ message: `vimcode update available: v${VERSION} → v${latest}`, variant: "info", duration: 5000 });
      }
    })
    .catch(() => {});
}
