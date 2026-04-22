"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { useMe } from "@/hooks/use-me";
import { AthleteProfileSchema } from "@sui-sports/shared";
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
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPage() {
  const token = useSessionStore((s) => s.token);
  const me = useMe();
  const qc = useQueryClient();

  const pending = useQuery({
    queryKey: ["admin-pending", token],
    enabled: !!token && me.data?.role === "admin",
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/admin/athletes/pending`,
        { method: "GET" },
        token,
      );
      return AthleteProfileSchema.array().parse(raw);
    },
  });

  const verify = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(
        `/admin/athletes/${userId}/verify`,
        { method: "POST", body: "{}" },
        token,
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-pending"] });
      await qc.invalidateQueries({ queryKey: ["athletes"] });
    },
  });

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Wallet required</AlertTitle>
          <AlertDescription>Connect a wallet in the header.</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (me.isLoading) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 px-4 py-16">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </main>
    );
  }

  if (me.data?.role !== "admin") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert variant="destructive">
          <AlertTitle>Admin only</AlertTitle>
          <AlertDescription>
            Your account role is <code>{me.data?.role ?? "unknown"}</code>. Set
            <code> BOOTSTRAP_ADMIN_ZKLOGIN_SUBJECT </code> in the API env to your
            wallet subject to bootstrap an admin.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="space-y-1">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <ShieldCheck className="size-3.5" />
          Admin
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Verification queue</h1>
        <p className="text-muted-foreground text-sm">
          Approve athletes who asked to be verified or who joined recently.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {pending.isLoading ? (
          [1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : pending.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load</AlertTitle>
            <AlertDescription>
              {pending.error instanceof Error
                ? pending.error.message
                : "Unknown error."}
            </AlertDescription>
          </Alert>
        ) : (pending.data ?? []).length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Queue is empty</CardTitle>
              <CardDescription>
                No unverified athletes. Nice work.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          (pending.data ?? []).map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{a.displayName}</CardTitle>
                    {a.verificationRequestedAt ? (
                      <Badge variant="secondary" className="font-normal">
                        Requested
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        New
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {a.sport ?? "Sport TBA"}
                  </CardDescription>
                  {a.bio ? (
                    <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                      {a.bio}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button
                    size="sm"
                    type="button"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate(a.userId)}
                  >
                    <BadgeCheck className="size-3.5" />
                    Verify
                  </Button>
                  <Link
                    href={`/athletes/${a.userId}`}
                    className="text-primary text-xs underline-offset-4 hover:underline"
                  >
                    View profile
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                <code className="font-mono">{a.userId}</code>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
