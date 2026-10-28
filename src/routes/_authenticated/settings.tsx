import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCircle2, LogOut, Timer } from "lucide-react";

import { fetchProfile, updateSecuritySettings } from "@/api/profile";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { PageLoader, Skeleton } from "@/components/ui/skeleton";
import type { DurationValue } from "@/types";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · CloudGuard" },
      { name: "description", content: "Manage your CloudGuard security, check-in and notification settings." },
      { property: "og:title", content: "Settings · CloudGuard" },
      { property: "og:description", content: "Manage your CloudGuard security, check-in and notification settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const UNITS: DurationValue["unit"][] = ["seconds", "minutes", "hours", "days"];
const UNIT_LABEL: Record<DurationValue["unit"], string> = {
  seconds: "Seconds",
  minutes: "Minutes",
  hours: "Hours",
  days: "Days",
};

function DurationEditor({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: DurationValue;
  onChange: (value: DurationValue) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex max-w-xs gap-2">
        <Input
          type="number"
          min={1}
          aria-label={`${label} value`}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: Math.max(1, Number(e.target.value) || 1) })}
          className="w-24"
        />
        <Select aria-label={`${label} unit`} value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as DurationValue["unit"] })}>
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_LABEL[unit]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-ring ${checked ? "bg-lavender" : "bg-muted-foreground/30"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
          aria-hidden
        />
      </button>
    </div>
  );
}

const PREFS_KEY = "cloudguard.notification-prefs";

function readPrefs(): { checkInReminders: boolean; securityAlerts: boolean; releases: boolean } {
  try {
    return { checkInReminders: true, securityAlerts: true, releases: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { checkInReminders: true, securityAlerts: true, releases: true };
  }
}

function SettingsPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [frequency, setFrequency] = useState<DurationValue>({ value: 30, unit: "days" });
  const [grace, setGrace] = useState<DurationValue>({ value: 72, unit: "hours" });
  const [prefs, setPrefs] = useState(readPrefs);

  const query = useQuery<{ check_in_frequency?: DurationValue; grace_period?: DurationValue }, ApiError>({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  useEffect(() => {
    const data = query.data;
    if (data?.check_in_frequency) setFrequency(data.check_in_frequency);
    if (data?.grace_period) setGrace(data.grace_period);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => updateSecuritySettings({ check_in_frequency: frequency, grace_period: grace }),
    onSuccess: () => {
      toast.success("Security settings updated.");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  function updatePref(key: keyof typeof prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // Preferences are a display convenience; backend notifications always arrive.
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Tune how CloudGuard protects your vault." />

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-4.5 w-4.5 text-lavender" aria-hidden />
                Check-in settings
              </CardTitle>
              <CardDescription>
                Shorter intervals can be useful while testing; longer intervals are suitable for real
                deployment. Choose the values that fit you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <DurationEditor
                label="Check-in frequency"
                description="How often you complete a verified check-in to keep your vault active."
                value={frequency}
                onChange={setFrequency}
              />
              <DurationEditor
                label="Grace period"
                description="How long you can still check in after a missed deadline."
                value={grace}
                onChange={setGrace}
              />
              <Button variant="accent" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Saving…" : "Save settings"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4.5 w-4.5 text-lavender" aria-hidden />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Notifications are generated by the backend — these preferences control how this
                  device presents them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <NotificationToggle
                  label="Check-in reminders"
                  description="Reminders as your check-in deadline approaches."
                  checked={prefs.checkInReminders}
                  onChange={(v) => updatePref("checkInReminders", v)}
                />
                <NotificationToggle
                  label="Security alerts"
                  description="Grace period changes and verification eligibility updates."
                  checked={prefs.securityAlerts}
                  onChange={(v) => updatePref("securityAlerts", v)}
                />
                <NotificationToggle
                  label="Release activity"
                  description="Updates when document releases are approved."
                  checked={prefs.releases}
                  onChange={(v) => updatePref("releases", v)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Signed in as {user?.email}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                  Session secured
                </span>
                <Button
                  variant="outline"
                  className="sm:ml-auto"
                  onClick={async () => {
                    await queryClient.cancelQueries();
                    queryClient.clear();
                    await logout();
                    window.location.assign("/login");
                  }}
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      <Skeleton className="sr-only" />
    </>
  );
}
