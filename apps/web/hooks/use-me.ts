"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { UserMeSchema } from "@sui-sports/shared";

export function useMe() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["me", token],
    enabled: !!token,
    queryFn: async () => {
      const raw = await apiFetch<unknown>("/me", { method: "GET" }, token);
      return UserMeSchema.parse(raw);
    },
  });
}
