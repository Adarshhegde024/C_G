import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Fingerprint,
  Mic,
  Scan,
  ShieldAlert,
  Video,
  Volume2,
  XCircle,
} from "lucide-react";

import { submitCheckIn } from "@/api/checkins";
import { ApiError } from "@/api/client";
import { useCamera } from "@/hooks/use-camera";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/check-in")({
  head: () => ({
    meta: [
      { title: "Live check-in · CloudGuard" },
      { name: "description", content: "Complete a verified check-in to keep your CloudGuard vault active." },
      { property: "og:title", content: "Live check-in · CloudGuard" },
      { property: "og:description", content: "Complete a verified check-in to keep your CloudGuard vault active." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckInPage,
});

const RECORDING_SECONDS = 12;

type Stage = "permission" | "positioning" | "countdown" | "recording" | "verifying" | "result";

interface CheckInResult {
  result: string;
  reason?: string | null;
  message?: string | null;
}

const VERIFICATION_STEPS = [
  { icon: Scan, label: "Face verification" },
  { icon: Fingerprint, label: "Liveness detection" },
  { icon: Volume2, label: "Spoken phrase verification" },
];

function CheckInPage() {
  const queryClient = useQueryClient();
  const { status, error: cameraError, videoRef, start, stop } = useCamera({ audio: true });
  const [stage, setStage] = useState<Stage>("permission");
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep a reference to the live stream so we can stop tracks after recording.
  useEffect(() => {
    if (videoRef.current?.srcObject instanceof MediaStream) {
      streamRef.current = videoRef.current.srcObject;
    }
  }, [status, videoRef]);

  useEffect(() => {
    if (stage !== "countdown") return;
    if (countdown <= 0) {
      beginRecording();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, countdown]);

  useEffect(() => {
    if (stage !== "recording") return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => () => stop(), [stop]);

  async function requestPermissions() {
    const ok = await start();
    if (ok) setStage("positioning");
  }

  function beginCountdown() {
    setCountdown(3);
    setElapsed(0);
    setStage("countdown");
  }

  function beginRecording() {
    const stream = streamRef.current ?? (videoRef.current?.srcObject as MediaStream | null) ?? null;
    if (!stream) {
      setSubmitError("The camera stream was lost. Please start again.");
      setStage("permission");
      return;
    }
    chunksRef.current = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        void uploadAndVerify(blob);
      };
      recorder.start(500);
      recorderRef.current = recorder;
      setStage("recording");
      // Stop recording after the intended duration.
      setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, RECORDING_SECONDS * 1000);
    } catch {
      setSubmitError("Recording isn't supported in this browser. Please try a recent version of Chrome, Edge or Firefox.");
      setStage("permission");
    }
  }

  async function uploadAndVerify(video: Blob) {
    setStage("verifying");
    try {
      const response = await submitCheckIn(video);
      setResult(response);
      setStage("result");
      if (String(response.result).toUpperCase() === "SUCCESS") {
        toast.success("Check-in successful.");
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["checkins"] });
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "CloudGuard is temporarily unable to reach the server. Please try again.");
      setStage("result");
      setResult({ result: "FAILED", reason: null });
    }
  }

  function resetFlow() {
    stop();
    setResult(null);
    setSubmitError(null);
    setElapsed(0);
    setStage("permission");
  }

  const success = result ? String(result.result).toUpperCase() === "SUCCESS" : false;

  return (
    <>
      <PageHeader
        title="Live check-in"
        description="Complete this verification to keep your vault active."
      />

      <Card className="mx-auto max-w-2xl overflow-hidden">
        <div className="relative aspect-[4/3] bg-vault">
          <video ref={videoRef} className={`h-full w-full object-cover ${stage !== "result" && status === "ready" ? "block" : "hidden"}`} playsInline muted autoPlay aria-label="Camera preview" />

          {/* Camera frame overlay */}
          {stage !== "result" && status === "ready" && stage !== "permission" ? (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="absolute inset-10 rounded-2xl border-2 border-dashed border-lavender/70" />
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-vault/70 px-3 py-1.5 text-xs font-medium text-vault-foreground">
                {stage === "recording" ? (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />
                    REC {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")} / 00:{String(RECORDING_SECONDS).padStart(2, "0")}
                  </>
                ) : (
                  <>
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                    Camera ready
                  </>
                )}
              </div>
              <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-vault/70 px-3 py-1.5 text-xs font-medium text-vault-foreground">
                <Mic className="h-3.5 w-3.5" aria-hidden />
                Microphone {streamRef.current?.getAudioTracks().length ? "ready" : "requested"}
              </div>
            </div>
          ) : null}

          {stage === "countdown" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-vault/40" aria-live="assertive">
              <p className="font-display text-8xl font-bold text-white drop-shadow-lg">{countdown}</p>
            </div>
          ) : null}

          {stage === "verifying" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-vault/80 text-center">
              <Spinner className="h-8 w-8 text-lavender" />
              <p className="text-sm text-vault-foreground">Verifying your check-in…</p>
              <ul className="space-y-2">
                {VERIFICATION_STEPS.map((step) => (
                  <li key={step.label} className="flex items-center gap-2 text-xs text-vault-muted">
                    <step.icon className="h-3.5 w-3.5" aria-hidden />
                    {step.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {stage === "result" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              {success ? (
                <CheckCircle2 className="h-16 w-16 text-success" aria-hidden />
              ) : (
                <XCircle className="h-16 w-16 text-destructive" aria-hidden />
              )}
              <p className="font-display text-xl font-semibold text-vault-foreground" aria-live="assertive">
                {success ? "CHECK-IN SUCCESSFUL" : "CHECK-IN FAILED"}
              </p>
              <p className="max-w-sm text-sm text-vault-muted">
                {submitError ??
                  result?.reason ??
                  result?.message ??
                  (success ? "Your vault remains active. Your next deadline has been updated." : "Please try again in a well-lit, quiet space.")}
              </p>
            </div>
          ) : null}

          {(stage === "permission" || (stage !== "result" && status !== "ready")) && stage !== "verifying" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-vault-muted">
              <Video className="h-10 w-10 opacity-60" aria-hidden />
              <p className="text-sm">{status === "starting" ? "Requesting camera and microphone…" : cameraError ?? "Allow camera and microphone access to begin."}</p>
              {status !== "starting" ? (
                <Button variant="outline" className="border-white/20 bg-white/10 text-vault-foreground hover:bg-white/20" onClick={() => void requestPermissions()}>
                  <Camera className="h-4 w-4" aria-hidden />
                  Enable camera & microphone
                </Button>
              ) : (
                <Spinner className="text-lavender" />
              )}
            </div>
          ) : null}
        </div>

        <CardContent className="space-y-4">
          {/* Progress steps */}
          <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Check-in progress">
            {["Permission", "Positioning", "Recording", "Verification", "Result"].map((label, index) => {
              const order: Stage[] = ["permission", "positioning", "recording", "verifying", "result"];
              const currentIndex = order.indexOf(stage === "countdown" ? "recording" : stage);
              const done = index < currentIndex;
              const active = index === currentIndex;
              return (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${done ? "bg-success" : active ? "bg-lavender" : "bg-muted-foreground/30"}`}
                    aria-hidden
                  />
                  <span className={active ? "font-semibold text-foreground" : undefined}>{label}</span>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            {stage === "positioning" ? (
              <>
                <Badge variant="lavender">Face the frame and keep your face clearly visible</Badge>
                <Button variant="accent" className="sm:ml-auto" onClick={beginCountdown}>
                  <Video className="h-4 w-4" aria-hidden />
                  Ready to begin
                </Button>
              </>
            ) : null}
            {stage === "recording" ? (
              <Badge variant="warning">Recording — hold still and speak the spoken phrase clearly.</Badge>
            ) : null}
            {stage === "result" ? (
              <>
                <Button variant="accent" onClick={resetFlow}>
                  Try again
                </Button>
                <Link to="/history" className="text-sm font-semibold text-lavender hover:underline">
                  View check-in history
                </Link>
              </>
            ) : null}
          </div>

          {!success && stage === "result" && !submitError ? (
            <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              A failed check-in never changes your account on its own — the backend decides any status changes.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
