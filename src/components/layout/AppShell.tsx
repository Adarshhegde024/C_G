import { useState, type ReactNode } from "react";
import { Link, useRouter, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  FolderLock,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  User,
  UserCheck,
  Users,
  Briefcase,
  X,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { ROLE_LABELS } from "@/auth/roles";
import { Logo } from "@/components/layout/Logo";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
  icon: typeof LayoutDashboard;
}

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  owner: [
    { to: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { to: "/documents", label: "Documents", shortLabel: "Vault", icon: FolderLock },
    { to: "/check-in", label: "Check-in", shortLabel: "Check-in", icon: Camera },
    { to: "/nominee", label: "Nominee", shortLabel: "Nominee", icon: UserCheck },
    { to: "/recipients", label: "Recipients", shortLabel: "Recipients", icon: Users },
    { to: "/history", label: "History", shortLabel: "History", icon: History },
    { to: "/profile", label: "Profile", shortLabel: "Profile", icon: User },
    { to: "/settings", label: "Settings", shortLabel: "Settings", icon: Settings },
  ],
  recipient: [
    { to: "/recipient/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { to: "/recipient/documents", label: "Documents", shortLabel: "Vault", icon: FolderLock },
    { to: "/recipient/history", label: "History", shortLabel: "History", icon: History },
    { to: "/recipient/profile", label: "Profile", shortLabel: "Profile", icon: User },
  ],
  nominee: [
    { to: "/nominee/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { to: "/nominee/case", label: "Verification case", shortLabel: "Case", icon: Briefcase },
    { to: "/nominee/history", label: "History", shortLabel: "History", icon: History },
    { to: "/nominee/profile", label: "Profile", shortLabel: "Profile", icon: User },
  ],
  reviewer: [
    { to: "/reviewer/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
    { to: "/reviewer/cases", label: "Cases", shortLabel: "Cases", icon: Briefcase },
  ],
};

// 4 primary items for mobile bottom bar per role
const PRIMARY_MOBILE_ITEMS: Record<Role, string[]> = {
  owner: ["/dashboard", "/documents", "/check-in", "/nominee"],
  recipient: ["/recipient/dashboard", "/recipient/documents", "/recipient/history", "/recipient/profile"],
  nominee: ["/nominee/dashboard", "/nominee/case", "/nominee/history", "/nominee/profile"],
  reviewer: ["/reviewer/dashboard", "/reviewer/cases"],
};

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: (() => void) | undefined }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-vault-muted transition-colors hover:bg-white/8 hover:text-vault-foreground focus-ring data-[status=active]:bg-white/10 data-[status=active]:text-vault-foreground"
        >
          <item.icon className="h-4.5 w-4.5 shrink-0 opacity-80" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const navigate = useNavigate();
  if (!user) return null;
  const items = NAV_BY_ROLE[user.role] ?? [];

  async function handleSignOut() {
    await router.options.context.queryClient.cancelQueries();
    router.options.context.queryClient.clear();
    await logout();
    await navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-6">
        <Logo variant="light" />
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-vault-muted/70">
          {ROLE_LABELS[user.role]}
        </p>
        <NavLinks items={items} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender/20 text-sm font-semibold text-lavender">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-vault-foreground">{user.name}</p>
            <p className="truncate text-xs text-vault-muted">{user.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            className="text-vault-muted hover:bg-white/10 hover:text-vault-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Tablet slim rail (768px - 1024px)
function TabletRail({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const items = NAV_BY_ROLE[user.role] ?? [];

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center border-r border-white/10 vault-gradient py-5 md:flex lg:hidden">
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-lavender/20 text-lavender font-bold text-lg">
        CG
      </div>
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            title={item.label}
            className="group flex h-11 w-11 items-center justify-center rounded-xl text-vault-muted transition-colors hover:bg-white/10 hover:text-vault-foreground focus-ring data-[status=active]:bg-white/15 data-[status=active]:text-vault-foreground"
          >
            <item.icon className="h-5 w-5" aria-hidden />
          </Link>
        ))}
      </div>
      <div className="mt-auto flex flex-col items-center gap-3 pt-4 border-t border-white/10">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open full menu"
          onClick={onOpenMenu}
          className="h-10 w-10 text-vault-muted hover:bg-white/10 hover:text-vault-foreground"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lavender/20 text-xs font-semibold text-lavender">
          {user.name.charAt(0).toUpperCase()}
        </div>
      </div>
    </aside>
  );
}

// Mobile bottom navigation bar (< 768px)
function MobileBottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const allItems = NAV_BY_ROLE[user.role] ?? [];
  const primaryKeys = PRIMARY_MOBILE_ITEMS[user.role] ?? [];
  const primaryItems = allItems.filter((i) => primaryKeys.includes(i.to));
  const hasMore = allItems.length > primaryItems.length;

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-background/95 px-2 pt-1 pb-safe backdrop-blur md:hidden shadow-lg"
    >
      {primaryItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="group flex flex-1 flex-col items-center justify-center py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-primary"
        >
          <item.icon className="h-5 w-5 transition-transform group-hover:scale-105 data-[status=active]:text-primary" />
          <span className="mt-1 truncate">{item.shortLabel ?? item.label}</span>
        </Link>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onOpenMore}
          className="group flex flex-1 flex-col items-center justify-center py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <MoreHorizontal className="h-5 w-5 transition-transform group-hover:scale-105" />
          <span className="mt-1 truncate">More</span>
        </button>
      )}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar (> 1024px) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 vault-gradient lg:block">
        <SidebarBody />
      </aside>

      {/* Tablet slim rail (768px - 1024px) */}
      <TabletRail onOpenMenu={() => setMenuOpen(true)} />

      {/* Mobile top bar (< 768px) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 pt-safe backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="h-9 w-9"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </header>

      {/* Slide-out drawer (Mobile & Tablet) */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-vault/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 vault-gradient shadow-2xl pt-safe pb-safe">
            <button
              aria-label="Close menu"
              className="absolute right-3 top-5 rounded-md p-1.5 text-vault-muted hover:bg-white/10 hover:text-vault-foreground focus-ring"
              onClick={() => setMenuOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <SidebarBody onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Desktop top-right actions */}
      <div className="fixed right-6 top-5 z-20 hidden items-center gap-2 lg:flex">
        <NotificationBell />
      </div>

      {/* Responsive Main Viewport:
          - Mobile (<768px): extra bottom padding (pb-24) to avoid bottom nav overlap
          - Tablet (768-1024px): left margin ml-20 for tablet rail
          - Desktop (>1024px): left margin ml-64 for full sidebar
      */}
      <main className="px-4 py-6 pb-24 md:ml-20 md:px-8 md:py-8 md:pb-8 lg:ml-64 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <MobileBottomNav onOpenMore={() => setMenuOpen(true)} />

      {/* Desktop Footer */}
      <footer className="hidden border-t border-border px-8 py-4 text-xs text-muted-foreground lg:block lg:ml-64">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
          Secured by CloudGuard — your data stays encrypted and under your control.
        </div>
      </footer>
    </div>
  );
}
