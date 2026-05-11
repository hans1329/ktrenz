import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * PWA service-worker update handler.
 *
 * Uses the official vite-plugin-pwa helper `useRegisterSW` so the SKIP_WAITING
 * message + reload happens via the plugin's own glue code (matched to the
 * generated SW). Earlier custom postMessage flow silently failed because the
 * generated SW didn't expose a 'message' listener for SKIP_WAITING.
 *
 * Policy: never reload while user is actively interacting unless they tap
 * "Refresh now". Hidden→visible transitions also auto-update so cache fixes
 * propagate to mobile users without forcing them to dig through menus.
 */
export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn("[pwa] SW register error:", error);
    },
  });

  // Helper: drive SW update AND force a page reload. We can't rely on
  // updateServiceWorker(true) to reload on its own — vite-plugin-pwa only
  // triggers a reload when `controllerchange` fires, and with `autoUpdate`
  // mode + clientsClaim the new SW often takes control silently without a
  // controllerchange event (it's already controlling by the time we get
  // here), so the implicit reload never happens. Explicit reload is the
  // only reliable path.
  const applyUpdate = async () => {
    try { await updateServiceWorker(true); } catch { /* ignore */ }
    // Also clear sessionStorage flags that might cause loops, then hard reload.
    window.location.reload();
  };

  // Auto-update when tab returns to foreground from background. Low-disruption
  // moment to swap in the new SW + reload.
  useEffect(() => {
    if (!needRefresh) return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void applyUpdate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh]);

  // Show toast for explicit user-driven refresh.
  useEffect(() => {
    if (!needRefresh) return;
    const { dismiss } = toast({
      title: "New version available",
      description: "Tap Refresh now to load the latest.",
      duration: Infinity,
      action: (
        <ToastAction
          altText="Refresh now"
          onClick={() => {
            setNeedRefresh(false);
            dismiss();
            void applyUpdate();
          }}
        >
          Refresh now
        </ToastAction>
      ),
    });
    return () => { dismiss(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh, setNeedRefresh]);

  return null;
}
