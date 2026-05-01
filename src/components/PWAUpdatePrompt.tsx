import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * PWA service-worker update handler.
 *
 * Originally: new SW activated automatically → mid-session reload → users
 * lost half-submitted battle picks every deploy. Bad for data yield.
 *
 * Current policy: never reload while the user is actively interacting.
 * Activation happens at one of two safe moments:
 *   1. User taps "Refresh now" in the toast (explicit opt-in).
 *   2. Tab transitions hidden → visible (user backgrounded the app and
 *      came back; nothing in-flight to disrupt).
 * Either way, fixes (incl. cache invalidations) propagate within hours
 * for mobile users without interrupting any active session.
 */
export function PWAUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const checkForUpdate = () => {
      navigator.serviceWorker?.getRegistration().then((reg) => {
        if (!reg) return;
        if (reg.waiting) setWaitingWorker(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
            }
          });
        });
      });
    };
    checkForUpdate();
  }, []);

  useEffect(() => {
    if (!waitingWorker) return;

    // Auto-activate when the tab transitions hidden → visible. This is a
    // natural, low-disruption moment (user just returned to the app), so we
    // can swap in the new SW + reload without interrupting an in-progress
    // session. Critical for delivering image/cache fixes to mobile users
    // who rarely hard-close tabs.
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const onControllerChange = () => {
        navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
        window.location.reload();
      };
      navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const { dismiss } = toast({
      title: "New version available",
      description: "Tap Refresh now to load the latest.",
      duration: Infinity,
      action: (
        <ToastAction
          altText="Refresh now"
          onClick={() => {
            const onControllerChange = () => {
              navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
              window.location.reload();
            };
            navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
            waitingWorker.postMessage({ type: "SKIP_WAITING" });
            dismiss();
          }}
        >
          Refresh now
        </ToastAction>
      ),
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [waitingWorker]);

  return null;
}
