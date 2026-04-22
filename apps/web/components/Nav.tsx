"use client";

import { ConnectButton } from "@mysten/dapp-kit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Download, Home, Radio, Sparkles, Users } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { useUnreadCount } from "@/hooks/use-notifications";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/lib/store";

function NavLink({
  href,
  children,
  icon: Icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
        "gap-1.5",
      )}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

export function Nav() {
  const token = useSessionStore((s) => s.token);
  const me = useMe();
  const unread = useUnreadCount();
  const install = useInstallPrompt();

  const isAthlete = me.data?.role === "athlete" || me.data?.role === "admin";
  const isAdmin = me.data?.role === "admin";

  return (
    <header className="bg-background/80 border-border supports-backdrop-filter:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <Link
          href="/"
          className="text-foreground flex items-center gap-2 font-semibold tracking-tight hover:opacity-90"
        >
          <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-lg text-xs font-bold">
            SS
          </span>
          <span className="hidden sm:inline">Sui Sports</span>
        </Link>

        <nav className="flex flex-1 flex-wrap items-center justify-end gap-1">
          <NavLink href="/athletes" icon={Users}>
            Athletes
          </NavLink>
          <NavLink href="/feed" icon={Home}>
            Feed
          </NavLink>
          <NavLink href="/live" icon={Radio}>
            Live
          </NavLink>
          {token ? (
            <NavLink href="/athlete" icon={Sparkles}>
              {isAthlete ? "Creator" : "Start creating"}
            </NavLink>
          ) : null}
          {isAdmin ? <NavLink href="/admin">Admin</NavLink> : null}

          {install.canInstall ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                void install.prompt();
              }}
              title="Install Sui Sports"
            >
              <Download className="size-3.5" />
              <span className="hidden md:inline">Install</span>
            </Button>
          ) : null}

          {token ? (
            <Link
              href="/notifications"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "relative gap-1",
              )}
              title="Notifications"
            >
              <Bell className="size-4" />
              {unread.data && unread.data > 0 ? (
                <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background">
                  {unread.data > 9 ? "9+" : unread.data}
                </span>
              ) : null}
            </Link>
          ) : null}

          {token && me.data ? (
            <Badge
              variant="outline"
              className="hidden capitalize sm:inline-flex"
              title={`Signed in as ${me.data.role}`}
            >
              {me.data.role}
            </Badge>
          ) : null}
          <ConnectButton />
        </nav>
      </div>
    </header>
  );
}
