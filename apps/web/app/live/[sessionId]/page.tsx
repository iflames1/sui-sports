"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Room, RoomEvent, Track } from "livekit-client";
import { ArrowLeft, Radio, Send, StopCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, getApiBase } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import { useSessionStore } from "@/lib/store";
import { LiveSessionSchema } from "@sui-sports/shared";

type JoinRes = {
  token: string | null;
  url: string | null;
  room: string;
  identity: string;
  dev?: boolean;
  message?: string;
  isHost?: boolean;
};

type ChatLine = {
  userId?: string;
  text: string;
  at: string;
  historical?: boolean;
};

function shortId(id: string) {
  return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "";
}

function parseLine(raw: string): ChatLine | null {
  try {
    const j = JSON.parse(raw) as ChatLine;
    if (typeof j?.text !== "string") return null;
    return j;
  } catch {
    return null;
  }
}

export default function LiveSessionPage() {
  const params = useParams();
  const sessionId = String(params.sessionId ?? "");
  const token = useSessionStore((s) => s.token);
  const me = useMe();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [out, setOut] = useState("");
  const [livekitStatus, setLivekitStatus] = useState<string>("");
  const [isHost, setIsHost] = useState(false);

  const session = useQuery({
    queryKey: ["live-session", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/live-sessions/${sessionId}`,
        { method: "GET" },
        token,
      );
      return LiveSessionSchema.parse(raw);
    },
  });

  const endSession = useMutation({
    mutationFn: () =>
      apiFetch(
        `/live-sessions/${sessionId}/end`,
        { method: "POST", body: "{}" },
        token,
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["live-session", sessionId] });
      await qc.invalidateQueries({ queryKey: ["live-sessions"] });
    },
  });

  useEffect(() => {
    if (!token || !sessionId) return;
    let room: Room | undefined;
    void (async () => {
      try {
        const join = await apiFetch<JoinRes>(
          `/live-sessions/${sessionId}/join-token`,
          { method: "POST", body: "{}" },
          token,
        );
        setIsHost(!!join.isHost);
        if (!join.token || !join.url) {
          setLivekitStatus(
            join.dev
              ? "LiveKit not configured on API — chat still works."
              : "No LiveKit token available.",
          );
          return;
        }
        room = new Room();
        await room.connect(join.url, join.token);
        setLivekitStatus("Connected to room");
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
          }
        });
      } catch (e) {
        setLivekitStatus(
          e instanceof Error
            ? `Could not join LiveKit: ${e.message}`
            : "Could not join LiveKit",
        );
      }
    })();
    return () => {
      void room?.disconnect();
    };
  }, [token, sessionId]);

  useEffect(() => {
    if (!token || !sessionId) return;
    const wsBase = getApiBase().replace(/^http/, "ws");
    const ws = new WebSocket(
      `${wsBase}/ws/sessions/${sessionId}/chat?token=${encodeURIComponent(token)}`,
    );
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const line = parseLine(ev.data as string);
      if (!line) return;
      setLines((prev) => {
        const next = [...prev, line];
        return next.length > 300 ? next.slice(next.length - 300) : next;
      });
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, sessionId]);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Wallet required</AlertTitle>
          <AlertDescription className="mt-2">
            Connect a Sui wallet in the header to join this live session.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const s = session.data;
  const meId = me.data?.id;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[2fr_1fr]">
      <div className="min-w-0 space-y-3">
        <Link
          href="/live"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="size-3.5" />
          All live sessions
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {session.isLoading ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              <h1 className="text-xl font-semibold tracking-tight">
                {s?.title ?? "Live session"}
              </h1>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              {s?.status === "live" ? (
                <Badge className="gap-1">
                  <Radio className="size-3" />
                  Live
                </Badge>
              ) : s?.status === "ended" ? (
                <Badge variant="outline">Ended</Badge>
              ) : s?.status === "scheduled" ? (
                <Badge variant="secondary">Scheduled</Badge>
              ) : null}
              {s?.athleteUserId ? (
                <Link
                  href={`/athletes/${s.athleteUserId}`}
                  className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                >
                  host profile
                </Link>
              ) : null}
              <span className="text-muted-foreground">· {livekitStatus}</span>
            </div>
          </div>
          {isHost && s?.status !== "ended" ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={endSession.isPending}
              onClick={() => {
                if (confirm("End this session for everyone?")) endSession.mutate();
              }}
            >
              <StopCircle className="size-3.5" />
              End session
            </Button>
          ) : null}
        </div>

        <video
          ref={videoRef}
          className="bg-background aspect-video w-full rounded-xl border object-cover"
          autoPlay
          playsInline
          muted
        />
      </div>

      <Card className="flex max-h-[80vh] flex-col overflow-hidden">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 min-h-0 flex-col gap-0 p-0">
          <div
            ref={chatRef}
            className="flex-1 space-y-2 overflow-y-auto p-3 text-sm"
          >
            {lines.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Say hi — your messages are visible to everyone in the room.
              </p>
            ) : null}
            {lines.map((l, i) => {
              const mine = l.userId && meId && l.userId === meId;
              return (
                <div key={i} className={mine ? "text-right" : ""}>
                  <div
                    className={`inline-block max-w-[85%] rounded-lg px-2.5 py-1.5 text-left text-xs ${
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    } ${l.historical ? "opacity-75" : ""}`}
                  >
                    {!mine && l.userId ? (
                      <div className="text-muted-foreground/80 mb-0.5 font-mono text-[10px]">
                        {shortId(l.userId)}
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap break-words">{l.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <form
            className="border-border flex gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const msg = out.trim();
              if (!msg || !wsRef.current || wsRef.current.readyState !== 1) return;
              wsRef.current.send(msg);
              setOut("");
            }}
          >
            <Input
              className="flex-1"
              value={out}
              onChange={(e) => setOut(e.target.value)}
              placeholder="Message…"
              maxLength={500}
            />
            <Button type="submit" size="sm" disabled={!out.trim()}>
              <Send className="size-3.5" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
