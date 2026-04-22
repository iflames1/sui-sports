"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  CheckCheck,
  Radio,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { subscribeToPush } from "@/lib/push";
import { useSessionStore } from "@/lib/store";
import { useNotifications } from "@/hooks/use-notifications";

function iconFor(type: string) {
  switch (type) {
    case "new_follower":
      return UserPlus;
    case "new_content":
      return Sparkles;
    case "live_scheduled":
      return Radio;
    case "verified":
      return BadgeCheck;
    default:
      return Bell;
  }
}

function labelFor(type: string, payload: unknown) {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "new_follower":
      return { title: "New follower", body: "Someone just followed you." };
    case "new_subscriber":
      return {
        title: "New subscriber",
        body: `A fan subscribed to ${(p.tierName as string) || "your tier"}.`,
      };
    case "new_content":
      return {
        title: "New post",
        body: (p.title as string) || "A creator you follow published something.",
      };
    case "live_scheduled":
      return {
        title: "Live scheduled",
        body: (p.title as string) || "A creator scheduled a live session.",
      };
    case "verified":
      return {
        title: "You’re verified",
        body: "Your athlete profile was approved by an admin.",
      };
    default:
      return { title: type.replace(/_/g, " "), body: JSON.stringify(payload) };
  }
}

function linkFor(type: string, payload: unknown): string | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "new_content":
      return typeof p.athleteUserId === "string" ? `/athletes/${p.athleteUserId}` : "/feed";
    case "live_scheduled":
      return typeof p.sessionId === "string" ? `/live/${p.sessionId}` : "/live";
    case "new_follower":
    case "new_subscriber":
      return typeof p.fanUserId === "string" ? null : null;
    case "verified":
      return "/athlete";
    default:
      return null;
  }
}

export default function NotificationsPage() {
  const token = useSessionStore((s) => s.token);
  const qc = useQueryClient();
  const notifs = useNotifications();
  const [pushMsg, setPushMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/notifications/${id}/read`, { method: "POST", body: "{}" }, token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      await qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });
  const markAll = useMutation({
    mutationFn: () =>
      apiFetch(`/notifications/read-all`, { method: "POST", body: "{}" }, token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      await qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });
  const enablePush = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Connect your wallet first.");
      await subscribeToPush(token);
    },
    onSuccess: () =>
      setPushMsg({ type: "ok", text: "Push notifications enabled on this device." }),
    onError: (e: Error) => setPushMsg({ type: "error", text: e.message }),
  });

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Wallet required</AlertTitle>
          <AlertDescription className="mt-2">
            Connect a wallet in the header. Notifications are delivered per account.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const rows = notifs.data ?? [];
  const unreadCount = rows.filter((r) => !r.readAt).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Bell className="size-3.5" />
            Inbox
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm">
            Follows, new content, live sessions, and verification — all here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={enablePush.isPending}
            onClick={() => enablePush.mutate()}
          >
            {enablePush.isPending ? "Enabling…" : "Enable push"}
          </Button>
        </div>
      </div>

      {pushMsg ? (
        <Alert
          className="mt-4"
          variant={pushMsg.type === "error" ? "destructive" : "default"}
        >
          <AlertDescription>{pushMsg.text}</AlertDescription>
        </Alert>
      ) : null}

      {notifs.isLoading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">No notifications yet</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Follow creators and subscribe to tiers. You’ll see live announcements,
            new content, and more here.
          </CardContent>
        </Card>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((n) => {
            const Icon = iconFor(n.type);
            const { title, body } = labelFor(n.type, n.payloadJson);
            const href = linkFor(n.type, n.payloadJson);
            const when = (() => {
              try {
                return new Date(String(n.createdAt)).toLocaleString();
              } catch {
                return "";
              }
            })();
            const content = (
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                    n.readAt ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{title}</span>
                    <span className="text-muted-foreground text-xs">{when}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                    {body}
                  </p>
                </div>
                {!n.readAt ? (
                  <span className="bg-primary mt-2 size-2 shrink-0 rounded-full" />
                ) : null}
              </div>
            );
            return (
              <li
                key={n.id}
                className="bg-card ring-1 ring-foreground/10 rounded-xl p-3 text-sm"
                onMouseEnter={() => {
                  if (!n.readAt) markRead.mutate(n.id);
                }}
              >
                {href ? (
                  <Link href={href} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
