"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Search, Users } from "lucide-react";
import { useAthletes } from "@/hooks/use-athletes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
      {initials || "?"}
    </div>
  );
}

export default function AthletesDiscoverPage() {
  const [q, setQ] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const query = useAthletes({ q: q.trim() || undefined, verified: onlyVerified || undefined });

  const rows = query.data ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Users className="size-3.5" /> Discover
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Athletes</h1>
          <p className="text-muted-foreground max-w-lg text-sm">
            Browse verified athletes, follow favorites, subscribe to a tier in SUI,
            and get live notifications.
          </p>
        </div>
        <Button
          variant={onlyVerified ? "default" : "outline"}
          size="sm"
          type="button"
          onClick={() => setOnlyVerified((v) => !v)}
        >
          <BadgeCheck className="size-3.5" />
          Verified only
        </Button>
      </div>

      <div className="relative mt-6">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          className="pl-9"
          placeholder="Search by name, sport, or keyword"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {query.isLoading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Could not load athletes</AlertTitle>
          <AlertDescription>
            The API might be down. Make sure the backend is running on port 8080.
          </AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="text-muted-foreground size-8" />
            <p className="font-medium">No athletes yet</p>
            <p className="text-muted-foreground text-sm">
              Be the first to create a profile and start earning.
            </p>
            <Button nativeButton={false} render={<Link href="/athlete" />}>
              Become an athlete
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {rows.map((a) => (
            <li key={a.userId}>
              <Link
                href={`/athletes/${a.userId}`}
                className={cn(
                  "group block rounded-xl ring-1 ring-foreground/10 bg-card p-4 transition hover:ring-2 hover:ring-primary/40",
                )}
              >
                <div className="flex items-start gap-3">
                  <Initials name={a.displayName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{a.displayName}</span>
                      {a.verified ? (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <BadgeCheck className="size-3" />
                          Verified
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {a.sport || "Sport TBA"} · {a.followerCount.toLocaleString()} followers
                    </p>
                    {a.bio ? (
                      <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                        {a.bio}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
