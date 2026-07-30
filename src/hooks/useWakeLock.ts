import { useEffect, useRef } from "react";

/*
  Acquires a Screen Wake Lock while `active` is true, preventing the
  device from sleeping.  Falls back silently if the API is unsupported
  (iOS Safari, older browsers, or denied permission).
*/
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release();
          return;
        }
        lockRef.current = lock;
        lock.addEventListener("release", () => {
          lockRef.current = null;
        });
      } catch {
        /* API present but permission denied or unsupported */
      }
    })();

    return () => {
      cancelled = true;
      if (lockRef.current) {
        lockRef.current.release();
        lockRef.current = null;
      }
    };
  }, [active]);
}
