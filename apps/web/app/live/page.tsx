"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Radio } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { LiveSessionSchema } from "@sui-sports/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function toDateLabel(input: unknown) {
  if (typeof input !== "string") return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function LiveListPage() {
  const token = useSessionStore((s) => s.token);

  const sessions = useQuery({
    queryKey: ["live-sessions"],
    queryFn: async () => {
      const raw = await apiFetch<unknown>(`/live-sessions`, { method: "GET" });
      return LiveSessionSchema.array().parse(raw);
    },
  });

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Wallet required</AlertTitle>
          <AlertDescription>
            Connect a Sui wallet in the header to see and join live sessions.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const rows = sessions.data ?? [];
  const live = rows.filter((r) => r.status === "live");
  const scheduled = rows.filter((r) => r.status === "scheduled");
  const ended = rows.filter((r) => r.status === "ended").slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="space-y-1">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <Radio className="size-3.5" /> Sessions
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Live</h1>
        <p className="text-muted-foreground text-sm">
          Tune in to creators going live, see what’s scheduled, and catch replays.
        </p>
      </div>

      {sessions.isLoading ? (
        <div className="mt-6 space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {live.length > 0 ? (
            <Section title="Live now" icon={Radio}>
              {live.map((s) => (
                <LiveCard key={s.id} s={s} accent />
              ))}
            </Section>
          ) : null}

          {scheduled.length > 0 ? (
            <Section title="Scheduled" icon={Calendar}>
              {scheduled.map((s) => (
                <LiveCard key={s.id} s={s} />
              ))}
            </Section>
          ) : null}

          {ended.length > 0 ? (
            <Section title="Recent replays">
              {ended.map((s) => (
                <LiveCard key={s.id} s={s} muted />
              ))}
            </Section>
          ) : null}

          {rows.length === 0 ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">No live sessions yet</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3 text-sm">
                <p>Be the first to go live. Creators can schedule a room and invite fans.</p>
                <Button nativeButton={false} render={<Link href="/athlete" />}>
                  Open creator hub
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </main>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
        {title}
      </h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function LiveCard({
  s,
  accent,
  muted,
}: {
  s: {
    id: string;
    title: string;
    startsAt: unknown;
    status: string;
    athleteUserId: string;
    visibilityTierId?: string | null;
  };
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <li>
      <Card
        className={`${accent ? "border-primary/30 bg-primary/5" : ""} ${
          muted ? "opacity-80" : ""
        }`}
      >
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{s.title}</CardTitle>
              {s.status === "live" ? (
                <Badge className="gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-current" />
                  Live
                </Badge>
              ) : s.status === "ended" ? (
                <Badge variant="outline" className="font-normal">
                  Ended
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-normal">
                  Scheduled
                </Badge>
              )}
              {s.visibilityTierId ? (
                <Badge variant="outline" className="font-normal">
                  Tier-gated
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {toDateLabel(s.startsAt)} ·{" "}
              <Link
                href={`/athletes/${s.athleteUserId}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                host profile
              </Link>
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={accent ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`/live/${s.id}`} />}
          >
            {s.status === "live" ? "Join" : s.status === "ended" ? "View" : "Open"}
          </Button>
        </CardHeader>
      </Card>
    </li>
  );
}
