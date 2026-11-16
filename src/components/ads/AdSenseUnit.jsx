import { useEffect, useRef, useState } from "react";
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
  const [adState, setAdState] = useState("pending");
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
    let observer = null;
    let timeoutId = null;

    const element = ref.current;

    const observeStatus = () => {
      if (!element || !element.isConnected) return;

      observer = new MutationObserver(() => {
        const status = element.getAttribute("data-ad-status");

        if (status === "filled") setAdState("filled");
        if (status === "unfilled") setAdState("hidden");
      });

      observer.observe(element, {
        attributes: true,
        attributeFilter: ["data-ad-status"],
      });

      const currentStatus = element.getAttribute("data-ad-status");

      if (currentStatus === "filled") setAdState("filled");
      if (currentStatus === "unfilled") setAdState("hidden");

      // Nie zostawiamy pustego, ciemnego prostokąta,
      // gdy Google nie zwróci reklamy.
      timeoutId = window.setTimeout(() => {
        if (element.getAttribute("data-ad-status") !== "filled") {
          setAdState("hidden");
        }
      }, 15000);
    };

    loadAdSenseScript()
      .then((loaded) => {
        if (cancelled) return;

        if (!loaded) {
          setAdState("hidden");
          return;
        }

        if (!element || !element.isConnected) {
          setAdState("hidden");
          return;
        }

        observeStatus();

        // Nie inicjalizujemy ponownie już obsłużonego elementu.
        if (element.getAttribute("data-adsbygoogle-status")) {
          pushedSlot.current = slot;
          return;
        }

        if (pushAdSense()) {
          pushedSlot.current = slot;
        } else {
          setAdState("hidden");
        }
      })
      .catch(() => {
        if (!cancelled) setAdState("hidden");
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [premium, client, slot]);

  if (premium || !client || !isAdSenseEnabled() || !slot || adState === "hidden") {
    return null;
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-2",
        className
      )}
      data-ad-placement={slotName}
    >
      <p className="mb-1 text-center text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
        Reklama
      </p>

      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", minWidth: 0, minHeight: "90px", background: "transparent" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidth ? "true" : "false"}
      />
    </div>
  );
}
