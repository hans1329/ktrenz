import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Clean up legacy service workers from other domains (e.g. k-trendz.com)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => {
      // Keep only service workers from the current origin
      if (reg.scope && !reg.scope.startsWith(window.location.origin)) {
        reg.unregister();
      }
    });
  });
  // Purge any caches not belonging to our app
  if ("caches" in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        if (!name.startsWith("ktrenz-lovable-")) {
          caches.delete(name);
        }
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
