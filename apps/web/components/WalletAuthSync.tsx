"use client";

import { useCurrentAccount, useCurrentWallet } from "@mysten/dapp-kit";
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";

type SessionRes = {
  userId: string;
  role: string;
  token: string;
};

/**
 * When a wallet is connected, exchanges the Sui address for an API session.
 * Clears the session when the wallet disconnects.
 */
export function WalletAuthSync() {
  const wallet = useCurrentWallet();
  const account = useCurrentAccount();
  const setToken = useSessionStore((s) => s.setToken);
  const authedFor = useRef<string | null>(null);

  useEffect(() => {
    if (wallet.connectionStatus === "connecting") {
      return;
    }

    if (
      wallet.connectionStatus === "disconnected" ||
      !account?.address
    ) {
      authedFor.current = null;
      setToken(null);
      return;
    }

    const addr = account.address;
    if (authedFor.current === addr) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<SessionRes>("/auth/wallet/session", {
          method: "POST",
          body: JSON.stringify({ walletAddress: addr }),
        });
        if (cancelled) return;
        authedFor.current = addr;
        setToken(res.token);
      } catch {
        if (cancelled) return;
        authedFor.current = null;
        setToken(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account?.address, setToken, wallet.connectionStatus]);

  return null;
}
