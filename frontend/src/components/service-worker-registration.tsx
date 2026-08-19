"use client";

import { useEffect } from "react";
import { isTauriRuntime } from "@/lib/platform-fetch";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (isTauriRuntime()) return;

    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .then((registration) => registration.update())
          .catch((error) => {
            console.error("Service worker registration failed", error);
          });
      } else {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations
                .filter((registration) => registration.scope.startsWith(window.location.origin))
                .map((registration) => registration.unregister()),
            ),
          )
          .catch(() => undefined);

        if ("caches" in window) {
          caches
            .keys()
            .then((keys) =>
              Promise.all(
                keys
                  .filter((key) => key.startsWith("chatsaver-"))
                  .map((key) => caches.delete(key)),
              ),
            )
            .catch(() => undefined);
        }
      }
    }

    if ("storage" in navigator && "persist" in navigator.storage) {
      navigator.storage.persist().catch(() => undefined);
    }
  }, []);

  return null;
}
