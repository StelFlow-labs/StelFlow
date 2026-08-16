"use client";

import { useEffect, useState } from "react";

import { assetInfo, type AssetInfo } from "@/lib/asset";
import { Alert } from "./ui";

/**
 * Discloses issuer clawback before a deposit is escrowed.
 *
 * Escrow is the irreversible step, so this belongs above the button rather than
 * on the stream afterwards.
 */
export function AssetNotice({ tokenId }: { tokenId: string }) {
  const [info, setInfo] = useState<AssetInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void assetInfo(tokenId).then((result) => {
      if (!cancelled) setInfo(result);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  if (!info || info.clawback === "none") return null;

  if (info.clawback === "unknown") {
    return (
      <Alert tone="warn">
        We could not check whether the issuer of{" "}
        <span className="font-medium">{info.code}</span> can reclaim this asset.
        Please check it yourself before streaming anything you care about.
      </Alert>
    );
  }

  return (
    <Alert tone="bad">
      The issuer of <span className="font-medium">{info.code}</span> can take this
      asset back from anyone holding it — including from a stream that is already
      running. StelFlow cannot prevent that, and neither can you once the stream
      exists. Consider a different asset if that matters to you.
    </Alert>
  );
}
