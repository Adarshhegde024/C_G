import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

import { fetchNotifications, markNotificationsRead } from "@/api/notifications";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/skeleton";
import type { AppNotification } from "@/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false));

  useEffect(() => {
    if (!open || notifications) return;
    let cancelled = false;
    fetchNotifications()
      .then((items) => {
        if (!cancelled) setNotifications(items);
      })
      .catch(() => {
        if (!cancelled) setError("Notifications are unavailable right now.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, notifications]);

  const unread = notifications?.filter((n) => !n.read).length ?? 0;

  async function handleMarkRead() {
    try {
      await markNotificationsRead();
      setNotifications((current) => current?.map((n) => ({ ...n, read: true })) ?? null);
    } catch {
      // Non-critical — leave state as-is.
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell className="h-4.5 w-4.5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-lavender px-1 text-[10px] font-bold text-lavender-foreground">
            {unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 ? (
              <button onClick={handleMarkRead} className="text-xs font-medium text-lavender hover:underline focus-ring rounded-sm">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {error ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{error}</p>
            ) : notifications === null ? (
              <div className="flex justify-center px-4 py-6">
                <Spinner className="text-lavender" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="border-b border-border/70 px-4 py-3 last:border-b-0 hover:bg-accent/60"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{notification.title}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(notification.created_at)}</span>
                  </div>
                  {notification.body ? <p className="mt-0.5 text-xs text-muted-foreground">{notification.body}</p> : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
