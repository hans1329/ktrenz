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

    toast("새로운 버전이 있습니다", {
      description: "최신 업데이트를 적용하려면 새로고침하세요.",
      duration: Infinity,
      action: {
        label: "새로고침",
        onClick: () => {
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
        },
      },
    });
  }, [waitingWorker]);

  return null;
}
