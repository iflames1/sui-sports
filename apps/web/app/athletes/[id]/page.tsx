"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  Heart,
  Radio,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import { useAthleteStats } from "@/hooks/use-athletes";
import { useSessionStore } from "@/lib/store";
import {
  AthleteProfileSchema,
  ContentItemSchema,
  LiveSessionSchema,
  SubscriptionTierSchema,
} from "@sui-sports/shared";

const MIST_PER_SUI = 1_000_000_000;

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="bg-muted size-16 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="bg-muted text-muted-foreground ring-border flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold ring-1">
      {initials || "?"}
    </div>
  );
}

export default function AthletePage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const token = useSessionStore((s) => s.token);
  const me = useMe();
  const qc = useQueryClient();
  const [digestByTier, setDigestByTier] = useState<Record<string, string>>({});
  const [confirmingTier, setConfirmingTier] = useState<string | null>(null);
  const [subMsg, setSubMsg] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);

  const profile = useQuery({
    queryKey: ["athlete", id],
    enabled: !!id,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(`/athletes/${id}`, { method: "GET" }, token);
      return AthleteProfileSchema.parse(raw);
    },
  });

  const stats = useAthleteStats(id);

  const tiers = useQuery({
    queryKey: ["tiers", id],
    enabled: !!id,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/athletes/${id}/tiers`,
        { method: "GET" },
        token,
      );
      return SubscriptionTierSchema.array().parse(raw);
    },
  });

  const content = useQuery({
    queryKey: ["athlete-content", id, token],
    enabled: !!id && !!token,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/content/feed?athleteUserId=${id}`,
        { method: "GET" },
        token,
      );
      return ContentItemSchema.array().parse(raw);
    },
  });

  const lives = useQuery({
    queryKey: ["athlete-live", id],
    enabled: !!id,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/athletes/${id}/live-sessions`,
        { method: "GET" },
        token,
      );
      return LiveSessionSchema.array().parse(raw);
    },
  });

  const follow = useMutation({
    mutationFn: (action: "follow" | "unfollow") =>
      apiFetch(
        `/athletes/${id}/follow`,
        { method: action === "follow" ? "POST" : "DELETE", body: "{}" },
        token,
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["athlete-stats", id] });
      await qc.invalidateQueries({ queryKey: ["follows-me"] });
    },
  });

  const registerAthlete = useMutation({
    mutationFn: () =>
      apiFetch(`/athletes/register`, { method: "POST", body: "{}" }, token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["athlete", id] });
    },
  });

  const confirmSub = useMutation({
    mutationFn: async (tierId: string) => {
      const d = (digestByTier[tierId] ?? "").trim() || "dev-placeholder-digest";
      return apiFetch(
        `/subscriptions/sui/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            txDigest: d,
            tierId,
            payerWallet: null,
            entitlementObjectId: null,
          }),
        },
        token,
      );
    },
    onSuccess: async () => {
      setSubMsg({ type: "ok", text: "Subscription confirmed. Access updated." });
      setConfirmingTier(null);
      await qc.invalidateQueries({ queryKey: ["athlete-stats", id] });
      await qc.invalidateQueries({ queryKey: ["subscriptions-me"] });
    },
    onError: (e: Error) =>
      setSubMsg({ type: "error", text: e.message || "Confirm failed." }),
  });

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Wallet required</AlertTitle>
          <AlertDescription className="mt-2">
            Connect a Sui wallet in the header to view athletes.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (profile.isLoading) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </main>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert variant="destructive">
          <AlertTitle>Not found</AlertTitle>
          <AlertDescription>
            This athlete doesn’t exist or hasn’t been set up yet.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const p = profile.data;
  const isSelf = me.data?.id === id;
  const showBecomeAthlete = isSelf && me.data?.role === "fan";
  const activeTiers = new Set(stats.data?.activeSubscriptionTierIds ?? []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start gap-5">
        <Avatar name={p.displayName} url={p.avatarUrl ?? null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{p.displayName}</h1>
            {p.verified ? (
              <Badge className="gap-1" variant="secondary">
                <BadgeCheck className="size-3" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal">
                Unverified
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {p.sport ?? "Sport TBA"}
            {stats.data ? (
              <>
                {" "}
                ·{" "}
                <span>{stats.data.followerCount.toLocaleString()} followers</span>{" "}
                · <span>{stats.data.contentCount} posts</span>
              </>
            ) : null}
          </p>
          {p.bio ? (
            <p className="text-foreground/90 mt-3 max-w-2xl text-sm text-pretty">
              {p.bio}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!isSelf ? (
            <Button
              type="button"
              variant={stats.data?.isFollowing ? "secondary" : "default"}
              size="sm"
              disabled={follow.isPending || !stats.data}
              onClick={() =>
                follow.mutate(stats.data?.isFollowing ? "unfollow" : "follow")
              }
            >
              {stats.data?.isFollowing ? (
                <>
                  <UserCheck className="size-3.5" />
                  Following
                </>
              ) : (
                <>
                  <Heart className="size-3.5" />
                  Follow
                </>
              )}
            </Button>
          ) : null}
          {showBecomeAthlete ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={registerAthlete.isPending}
              onClick={() => registerAthlete.mutate()}
            >
              {registerAthlete.isPending ? "Upgrading…" : "Become athlete"}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-medium tracking-tight">Membership tiers</h2>
          {stats.data && stats.data.activeSubscriptionTierIds.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              You hold {stats.data.activeSubscriptionTierIds.length} active tier(s)
            </p>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Pay on-chain in your wallet, then confirm here. Subscribing unlocks the
          tier-gated posts and live rooms below.
        </p>
        {tiers.isLoading ? (
          <div className="mt-4 space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (tiers.data ?? []).length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            This athlete hasn’t set up tiers yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(tiers.data ?? []).map((t) => {
              const active = activeTiers.has(t.id);
              const confirming = confirmingTier === t.id;
              return (
                <li key={t.id}>
                  <Card className={active ? "border-primary/30 bg-primary/5" : ""}>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                      <div className="min-w-0">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          {t.name}
                          {active ? (
                            <Badge className="gap-1" variant="secondary">
                              <Check className="size-3" />
                              Active
                            </Badge>
                          ) : null}
                        </CardTitle>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {(t.priceMist / MIST_PER_SUI).toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}{" "}
                          SUI / {t.billingPeriodDays}d
                        </p>
                      </div>
                      {active ? (
                        <Badge variant="outline" className="font-normal">
                          Enjoy your perks
                        </Badge>
                      ) : !isSelf ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            setConfirmingTier((prev) => (prev === t.id ? null : t.id))
                          }
                        >
                          {confirming ? "Close" : "Subscribe"}
                        </Button>
                      ) : null}
                    </CardHeader>
                    {confirming ? (
                      <CardContent className="space-y-3 border-t pt-3">
                        <p className="text-muted-foreground text-xs">
                          Step 1: Send the on-chain payment in your wallet. Step 2:
                          Paste the transaction digest below, then confirm.
                        </p>
                        <Input
                          className="font-mono text-xs"
                          placeholder="Transaction digest (optional in dev)"
                          value={digestByTier[t.id] ?? ""}
                          onChange={(e) =>
                            setDigestByTier((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={confirmSub.isPending}
                          onClick={() => confirmSub.mutate(t.id)}
                        >
                          {confirmSub.isPending ? "Confirming…" : "I paid — confirm"}
                        </Button>
                      </CardContent>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        {subMsg ? (
          <Alert
            className="mt-4"
            variant={subMsg.type === "error" ? "destructive" : "default"}
          >
            <AlertDescription>{subMsg.text}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight">
          <Radio className="size-4" />
          Live sessions
        </h2>
        {lives.isLoading ? (
          <Skeleton className="mt-3 h-20 w-full rounded-xl" />
        ) : (lives.data ?? []).length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            No scheduled sessions yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {(lives.data ?? []).slice(0, 8).map((s) => (
              <li key={s.id}>
                <Link
                  href={`/live/${s.id}`}
                  className="bg-card ring-foreground/10 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ring-1 hover:ring-primary/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{s.title}</span>
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
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {typeof s.startsAt === "string"
                        ? new Date(s.startsAt).toLocaleString()
                        : ""}
                    </p>
                  </div>
                  <span className="text-primary text-xs">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium tracking-tight">Content</h2>
        {content.isLoading ? (
          <Skeleton className="mt-3 h-20 w-full rounded-xl" />
        ) : (content.data ?? []).length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            No posts visible to you yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(content.data ?? []).map((c) => (
              <li key={c.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                      <span className="uppercase">{c.type}</span>
                      <span>
                        {typeof c.createdAt === "string"
                          ? new Date(c.createdAt).toLocaleString()
                          : ""}
                      </span>
                    </div>
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    {c.accessRule !== "free" ? (
                      <CardDescription>
                        <Badge variant="outline" className="font-normal">
                          {c.accessRule === "tier" ? "Tier" : "Live replay"}
                        </Badge>
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  {c.mediaUrl ? (
                    <CardContent>
                      <a
                        href={c.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                      >
                        Open media →
                      </a>
                    </CardContent>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
