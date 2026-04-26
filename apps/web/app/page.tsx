"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Radio,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { useMe } from "@/hooks/use-me";
import { useAthletes } from "@/hooks/use-athletes";
import { LiveSessionSchema } from "@sui-sports/shared";

export default function Home() {
  const token = useSessionStore((s) => s.token);
  const me = useMe();

  const athletes = useAthletes();

  const lives = useQuery({
    queryKey: ["live-sessions", "home"],
    queryFn: async () => {
      const raw = await apiFetch<unknown>(`/live-sessions`, { method: "GET" });
      return LiveSessionSchema.array().parse(raw);
    },
  });

  const topAthletes = (athletes.data ?? []).slice(0, 6);
  const activeLives = (lives.data ?? [])
    .filter((s) => s.status === "live" || s.status === "scheduled")
    .slice(0, 3);

  const heroCta: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    disabled: boolean;
  } = !token
    ? { href: "#", label: "Connect wallet", icon: Wallet, disabled: true }
    : me.data?.role === "fan"
      ? { href: "/athletes", label: "Discover athletes", icon: Users, disabled: false }
      : { href: "/athlete", label: "Open creator hub", icon: Sparkles, disabled: false };
  const HeroIcon = heroCta.icon;

  return (
    <main className="relative mx-auto flex max-w-6xl flex-col gap-14 px-4 py-12 md:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--color-primary)_22%,transparent),transparent_70%)]"
      />
      <section className="grid gap-10 md:grid-cols-[3fr_2fr] md:items-center">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="ring-border/60 inline-flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-black ring-1 shadow-lg shadow-primary/20">
              <Image
                src="/sui-sport.png"
                alt="Sui Sports"
                width={96}
                height={96}
                className="size-full object-cover"
                priority
              />
            </span>
            <p className="text-primary text-xs font-semibold tracking-widest uppercase">
              Athletes · Fans · Live on Sui
            </p>
          </div>
          <h1 className="text-foreground text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Structured, real-time access to the athletes you care about.
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">
            Verified athlete profiles, SUI-priced tiers, live rooms with chat,
            paywalled drops, and installable web push. One wallet, one session —
            no sign-up.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {heroCta.disabled ? (
              <div className="bg-muted text-muted-foreground inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                <Wallet className="size-4" />
                Connect a Sui wallet in the header to begin
              </div>
            ) : (
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href={heroCta.href} />}
              >
                <HeroIcon className="size-4" />
                {heroCta.label}
                <ArrowRight className="size-4" />
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/start" />}
            >
              How it works
            </Button>
          </div>
        </div>
        <Card className="bg-card/80 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Built for the new fan-athlete deal</CardTitle>
            <CardDescription>
              Four things most fan platforms can’t do together.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Feature
              icon={BadgeCheck}
              title="Admin-verified athletes"
              body="Verified check is an admin decision, not a self-claim."
            />
            <Feature
              icon={Zap}
              title="SUI-priced tiers"
              body="Pay on-chain in SUI; the app confirms and unlocks access."
            />
            <Feature
              icon={Radio}
              title="Live sessions + chat"
              body="Watch and talk in the same room — history stays with the session."
            />
            <Feature
              icon={Bell}
              title="Installable web push"
              body="Add to home screen, get notified when follows go live."
            />
          </CardContent>
        </Card>
      </section>

      {activeLives.length > 0 ? (
        <section className="space-y-3">
          <SectionHead
            icon={Radio}
            kicker="Happening"
            title="Live now & up next"
            cta={{ href: "/live", label: "All sessions" }}
          />
          <ul className="grid gap-3 md:grid-cols-3">
            {activeLives.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/live/${s.id}`}
                  className="ring-foreground/10 bg-card group block rounded-xl p-4 ring-1 transition hover:ring-primary/40"
                >
                  <div className="flex items-center gap-2">
                    {s.status === "live" ? (
                      <Badge className="gap-1">
                        <span className="size-1.5 animate-pulse rounded-full bg-current" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Scheduled</Badge>
                    )}
                    {s.visibilityTierId ? (
                      <Badge variant="outline" className="font-normal">
                        Tier-gated
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 font-medium">{s.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {typeof s.startsAt === "string"
                      ? new Date(s.startsAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHead
          icon={Users}
          kicker="Verified creators"
          title="Athletes on Sui Sports"
          cta={{ href: "/athletes", label: "Explore all" }}
        />
        {athletes.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-muted/40 h-28 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : topAthletes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No athletes yet</CardTitle>
              <CardDescription>
                Be the first. In creator hub, upgrade your fan account to an
                athlete and set up a profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button nativeButton={false} render={<Link href="/athlete" />}>
                Open creator hub
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {topAthletes.map((a) => (
              <li key={a.userId}>
                <Link
                  href={`/athletes/${a.userId}`}
                  className="ring-foreground/10 bg-card block rounded-xl p-4 ring-1 transition hover:ring-primary/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.displayName}</span>
                    {a.verified ? (
                      <Badge className="gap-1" variant="secondary">
                        <BadgeCheck className="size-3" />
                        Verified
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {a.sport || "Sport TBA"} ·{" "}
                    {a.followerCount.toLocaleString()} followers
                  </p>
                  {a.bio ? (
                    <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                      {a.bio}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card/60 ring-foreground/10 rounded-2xl p-6 md:p-8 ring-1">
        <div className="grid gap-6 md:grid-cols-2 md:items-center">
          <div className="space-y-3">
            <p className="text-primary text-xs font-semibold tracking-widest uppercase">
              For athletes
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Monetize your relationship with fans, directly.
            </h2>
            <p className="text-muted-foreground text-pretty">
              Verified profile, membership tiers paid in SUI, paywalled posts,
              and one-tap live rooms. Payouts follow the on-chain subscription.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button nativeButton={false} render={<Link href="/athlete" />}>
                <Sparkles className="size-4" />
                Start creating
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/start" />}
              >
                Read the walkthrough
              </Button>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            <Step n={1} title="Connect wallet" body="Auto-creates your fan account." />
            <Step n={2} title="Upgrade to athlete" body="One click in the creator hub." />
            <Step n={3} title="Add tiers and content" body="Price in SUI, gate by tier." />
            <Step n={4} title="Go live" body="Video + chat room, tier-gated if you want." />
          </div>
        </div>
      </section>

    </main>
  );
}

function SectionHead({
  icon: Icon,
  kicker,
  title,
  cta,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  kicker: string;
  title: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          {Icon ? <Icon className="size-3.5" /> : null}
          {kicker}
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {cta ? (
        <Link
          href={cta.href}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          {cta.label} →
        </Link>
      ) : null}
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="font-medium leading-none">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">{body}</p>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {n}
      </div>
      <div>
        <p className="font-medium leading-none">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">{body}</p>
      </div>
    </div>
  );
}
