/**
 * Lightweight client-side telemetry for Discover (h1).
 *
 * Wraps the ktrenz_h1_log_event RPC with:
 * - Anon-friendly session id (UUID generated on first call, persisted in
 *   localStorage so repeat anonymous visits stitch into one session)
 * - Fire-and-forget pattern (errors logged, never block UX)
 * - Module-level dedupe so the same event in the same render isn't logged
 *   twice (e.g. StrictMode double-mount in dev)
 */
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "ktrenz-h1-session";

function uuid(): string {
  // crypto.randomUUID is widely supported but guard for older browsers.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const cached = window.localStorage.getItem(SESSION_KEY);
    if (cached) return cached;
    const fresh = uuid();
    window.localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
}

const recentlyFired = new Set<string>();

export function trackH1Event(
  eventType: string,
  metadata: Record<string, unknown> = {},
): void {
  // Per-render dedupe key — only filters synchronous duplicates in the same
  // tick. Doesn't suppress legitimate repeat events across user interactions.
  const dedupeKey = `${eventType}:${JSON.stringify(metadata)}`;
  if (recentlyFired.has(dedupeKey)) return;
  recentlyFired.add(dedupeKey);
  setTimeout(() => recentlyFired.delete(dedupeKey), 250);

  void (supabase as any)
    .rpc("ktrenz_h1_log_event", {
      _event_type: eventType,
      _session_id: getOrCreateSessionId(),
      _metadata: metadata,
    })
    .then(({ error }: { error: unknown }) => {
      if (error) console.warn("[h1] telemetry failed:", eventType, error);
    });
}
