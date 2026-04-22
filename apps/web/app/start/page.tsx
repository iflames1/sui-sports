"use client";
/*
 * Onboarding copy — implementation notes for devs (not shown in the UI):
 * - Session: wallet connect → user + JWT; role starts as "fan" until /athletes/register
 * - Subscriptions: on-chain SUI payment, then app confirms; dev builds may allow placeholder digests
 * - Creators: pricing stored as MIST in API; admin may set "verified" on profiles; live rooms may be tier-gated
 */

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Radio,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSessionStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function Step({
  n,
  title,
  body,
  done,
}: {
  n: number;
  title: string;
  body: string;
  done?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          done
            ? "border-primary bg-primary/15 text-primary"
            : "text-muted-foreground border-border bg-muted/40",
        )}
      >
        {done ? <CheckCircle2 className="size-5" /> : n}
      </div>
      <div className="space-y-1 pb-8">
        <h3 className="font-medium leading-none">{title}</h3>
        <p className="text-muted-foreground text-sm text-pretty">{body}</p>
      </div>
    </div>
  );
}

export default function StartPage() {
  const token = useSessionStore((s) => s.token);
  const me = useMe();
  const hasWallet = !!token;
  const isAthlete = me.data?.role === "athlete" || me.data?.role === "admin";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <div className="space-y-3">
        <p className="text-primary text-xs font-medium tracking-widest uppercase">
          How Sui Sports works
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Your path from wallet to feed
        </h1>
        <p className="text-muted-foreground max-w-2xl text-pretty text-lg">
          One connected wallet creates your account. Fans follow and subscribe in
          SUI. Creators publish profiles, tiers, and paywalled content.
        </p>
      </div>

      {!hasWallet ? (
        <Alert className="mt-8">
          <Wallet className="size-4" />
          <AlertTitle>Connect first</AlertTitle>
          <AlertDescription className="mt-2">
            Use <strong>Connect wallet</strong> in the header. Your session is
            created automatically—no separate sign-up page.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="mt-10 space-y-2">
        <h2 className="text-lg font-medium">Fan journey</h2>
        <p className="text-muted-foreground text-sm">
          Most people stay here: discover athletes, follow, and unlock tiers.
        </p>
        <Card className="mt-4">
          <CardContent className="relative space-y-0 pt-6">
            <div className="absolute top-10 bottom-10 left-[17px] w-px bg-border" aria-hidden />
            <Step
              n={1}
              done={hasWallet}
              title="Connect Sui wallet"
              body="This signs you in and sets up your account—no separate sign-up page."
            />
            <Step
              n={2}
              done={hasWallet}
              title="Explore & follow"
              body="Open athletes from a link, save ones you like, and get updates from people you follow."
            />
            <Step
              n={3}
              done={false}
              title="Subscribe in SUI"
              body="Choose a membership tier, pay on-chain, then you’ll see the posts and replays that tier unlocks."
            />
          </CardContent>
        </Card>
      </section>

      <Separator className="my-12" />

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Sparkles className="size-5 text-primary" />
          Creator journey
        </h2>
        <p className="text-muted-foreground text-sm">
          Turn your fan account into a creator profile, then add tiers and
          content.
        </p>
        <Card className="mt-4 border-primary/20 bg-primary/5">
          <CardContent className="relative space-y-0 pt-6">
            <div className="absolute top-10 bottom-10 left-[17px] w-px bg-primary/25" aria-hidden />
            <Step
              n={1}
              done={hasWallet}
              title="Wallet & fan account"
              body="Same first step as fans—you already have a user id and role “fan”."
            />
            <Step
              n={2}
              done={isAthlete}
              title="Become an athlete"
              body="In Creator hub, switch your account to creator and add a public profile."
            />
            <Step
              n={3}
              done={isAthlete}
              title="Profile & tiers"
              body="Set your name, bio, and sport, then add membership tiers in SUI with the renewal period you want."
            />
            <Step
              n={4}
              done={isAthlete}
              title="Content & live"
              body="Post for everyone or for a tier, and go live when you’re ready—optionally limited to a tier’s supporters."
            />
          </CardContent>
        </Card>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button nativeButton={false} render={<Link href="/athlete" />}>
            Open creator hub
            <ArrowRight className="size-4" />
          </Button>
          {!isAthlete && hasWallet ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Circle className="size-3" />
              You’re a fan—creator hub has a one-click upgrade.
            </p>
          ) : null}
          {isAthlete ? (
            <p className="text-primary flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4" />
              You’re set up as a creator. Finish your profile in the hub.
            </p>
          ) : null}
        </div>
      </section>

      <Separator className="my-12" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Users className="text-muted-foreground size-8" />
            <CardTitle className="text-base">Fans</CardTitle>
            <CardDescription>
              Feed, follows, and subscriptions—all tied to your wallet session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/feed" />}>
              Open feed
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Radio className="text-muted-foreground size-8" />
            <CardTitle className="text-base">Creators</CardTitle>
            <CardDescription>
              Profile, tiers, content, and live sessions in one place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/athlete" />}>
              Creator hub
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
