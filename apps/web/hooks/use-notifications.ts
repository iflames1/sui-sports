"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { NotificationSchema } from "@sui-sports/shared";

export function useNotifications() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["notifications", token],
    enabled: !!token,
    refetchInterval: 30_000,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(`/notifications`, { method: "GET" }, token);
      return NotificationSchema.array().parse(raw);
    },
  });
}

export function useUnreadCount() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["notifications-unread", token],
    enabled: !!token,
    refetchInterval: 20_000,
    queryFn: async () => {
      const raw = await apiFetch<{ count: number }>(
        `/notifications/unread-count`,
        { method: "GET" },
        token,
      );
      return raw.count ?? 0;
    },
  });
}
