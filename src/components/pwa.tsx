"use client";
import { useEffect } from "react";

/** Registers the service worker in production builds (installable app + offline page). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => { void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined); };
    if (document.readyState === "complete") register();
    else { window.addEventListener("load", register, { once: true }); return () => window.removeEventListener("load", register); }
  }, []);
  return null;
}
