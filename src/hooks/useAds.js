import { useCallback, useEffect, useState } from "react";
import {
  interleaveAds,
  isAdsDisabled,
  readAdsDisabledLocal,
  writeAdsDisabledLocal,
} from "@/lib/ads";
import { useWallet } from "@/lib/useWallet";
import { getAdSenseSlot, isAdSenseEnabled } from "@/lib/adsense";

/** Google AdSense placement and Premium visibility state. */
export function useAds() {
  const { wallet, reload } = useWallet();
  const [localDisabled, setLocalDisabled] = useState(false);

  useEffect(() => {
    setLocalDisabled(readAdsDisabledLocal());
  }, []);

  const disabled = isAdsDisabled(wallet) || localDisabled;

  const mix = useCallback(
    (items, seed, slotName = "feed") => {
      const configured =
        isAdSenseEnabled() && Boolean(getAdSenseSlot(slotName));

      return interleaveAds(items, {
        seed: seed || "purre",
        enabled: !disabled && configured,
      });
    },
    [disabled]
  );

  const setAdsDisabled = useCallback((value) => {
    writeAdsDisabledLocal(value);
    setLocalDisabled(value);
  }, []);

  return {
    adsEnabled: !disabled,
    disabled,
    mix,
    setAdsDisabled,
    reloadWallet: reload,
  };
}
