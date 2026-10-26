import { useState } from "react";
import { Link, useRouter, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  FolderLock,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
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
  icon: typeof LayoutDashboard;
}

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  owner: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/documents", label: "Documents", icon: FolderLock },
    { to: "/recipients", label: "Recipients", icon: Users },
    { to: "/nominee", label: "Nominee", icon: UserCheck },
    { to: "/check-in", label: "Check-in", icon: Camera },
    { to: "/history", label: "History", icon: History },
    { to: "/profile", label: "Profile", icon: User },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  recipient: [
    { to: "/recipient/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/recipient/documents", label: "Documents", icon: FolderLock },
    { to: "/recipient/history", label: "History", icon: History },
    { to: "/recipient/profile", label: "Profile", icon: User },
  ],
  nominee: [
    { to: "/nominee/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/nominee/case", label: "Verification case", icon: Briefcase },
    { to: "/nominee/history", label: "History", icon: History },
    { to: "/nominee/profile", label: "Profile", icon: User },
  ],
  reviewer: [
    { to: "/reviewer/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/reviewer/cases", label: "Cases", icon: Briefcase },
  ],
};

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  const items = user ? NAV_BY_ROLE[user.role] ?? [] : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 vault-gradient lg:block">
        <SidebarBody />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-vault/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 vault-gradient shadow-2xl">
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

      <main className="px-4 py-6 lg:ml-64 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      <footer className="hidden border-t border-border px-8 py-4 text-xs text-muted-foreground lg:block lg:ml-64">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
          Secured by CloudGuard — your data stays encrypted and under your control.
        </div>
      </footer>
    </div>
  );
}
