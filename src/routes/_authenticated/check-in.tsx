import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Fingerprint,
  Mic,
  RotateCcw,
  Scan,
  ShieldAlert,
  Sparkles,
  Video,
  Volume2,
  XCircle,
} from "lucide-react";

import { fetchCheckInChallenge, submitCheckIn, type CheckInChallenge } from "@/api/checkins";
import { ApiError } from "@/api/client";
import { captureFrame, useCamera } from "@/hooks/use-camera";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/skeleton";
import { triggerHaptic } from "@/lib/native";
import { FaceOvalGuide } from "@/components/checkin/FaceOvalGuide";

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

const RECORDING_SECONDS = 10;

type Stage = "permission" | "positioning" | "countdown" | "recording" | "verifying" | "result";

interface CheckInResult {
  result: string;
  reason?: string | null;
  message?: string | null;
}

const VERIFICATION_STEPS = [
  { icon: Scan, label: "Face biometric recognition" },
  { icon: Volume2, label: "Dynamic spoken phrase match" },
  { icon: Fingerprint, label: "Liveness & motion analysis" },
];

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export function CheckInPage() {
  const queryClient = useQueryClient();
  const { status, error: cameraError, videoRef, start, stop } = useCamera({ audio: true });

  const [stage, setStage] = useState<Stage>("permission");
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Spoken challenge state
  const [transcript, setTranscript] = useState("");
  const [spokenWords, setSpokenWords] = useState<Set<string>>(new Set());
  const [speechSupported, setSpeechSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const faceSnapshotBlobRef = useRef<Blob | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Fetch dynamic randomized challenge phrase
  const {
    data: challenge,
    refetch: refetchChallenge,
    isPending: challengeLoading,
  } = useQuery<CheckInChallenge>({
    queryKey: ["checkin-challenge"],
    queryFn: fetchCheckInChallenge,
    staleTime: 60_000,
  });

  // Check Web Speech API support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSpeech = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
      setSpeechSupported(hasSpeech);
    }
  }, []);

  // Synchronize stream reference
  useEffect(() => {
    if (videoRef.current?.srcObject instanceof MediaStream) {
      streamRef.current = videoRef.current.srcObject;
    }
  }, [status, videoRef]);

  // Handle countdown
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

  // Handle elapsed recording time
  useEffect(() => {
    if (stage !== "recording") return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => () => {
    stop();
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }
  }, [stop]);

  async function requestPermissions() {
    const ok = await start();
    if (ok) setStage("positioning");
  }

  function beginCountdown() {
    setCountdown(3);
    setElapsed(0);
    setTranscript("");
    setSpokenWords(new Set());
    setStage("countdown");
  }

  function beginRecording() {
    const stream = streamRef.current ?? (videoRef.current?.srcObject as MediaStream | null) ?? null;
    const video = videoRef.current;
    if (!stream || !video) {
      setSubmitError("The camera stream was lost. Please start again.");
      setStage("permission");
      return;
    }

    // Capture high-resolution face snapshot at start of recording
    try {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const snapDataUrl = captureFrame(video, 640);
        faceSnapshotBlobRef.current = dataURLtoBlob(snapDataUrl);
      }
    } catch (e) {
      console.warn("Could not capture initial face snapshot:", e);
    }

    // Start live Speech Recognition if supported in user's browser
    const SpeechConstructor =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (SpeechConstructor) {
      try {
        const recognition = new SpeechConstructor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let full = "";
          for (let i = 0; i < event.results.length; ++i) {
            full += event.results[i][0].transcript + " ";
          }
          const text = full.trim();
          setTranscript(text);

          const matched = new Set(
            text
              .toLowerCase()
              .replace(/[^\w\s]/g, " ")
              .split(/\s+/)
              .filter(Boolean)
          );
          setSpokenWords(matched);
        };

        recognition.onerror = (e: any) => {
          console.warn("Speech recognition error:", e);
        };

        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch (err) {
        console.warn("Failed to initialize speech recognition:", err);
      }
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
        // Also capture snapshot at end if first was missed
        if (!faceSnapshotBlobRef.current && videoRef.current && videoRef.current.videoWidth > 0) {
          try {
            faceSnapshotBlobRef.current = dataURLtoBlob(captureFrame(videoRef.current, 640));
          } catch {}
        }
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        void uploadAndVerify(blob);
      };
      recorder.start(500);
      recorderRef.current = recorder;
      setStage("recording");

      // Auto-stop after intended duration
      setTimeout(() => {
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch {}
        }
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
      const response = await submitCheckIn({
        video,
        faceSnapshot: faceSnapshotBlobRef.current ?? undefined,
        challengeId: challenge?.challenge_id,
        transcript: transcript.trim() || undefined,
      });

      setResult(response);
      setStage("result");

      if (String(response.result).toUpperCase() === "SUCCESS") {
        void triggerHaptic("success");
        toast.success("Check-in verified successfully.");
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["checkins"] });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      } else {
        void triggerHaptic("error");
        toast.error("Check-in verification rejected.");
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } catch (err) {
      void triggerHaptic("error");
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "CloudGuard is temporarily unable to reach the verification server. Please try again."
      );
      setStage("result");
      setResult({ result: "FAILED", reason: null });
    }
  }

  function resetFlow() {
    stop();
    setResult(null);
    setSubmitError(null);
    setElapsed(0);
    setTranscript("");
    setSpokenWords(new Set());
    faceSnapshotBlobRef.current = null;
    void refetchChallenge();
    setStage("positioning");
  }

  const success = result ? String(result.result).toUpperCase() === "SUCCESS" : false;
  const challengeWords = challenge?.words || [];

  return (
    <>
      <PageHeader
        title="Live check-in"
        description="Verify your biometric presence to confirm your safety and keep your vault active."
      />

      <div className="mx-auto max-w-2xl space-y-4">
        {/* Dynamic Spoken Phrase Challenge Card */}
        {stage !== "result" ? (
          <div className="rounded-xl border border-lavender/30 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-lavender">
                <Volume2 className="h-4 w-4 animate-pulse text-lavender" />
                Spoken Phrase Challenge
              </span>
              {speechSupported ? (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 text-[10px]">
                  <Mic className="mr-1 h-3 w-3" /> Live speech detection active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  Microphone audio active
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              Read this phrase clearly into your microphone while keeping your face centered in the oval guide:
            </p>

            <div className="rounded-lg bg-vault p-3 text-vault-foreground border border-border">
              {challengeLoading ? (
                <div className="flex items-center gap-2 text-sm text-vault-muted">
                  <Spinner className="h-4 w-4 text-lavender" />
                  Generating unique challenge phrase…
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 text-base sm:text-lg font-medium leading-relaxed">
                  {challengeWords.map((word, idx) => {
                    const clean = word.toLowerCase().replace(/[^\w]/g, "");
                    const isSpoken = spokenWords.has(clean);
                    return (
                      <span
                        key={idx}
                        className={`rounded px-1.5 py-0.5 transition-all duration-200 ${
                          isSpoken
                            ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/60 font-semibold"
                            : "bg-white/5 text-white/90 border border-white/10"
                        }`}
                      >
                        {word}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {transcript ? (
              <p className="mt-2 text-[11px] text-muted-foreground truncate">
                <span className="font-semibold text-foreground">Detected speech:</span> “{transcript}”
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Viewfinder Card */}
        <Card className="overflow-hidden">
          <div className="relative aspect-[4/3] bg-vault">
            <video
              ref={videoRef}
              className={`h-full w-full object-cover ${
                stage !== "result" && status === "ready" ? "block" : "hidden"
              }`}
              playsInline
              muted
              autoPlay
              aria-label="Camera preview"
            />

            {/* Face Oval Guide Overlay (Filters background & centers face) */}
            {stage !== "result" && status === "ready" && stage !== "permission" ? (
              <>
                <FaceOvalGuide
                  status={stage === "recording" ? "recording" : stage === "countdown" ? "locked" : "aligning"}
                  hint={
                    stage === "recording"
                      ? "Hold still · Read the phrase aloud"
                      : "Center face in oval · Background wall is ignored"
                  }
                />

                {/* Status Badges */}
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-vault/80 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-vault-foreground border border-white/10">
                  {stage === "recording" ? (
                    <>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />
                      REC {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                      {String(elapsed % 60).padStart(2, "0")} / 00:
                      {String(RECORDING_SECONDS).padStart(2, "0")}
                    </>
                  ) : (
                    <>
                      <Camera className="h-3.5 w-3.5" aria-hidden />
                      Face guide ready
                    </>
                  )}
                </div>

                <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-vault/80 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-vault-foreground border border-white/10">
                  <Mic className="h-3.5 w-3.5 text-lavender" aria-hidden />
                  Mic ready
                </div>
              </>
            ) : null}

            {/* Countdown Overlay */}
            {stage === "countdown" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-vault/50 backdrop-blur-xs" aria-live="assertive">
                <p className="font-display text-8xl font-bold text-white drop-shadow-xl animate-scale-in">
                  {countdown}
                </p>
              </div>
            ) : null}

            {/* Verifying Spinner Overlay */}
            {stage === "verifying" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-vault/90 p-6 text-center">
                <Spinner className="h-10 w-10 text-lavender" />
                <div>
                  <p className="font-display text-base font-semibold text-vault-foreground">
                    Verifying Check-In Authenticity…
                  </p>
                  <p className="text-xs text-vault-muted mt-1">
                    Matching facial baseline, dynamic speech phrase, and organic liveness.
                  </p>
                </div>
                <ul className="space-y-2 mt-2">
                  {VERIFICATION_STEPS.map((step) => (
                    <li key={step.label} className="flex items-center gap-2 text-xs text-vault-muted">
                      <step.icon className="h-4 w-4 text-lavender/80" aria-hidden />
                      {step.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Result Overlay */}
            {stage === "result" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-vault/95">
                {success ? (
                  <CheckCircle2 className="h-16 w-16 text-success animate-in zoom-in-75 duration-300" aria-hidden />
                ) : (
                  <XCircle className="h-16 w-16 text-destructive animate-in zoom-in-75 duration-300" aria-hidden />
                )}
                <p className="font-display text-2xl font-bold text-vault-foreground" aria-live="assertive">
                  {success ? "CHECK-IN VERIFIED" : "VERIFICATION REJECTED"}
                </p>
                <p className="max-w-md text-sm text-vault-muted leading-relaxed">
                  {submitError ??
                    result?.reason ??
                    result?.message ??
                    (success
                      ? "Owner identity and presence confirmed. Your vault remains active and your next deadline has been extended."
                      : "Verification failed. The face presented did not match the registered owner, or the challenge phrase was not detected.")}
                </p>
              </div>
            ) : null}

            {/* Camera Permission State */}
            {(stage === "permission" || (stage !== "result" && status !== "ready")) && stage !== "verifying" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-vault-muted">
                <Video className="h-10 w-10 opacity-60" aria-hidden />
                <p className="text-sm">
                  {status === "starting"
                    ? "Requesting camera and microphone access…"
                    : cameraError ?? "Allow camera and microphone access to complete your check-in."}
                </p>
                {status !== "starting" ? (
                  <Button
                    variant="outline"
                    className="border-white/20 bg-white/10 text-vault-foreground hover:bg-white/20"
                    onClick={() => void requestPermissions()}
                  >
                    <Camera className="h-4 w-4 mr-2" aria-hidden />
                    Enable camera & microphone
                  </Button>
                ) : (
                  <Spinner className="text-lavender" />
                )}
              </div>
            ) : null}
          </div>

          <CardContent className="space-y-4 pt-4">
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
                      className={`h-2 w-2 rounded-full ${
                        done ? "bg-success" : active ? "bg-lavender" : "bg-muted-foreground/30"
                      }`}
                      aria-hidden
                    />
                    <span className={active ? "font-semibold text-foreground" : undefined}>{label}</span>
                  </li>
                );
              })}
            </ol>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {stage === "positioning" ? (
                <>
                  <Badge variant="lavender" className="py-1">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Center face within oval & prepare to speak
                  </Badge>
                  <Button variant="accent" className="sm:ml-auto" onClick={beginCountdown}>
                    <Video className="h-4 w-4 mr-2" aria-hidden />
                    Start Verification
                  </Button>
                </>
              ) : null}

              {stage === "recording" ? (
                <Badge variant="warning" className="py-1 animate-pulse">
                  <Mic className="mr-1.5 h-3.5 w-3.5" />
                  Recording live: Read the prompt sentence aloud now!
                </Badge>
              ) : null}

              {stage === "result" ? (
                <>
                  <Button variant="accent" onClick={resetFlow}>
                    <RotateCcw className="h-4 w-4 mr-2" aria-hidden />
                    Try again
                  </Button>
                  <Link to="/history" className="text-sm font-semibold text-lavender hover:underline ml-2">
                    View check-in history
                  </Link>
                </>
              ) : null}
            </div>

            {!success && stage === "result" && !submitError ? (
              <div className="flex items-start gap-2.5 rounded-lg bg-secondary/80 p-3 text-xs text-secondary-foreground border border-border">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <p>
                  Single-owner security enforcement: Check-in is only approved when the face matches the registered account owner and the dynamic phrase is spoken aloud. Other individuals attempting to check in will be blocked.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default CheckInPage;
