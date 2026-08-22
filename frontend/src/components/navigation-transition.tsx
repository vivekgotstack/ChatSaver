"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

let fallbackTimer: number | undefined;

export function beginRouteTransition() {
  if (typeof document === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.clearTimeout(fallbackTimer);
  document.documentElement.dataset.navigationState = "leaving";
  fallbackTimer = window.setTimeout(() => {
    delete document.documentElement.dataset.navigationState;
  }, 1_200);
}

export function NavigationTransition() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/history");
    router.prefetch("/integrations");
    router.prefetch("/private-vault");
  }, [router]);

  useEffect(() => {
    window.clearTimeout(fallbackTimer);
    document.documentElement.dataset.navigationState = "entering";
    const frame = window.requestAnimationFrame(() => {
      const settle = window.setTimeout(() => {
        delete document.documentElement.dataset.navigationState;
      }, 320);
      fallbackTimer = settle;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [routeKey]);

  useEffect(() => {
    function prepareNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      beginRouteTransition();
    }

    window.addEventListener("click", prepareNavigation, true);
    window.addEventListener("popstate", beginRouteTransition);
    return () => {
      window.removeEventListener("click", prepareNavigation, true);
      window.removeEventListener("popstate", beginRouteTransition);
    };
  }, []);

  return <div className="route-transition-curtain" aria-hidden="true" />;
}
