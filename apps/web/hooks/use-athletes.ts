"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import {
  AthleteListItemSchema,
  AthleteStatsSchema,
} from "@sui-sports/shared";

type AthleteListArgs = {
  q?: string;
  verified?: boolean;
  sport?: string;
};

export function useAthletes({ q, verified, sport }: AthleteListArgs = {}) {
  return useQuery({
    queryKey: ["athletes", { q: q ?? "", verified: verified ?? null, sport: sport ?? "" }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (verified !== undefined) params.set("verified", String(verified));
      if (sport) params.set("sport", sport);
      const qs = params.toString();
      const path = qs ? `/athletes?${qs}` : `/athletes`;
      const raw = await apiFetch<unknown>(path, { method: "GET" });
      return AthleteListItemSchema.array().parse(raw);
    },
  });
}

export function useAthleteStats(athleteUserId: string | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["athlete-stats", athleteUserId, token],
    enabled: !!athleteUserId,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/athletes/${athleteUserId}/stats`,
        { method: "GET" },
        token,
      );
      return AthleteStatsSchema.parse(raw);
    },
  });
}

export function useMyFollows() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["follows-me", token],
    enabled: !!token,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(`/follows/me`, { method: "GET" }, token);
      return AthleteListItemSchema.array().parse(raw);
    },
  });
}
