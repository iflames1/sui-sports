"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Radio,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/hooks/use-me";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { useAthleteStats } from "@/hooks/use-athletes";
import {
  AthleteProfileSchema,
  ContentItemSchema,
  FanSubscriptionSchema,
  LiveSessionSchema,
  SubscriptionTierSchema,
} from "@sui-sports/shared";

const MIST_PER_SUI = 1_000_000_000;

export default function AthleteHubPage() {
  const token = useSessionStore((s) => s.token);
  const qc = useQueryClient();
  const me = useMe();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [sport, setSport] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [tierName, setTierName] = useState("");
  const [tierSui, setTierSui] = useState("1");
  const [tierDays, setTierDays] = useState("30");
  const [contentTitle, setContentTitle] = useState("");
  const [contentType, setContentType] = useState("post");
  const [contentAccess, setContentAccess] = useState("free");
  const [contentMediaUrl, setContentMediaUrl] = useState("");
  const [contentTierId, setContentTierId] = useState("");
  const [liveTitle, setLiveTitle] = useState("");
  const [liveStart, setLiveStart] = useState("");
  const [liveTierId, setLiveTierId] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const isAthlete = me.data?.role === "athlete";
  const isFan = me.data?.role === "fan";
  const isAdmin = me.data?.role === "admin";
  const userId = me.data?.id;

  const profile = useQuery({
    queryKey: ["athlete", userId],
    enabled: !!userId && (isAthlete || isAdmin),
    retry: false,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/athletes/${userId}`,
        { method: "GET" },
        token,
      );
      return AthleteProfileSchema.parse(raw);
    },
  });

  const stats = useAthleteStats(isAthlete || isAdmin ? userId : undefined);

  const tiers = useQuery({
    queryKey: ["tiers", userId],
    enabled: !!userId && (isAthlete || isAdmin),
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/athletes/${userId}/tiers`,
        { method: "GET" },
        token,
      );
      return SubscriptionTierSchema.array().parse(raw);
    },
  });

  const myContent = useQuery({
    queryKey: ["content-feed", "mine", userId, token],
    enabled: !!token && !!userId && (isAthlete || isAdmin),
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/content/feed?athleteUserId=${userId}`,
        { method: "GET" },
        token,
      );
      return ContentItemSchema.array().parse(raw);
    },
  });

  const myLives = useQuery({
    queryKey: ["athlete-live", "mine", userId, token],
    enabled: !!token && !!userId && (isAthlete || isAdmin),
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/athletes/${userId}/live-sessions`,
        { method: "GET" },
        token,
      );
      return LiveSessionSchema.array().parse(raw);
    },
  });

  const subs = useQuery({
    queryKey: ["subscriptions-me", token],
    enabled: !!token,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/subscriptions/me`,
        { method: "GET" },
        token,
      );
      return FanSubscriptionSchema.array().parse(raw);
    },
  });

  const registerAthlete = useMutation({
    mutationFn: () =>
      apiFetch(`/athletes/register`, { method: "POST", body: "{}" }, token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["athlete", userId] });
      await qc.invalidateQueries({ queryKey: ["tiers", userId] });
    },
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      apiFetch(
        `/athletes/me/profile`,
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: displayName.trim() || undefined,
            bio: bio.trim() || undefined,
            sport: sport.trim() || undefined,
            avatarUrl: avatarUrl.trim() || undefined,
          }),
        },
        token,
      ),
    onSuccess: async () => {
      setProfileMsg("Saved.");
      await qc.invalidateQueries({ queryKey: ["athlete", userId] });
    },
    onError: (e: Error) => setProfileMsg(e.message || "Save failed."),
  });

  const requestVerification = useMutation({
    mutationFn: () =>
      apiFetch(
        `/athletes/me/request-verification`,
        { method: "POST", body: "{}" },
        token,
      ),
    onSuccess: async () => {
      setProfileMsg("Verification requested. An admin will review.");
      await qc.invalidateQueries({ queryKey: ["athlete", userId] });
    },
    onError: (e: Error) => setProfileMsg(e.message || "Request failed."),
  });

  const createTier = useMutation({
    mutationFn: () => {
      const sui = Number(tierSui);
      const days = Number(tierDays);
      const priceMist = Math.round(sui * MIST_PER_SUI);
      if (!tierName.trim() || !Number.isFinite(priceMist) || !Number.isFinite(days)) {
        return Promise.reject(new Error("Invalid tier fields"));
      }
      return apiFetch(
        `/tiers`,
        {
          method: "POST",
          body: JSON.stringify({
            name: tierName.trim(),
            priceMist,
            billingPeriodDays: days,
          }),
        },
        token,
      );
    },
    onSuccess: async () => {
      setTierName("");
      await qc.invalidateQueries({ queryKey: ["tiers", userId] });
    },
  });

  const createContent = useMutation({
    mutationFn: () => {
      if (!contentTitle.trim()) {
        return Promise.reject(new Error("Title required"));
      }
      if (contentAccess === "tier" && !contentTierId) {
        return Promise.reject(new Error("Pick a tier for gated content"));
      }
      return apiFetch(
        `/content`,
        {
          method: "POST",
          body: JSON.stringify({
            title: contentTitle.trim(),
            type: contentType,
            mediaUrl: contentMediaUrl.trim() || null,
            accessRule: contentAccess,
            requiredTierId: contentAccess === "tier" ? contentTierId : null,
          }),
        },
        token,
      );
    },
    onSuccess: async () => {
      setContentTitle("");
      setContentMediaUrl("");
      await qc.invalidateQueries({ queryKey: ["content-feed", "mine", userId, token] });
      await qc.invalidateQueries({ queryKey: ["content-feed", token] });
    },
  });

  const createLive = useMutation({
    mutationFn: () => {
      if (!liveTitle.trim() || !liveStart) {
        return Promise.reject(new Error("Title and start time required"));
      }
      const iso = new Date(liveStart).toISOString();
      return apiFetch<{ id: string }>(
        `/live-sessions`,
        {
          method: "POST",
          body: JSON.stringify({
            title: liveTitle.trim(),
            startsAt: iso,
            visibilityTierId: liveTierId || null,
          }),
        },
        token,
      );
    },
    onSuccess: async (data) => {
      setLiveTitle("");
      setLiveStart("");
      setLiveTierId("");
      if (data?.id) {
        window.location.href = `/live/${data.id}`;
      }
    },
  });

  useEffect(() => {
    const p = profile.data;
    if (p) {
      setDisplayName(p.displayName ?? "");
      setBio(p.bio ?? "");
      setSport(p.sport ?? "");
      setAvatarUrl(p.avatarUrl ?? "");
    }
  }, [profile.data]);

  const tierOptions = useMemo(
    () => (tiers.data ?? []).map((t) => ({ id: t.id, name: t.name })),
    [tiers.data],
  );

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Wallet required</AlertTitle>
          <AlertDescription className="mt-2">
            Connect a wallet in the header, then return here to become a creator.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (me.isLoading) {
    return (
      <main className="text-muted-foreground flex justify-center px-4 py-20 text-sm">
        <Loader2 className="size-6 animate-spin" />
      </main>
    );
  }

  if (me.isError || !me.data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert variant="destructive">
          <AlertTitle>Could not load account</AlertTitle>
          <AlertDescription>
            {me.error instanceof Error ? me.error.message : "Something went wrong."}{" "}
            Disconnect and reconnect your wallet.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const publicProfileUrl = userId ? `/athletes/${userId}` : null;
  const p = profile.data;
  const verifiedBadge = p?.verified ? (
    <Badge className="gap-1" variant="secondary">
      <BadgeCheck className="size-3" />
      Verified
    </Badge>
  ) : p?.verificationRequestedAt ? (
    <Badge variant="outline" className="font-normal">
      Verification pending
    </Badge>
  ) : (
    <Badge variant="outline" className="font-normal">
      Unverified
    </Badge>
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Creator hub</h1>
          <Badge variant="secondary" className="font-normal capitalize">
            {me.data.role}
          </Badge>
          {(isAthlete || isAdmin) && p ? verifiedBadge : null}
        </div>
        <p className="text-muted-foreground text-sm text-pretty">
          Your profile, tiers, posts, and live rooms — all in one place. New to
          the flow?{" "}
          <Link
            href="/start"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Read the walkthrough
          </Link>
          .
        </p>
        {publicProfileUrl ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={publicProfileUrl} />}
          >
            View public profile
            <ExternalLink className="size-3.5" />
          </Button>
        ) : null}
      </header>

      {stats.data ? (
        <div className="grid grid-cols-3 gap-3">
          <StatCell label="Followers" value={stats.data.followerCount} />
          <StatCell
            label="Active subs"
            value={stats.data.activeSubscriberCount}
          />
          <StatCell label="Posts" value={stats.data.contentCount} />
        </div>
      ) : null}

      {isFan ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">1. Become an athlete</CardTitle>
            <CardDescription>
              Switch your account to creator mode. One click; profile comes next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              disabled={registerAthlete.isPending}
              onClick={() => registerAthlete.mutate()}
            >
              {registerAthlete.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Upgrading…
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Become an athlete
                </>
              )}
            </Button>
            {registerAthlete.isError ? (
              <p className="text-destructive mt-2 text-sm">
                Could not upgrade. Try again.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin && !p ? (
        <Alert>
          <AlertTitle>Admin account</AlertTitle>
          <AlertDescription>
            Admin accounts don’t have a creator profile by default. Use a
            different wallet to test the athlete flow.
          </AlertDescription>
        </Alert>
      ) : null}

      {(isAthlete || isAdmin) && profile.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Profile not found</AlertTitle>
          <AlertDescription>
            Your athlete profile doesn’t exist yet. Try logging out and back in,
            or contact support.
          </AlertDescription>
        </Alert>
      ) : null}

      {(isAthlete || isAdmin) && p ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Public profile</CardTitle>
              <CardDescription>
                This is what fans see on your athlete page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sport">Sport</Label>
                  <Input
                    id="sport"
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    placeholder="e.g. Basketball"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatar">Avatar URL</Label>
                <Input
                  id="avatar"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="resize-y"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={saveProfile.isPending}
                  onClick={() => saveProfile.mutate()}
                >
                  {saveProfile.isPending ? "Saving…" : "Save profile"}
                </Button>
                {!p.verified ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      requestVerification.isPending ||
                      !!p.verificationRequestedAt
                    }
                    onClick={() => requestVerification.mutate()}
                  >
                    <BadgeCheck className="size-4" />
                    {p.verificationRequestedAt
                      ? "Verification requested"
                      : "Request verification"}
                  </Button>
                ) : null}
              </div>
              {profileMsg ? (
                <p className="text-muted-foreground text-xs">{profileMsg}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Subscription tiers</CardTitle>
              <CardDescription>
                Fans pay in SUI. Choose a name, price, and renewal period.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="tierName">Name</Label>
                  <Input
                    id="tierName"
                    value={tierName}
                    onChange={(e) => setTierName(e.target.value)}
                    placeholder="Gold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tierSui">Price (SUI)</Label>
                  <Input
                    id="tierSui"
                    type="number"
                    min={0}
                    step="0.001"
                    value={tierSui}
                    onChange={(e) => setTierSui(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tierDays">Period (days)</Label>
                  <Input
                    id="tierDays"
                    type="number"
                    min={1}
                    value={tierDays}
                    onChange={(e) => setTierDays(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={createTier.isPending}
                onClick={() => createTier.mutate()}
              >
                <Plus className="size-3.5" />
                {createTier.isPending ? "Creating…" : "Add tier"}
              </Button>
              {createTier.isError ? (
                <p className="text-destructive text-sm">
                  {createTier.error instanceof Error
                    ? createTier.error.message
                    : "Could not create tier."}
                </p>
              ) : null}
              {(tiers.data ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {(tiers.data ?? []).map((t) => (
                    <li
                      key={t.id}
                      className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-muted-foreground">
                        {(t.priceMist / MIST_PER_SUI).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}{" "}
                        SUI / {t.billingPeriodDays}d
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">No tiers yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="size-4" />
                4. Publish content
              </CardTitle>
              <CardDescription>
                Free posts go to everyone. Tier posts need an active subscription
                to the selected tier.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cTitle">Title</Label>
                <Input
                  id="cTitle"
                  value={contentTitle}
                  onChange={(e) => setContentTitle(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cType">Type</Label>
                  <select
                    id="cType"
                    className="border-input bg-background h-8 w-full rounded-lg border px-2 text-sm"
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                  >
                    <option value="post">Post</option>
                    <option value="clip">Clip</option>
                    <option value="file">File</option>
                    <option value="replay">Replay</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cAccess">Access</Label>
                  <select
                    id="cAccess"
                    className="border-input bg-background h-8 w-full rounded-lg border px-2 text-sm"
                    value={contentAccess}
                    onChange={(e) => setContentAccess(e.target.value)}
                  >
                    <option value="free">Free — everyone</option>
                    <option value="tier">Subscribers of a tier</option>
                    <option value="live_replay">Live replay</option>
                  </select>
                </div>
              </div>
              {contentAccess === "tier" ? (
                <div className="space-y-2">
                  <Label htmlFor="cTier">Required tier</Label>
                  <select
                    id="cTier"
                    className="border-input bg-background h-8 w-full rounded-lg border px-2 text-sm"
                    value={contentTierId}
                    onChange={(e) => setContentTierId(e.target.value)}
                  >
                    <option value="">Pick a tier…</option>
                    {tierOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {tierOptions.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Create a tier above first.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="cMedia">Media URL (optional)</Label>
                <Input
                  id="cMedia"
                  value={contentMediaUrl}
                  onChange={(e) => setContentMediaUrl(e.target.value)}
                  placeholder="https://… (image, video, file link)"
                />
              </div>
              <Button
                type="button"
                disabled={createContent.isPending}
                onClick={() => createContent.mutate()}
              >
                <Upload className="size-3.5" />
                {createContent.isPending ? "Publishing…" : "Publish"}
              </Button>
              {createContent.isError ? (
                <p className="text-destructive text-sm">
                  {createContent.error instanceof Error
                    ? createContent.error.message
                    : "Publish failed."}
                </p>
              ) : null}
              {(myContent.data ?? []).length > 0 ? (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Your recent posts</h4>
                  <ul className="space-y-1.5">
                    {(myContent.data ?? []).slice(0, 8).map((c) => (
                      <li
                        key={c.id}
                        className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-foreground truncate font-medium">
                          {c.title}
                        </span>
                        <span>
                          {c.type} ·{" "}
                          {c.accessRule === "free"
                            ? "Free"
                            : c.accessRule === "tier"
                              ? "Tier"
                              : "Live replay"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Radio className="size-4" />
                5. Live session
              </CardTitle>
              <CardDescription>
                Schedule or start a live room. Leave tier empty for an open
                session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="liveTitle">Title</Label>
                <Input
                  id="liveTitle"
                  value={liveTitle}
                  onChange={(e) => setLiveTitle(e.target.value)}
                  placeholder="Post-game Q&A"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="liveStart">Starts at</Label>
                  <Input
                    id="liveStart"
                    type="datetime-local"
                    value={liveStart}
                    onChange={(e) => setLiveStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="liveTier">Restrict to tier (optional)</Label>
                  <select
                    id="liveTier"
                    className="border-input bg-background h-8 w-full rounded-lg border px-2 text-sm"
                    value={liveTierId}
                    onChange={(e) => setLiveTierId(e.target.value)}
                  >
                    <option value="">Open to everyone</option>
                    {tierOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={createLive.isPending}
                onClick={() => createLive.mutate()}
              >
                <Radio className="size-3.5" />
                {createLive.isPending ? "Creating…" : "Create & open live room"}
              </Button>
              {createLive.isError ? (
                <p className="text-destructive text-sm">
                  {createLive.error instanceof Error
                    ? createLive.error.message
                    : "Could not create session."}
                </p>
              ) : null}
              {(myLives.data ?? []).length > 0 ? (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Your sessions</h4>
                  <ul className="space-y-1.5">
                    {(myLives.data ?? []).slice(0, 8).map((s) => (
                      <li
                        key={s.id}
                        className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <Link
                          href={`/live/${s.id}`}
                          className="text-primary truncate font-medium underline-offset-4 hover:underline"
                        >
                          {s.title}
                        </Link>
                        <span className="uppercase">{s.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your subscriptions</CardTitle>
          <CardDescription>
            Memberships you hold as a fan appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subs.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : subs.isError ? (
            <p className="text-destructive text-sm">
              Could not load subscriptions.
            </p>
          ) : (subs.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              You don’t hold any active passes yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(subs.data ?? []).map((r) => {
                const until = new Date(r.validUntil);
                const date = Number.isNaN(until.getTime())
                  ? r.validUntil
                  : until.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });
                return (
                  <li
                    key={r.id}
                    className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <span>
                      <Check className="text-primary inline size-3.5" />{" "}
                      <span className="font-medium">
                        {r.tierName ?? "Tier"}
                      </span>
                      {r.athleteDisplayName ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {r.athleteDisplayName}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Active until {date}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="ring-foreground/10 bg-card rounded-xl p-3 text-center ring-1">
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-muted-foreground mt-0.5 text-xs uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}
