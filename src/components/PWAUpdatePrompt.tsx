import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PWAUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const handleControllerChange = () => {
      window.location.reload();
    };

    const checkForUpdate = () => {
      navigator.serviceWorker?.getRegistration().then((reg) => {
        if (!reg) return;

        // New SW waiting
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }

        // Listen for new SW installing
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

      navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);
    };

    checkForUpdate();

    return () => {
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  useEffect(() => {
    if (!waitingWorker) return;

    toast("New version available", {
      description: "Refresh to apply the latest update.",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => {
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
        },
      },
    });
  }, [waitingWorker]);

  return null;
}
