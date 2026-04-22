"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/lib/store";
import { ContentItemSchema } from "@sui-sports/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";

export default function FeedPage() {
  const token = useSessionStore((s) => s.token);
  const me = useMe();
  const q = useQuery({
    queryKey: ["content-feed", token],
    enabled: !!token,
    queryFn: async () => {
      const raw = await apiFetch<unknown>("/content/feed", { method: "GET" }, token);
      return ContentItemSchema.array().parse(raw);
    },
  });

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Wallet required</AlertTitle>
          <AlertDescription className="mt-2">
            Connect a Sui wallet in the header. Your session is created automatically
            when the wallet connects.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
        <p className="text-muted-foreground text-sm">
          Paywalled items appear only when your subscription matches.
        </p>
      </div>
      <Card className="mt-6 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Get started</CardTitle>
          <CardDescription>
            New here? See the short walkthrough, or go straight to publishing as a
            creator.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/start" />}>
            How it works
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/athlete" />}>
            Creator hub
            {me.data?.role === "fan" ? " · upgrade" : ""}
          </Button>
        </CardContent>
      </Card>
      {q.isLoading ? (
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : q.isError ? (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Could not load feed.</AlertDescription>
        </Alert>
      ) : (
        <ul className="mt-8 space-y-4">
          {(q.data ?? []).map((item) => (
            <li key={item.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs uppercase">
                      {item.type}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {typeof item.createdAt === "string"
                        ? new Date(item.createdAt).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  {item.mediaUrl ? (
                    <CardDescription>
                      <a
                        href={item.mediaUrl}
                        className="text-primary font-medium underline-offset-4 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open media
                      </a>
                    </CardDescription>
                  ) : null}
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
