import { useEffect, useRef } from "react";
import {
  getAdSenseClient,
  getAdSenseSlot,
  isAdSenseEnabled,
  loadAdSenseScript,
  pushAdSense,
} from "@/lib/adsense";
import { cn } from "@/lib/utils";
import { usePremium } from "@/components/ads/AdSlot";

/**
 * Google AdSense unit.
 * No partner fallback. Missing client or slot means no ad.
 */
export default function AdSenseUnit({
  slotName = "feed",
  format = "auto",
  className,
  fullWidth = true,
}) {
  const ref = useRef(null);
  const pushedSlot = useRef(null);
  const premium = usePremium();
  const client = getAdSenseClient();
  const slot = getAdSenseSlot(slotName);

  useEffect(() => {
    if (premium || !client || !slot || !isAdSenseEnabled()) {
      return undefined;
    }

    if (pushedSlot.current === slot) {
      return undefined;
    }

    let cancelled = false;

    loadAdSenseScript()
      .then((loaded) => {
        if (!loaded || cancelled) return;

        const element = ref.current;
        if (!element || !element.isConnected) return;

        // Prevent duplicate initialization of the same DOM unit.
        if (element.getAttribute("data-adsbygoogle-status")) {
          pushedSlot.current = slot;
          return;
        }

        if (pushAdSense()) {
          pushedSlot.current = slot;
        }
      })
      .catch(() => {
        // AdSense must never interrupt the main application.
      });

    return () => {
      cancelled = true;
    };
  }, [premium, client, slot]);

  if (premium || !client || !isAdSenseEnabled() || !slot) {
    return null;
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-2",
        className
      )}
      data-ad-placement={slotName}
    >
      <p className="mb-1 text-center text-[9px] uppercase tracking-[0.2em] text-white/40">
        Reklama
      </p>

      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: "block", minWidth: 0 }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidth ? "true" : "false"}
      />
    </div>
  );
}
