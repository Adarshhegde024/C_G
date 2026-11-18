import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Camera, Mail, Scan, ShieldCheck } from "lucide-react";

import { fetchProfile, reEnrollFace, updateProfile, type ProfileDetails } from "@/api/profile";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageLoader, Skeleton } from "@/components/ui/skeleton";
import { FaceEnrollment } from "@/components/checkin/FaceEnrollment";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { dateStyle: "long" });
}

/** Shared profile view used by the owner, recipient and nominee areas. */
export function ProfileView() {
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dirty, setDirty] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [isReEnrolling, setIsReEnrolling] = useState(false);

  const query = useQuery<ProfileDetails, ApiError>({ queryKey: ["profile"], queryFn: fetchProfile });

  useEffect(() => {
    if (query.data) {
      setFullName(query.data.full_name);
      setPhone(query.data.phone);
      setDirty(false);
    }
  }, [query.data]);

  const mutation = useMutation<ProfileDetails, ApiError, { full_name?: string; phone?: string }>({
    mutationFn: (patch) => updateProfile(patch),
    onSuccess: async (updated) => {
      toast.success("Profile updated.");
      queryClient.setQueryData(["profile"], updated);
      await refresh();
      setDirty(false);
    },
    onError: (err) => toast.error(err.message),
  });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{query.error.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  const data = query.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Only the fields the backend permits can be edited.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ full_name: fullName.trim(), phone: phone.trim() });
            }}
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" value={fullName} onChange={(e) => { setFullName(e.target.value); setDirty(true); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setDirty(true); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="email" value={data.email} readOnly disabled className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="dob" value={formatDate(data.date_of_birth)} readOnly disabled className="pl-9" />
              </div>
            </div>
            <Button type="submit" variant="accent" disabled={!dirty || mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Member since</span>
              <span className="font-medium">{formatDate(data.created_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Account status</span>
              <StatusBadge status={data.account_status} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan className="h-4.5 w-4.5 text-lavender" aria-hidden />
              Biometric Profile
            </CardTitle>
            <CardDescription>
              Facial recognition baseline for single-owner check-in verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={data.has_face_enrolled ? "success" : "warning"}>
                {data.has_face_enrolled ? "Enrolled & Active" : "Action Recommended"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Background walls and ambient room features are filtered out. Only the enrolled face matching this profile can check in.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => setEnrollOpen(true)}
            >
              <Camera className="mr-2 h-3.5 w-3.5" />
              {data.has_face_enrolled ? "Update Facial Baseline" : "Enroll Face Profile"}
            </Button>
          </CardContent>
        </Card>

        <Card className="vault-gradient border-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-vault-foreground">
              <ShieldCheck className="h-4.5 w-4.5 text-lavender" aria-hidden />
              Security status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-vault-muted">
              Your identity, documents and verification state are protected server-side. CloudGuard
              never stores passwords or biometric data in your browser.
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent
          title="Update Facial Biometric Baseline"
          description="Capture 5 facial samples. Background walls and furniture will be filtered out."
          className="max-w-xl"
        >
          <FaceEnrollment
            submitting={isReEnrolling}
            onComplete={async (samples) => {
              setIsReEnrolling(true);
              try {
                await reEnrollFace(samples);
                toast.success("Facial biometric profile successfully updated.");
                queryClient.invalidateQueries({ queryKey: ["profile"] });
                setEnrollOpen(false);
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : "Failed to update face baseline.");
              } finally {
                setIsReEnrolling(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
