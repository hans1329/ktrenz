import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * PWA service-worker update handler.
 *
 * Previously: when a new SW was detected we activated it after a 2s timer,
 * which fires `controllerchange` → `window.location.reload()` mid-session.
 * That caused users to lose in-progress state (a half-submitted battle pick,
 * an open modal) every time we shipped — and we ship a lot.
 *
 * Now: we still register the SW and pre-fetch the new assets, but the actual
 * activation (and the reload) is gated on a user click in the toast. The new
 * version applies on the user's next natural reload, or whenever they tap
 * "Refresh now" — never as a surprise.
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
    const { dismiss } = toast({
      title: "New version available",
      description: "Tap Refresh now to load the latest.",
      duration: Infinity,
      action: (
        <ToastAction
          altText="Refresh now"
          onClick={() => {
            // User opted in: register a one-shot reload on activation, then
            // tell the waiting SW to take control.
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
  }, [waitingWorker]);

  return null;
}
