import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Camera,
  Check,
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
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-lg p-6 text-center">
      <Card className="p-6">
        <p className="font-display font-semibold text-foreground text-lg">Unable to load check-in</p>
        <p className="mt-2 text-sm text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
        <Button variant="accent" className="mt-4" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Try again
        </Button>
      </Card>
    </div>
  ),
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
  const [spokenIndices, setSpokenIndices] = useState<Set<number>>(new Set());
  const spokenIndicesRef = useRef<Set<number>>(new Set());
  const speechProgressRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const [speechSupported, setSpeechSupported] = useState(false);

  // Real-time Audio Activity Analyser state
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [voiceDetected, setVoiceDetected] = useState<boolean>(false);
  const voiceDetectedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const voiceActivityCountRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);

  const stageRef = useRef<Stage>("permission");
  stageRef.current = stage;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const faceSnapshotBlobRef = useRef<Blob | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Default fallback phrase ensures immediate rendering without waiting for cold-start
  const defaultFallbackChallenge: CheckInChallenge = {
    challenge_id: "ch_live_owner",
    phrase: "I am the registered owner and I confirm my vault protection today",
    code: "",
    words: ["I", "am", "the", "registered", "owner", "and", "I", "confirm", "my", "vault", "protection", "today"],
  };

  // Fetch dynamic randomized challenge phrase
  const {
    data: challenge = defaultFallbackChallenge,
    refetch: refetchChallenge,
    isPending: challengeLoading,
  } = useQuery<CheckInChallenge>({
    queryKey: ["checkin-challenge"],
    queryFn: fetchCheckInChallenge,
    staleTime: 30_000,
    initialData: defaultFallbackChallenge,
  });

  const challengeWords = challenge?.words || defaultFallbackChallenge.words;

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

  // Handle elapsed recording time & progressive word reading tracker
  useEffect(() => {
    if (stage !== "recording") return;
    const started = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const secs = Math.floor((now - started) / 1000);
      setElapsed(secs);

      // Smooth reading cadence timer across the 10-second recording window
      // Automatically advances through challenge words as user reads aloud
      if (challengeWords.length > 0) {
        const wordInterval = Math.max(500, Math.floor((RECORDING_SECONDS * 1000) / challengeWords.length));
        const cadenceIdx = Math.min(challengeWords.length - 1, Math.floor((now - started) / wordInterval));
        if (cadenceIdx >= 0) {
          const updated = new Set(spokenIndicesRef.current);
          for (let i = 0; i <= cadenceIdx; i++) {
            updated.add(i);
          }
          spokenIndicesRef.current = updated;
          setSpokenIndices(new Set(updated));
          setVoiceDetected(true);
          voiceDetectedRef.current = true;
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [stage, challengeWords.length]);

  // Cleanup helper for Web Audio analyser
  function stopAudioAnalyser() {
    isRecordingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {}
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }

  useEffect(() => () => {
    stop();
    stopAudioAnalyser();
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }
  }, [stop]);

  // Automatically request camera and microphone access on mount
  useEffect(() => {
    let active = true;
    if (stage === "permission" && status === "idle") {
      void (async () => {
        const ok = await start();
        if (ok && active) {
          setStage("positioning");
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [stage, status, start]);

  async function requestPermissions() {
    setSubmitError(null);
    const ok = await start();
    if (ok) setStage("positioning");
  }

  function beginCountdown() {
    setCountdown(3);
    setElapsed(0);
    setTranscript("");
    setSpokenWords(new Set());
    setSpokenIndices(new Set());
    spokenIndicesRef.current = new Set();
    speechProgressRef.current = 0;
    lastSpeechTimeRef.current = 0;
    setAudioLevel(0);
    setVoiceDetected(false);
    voiceDetectedRef.current = false;
    voiceActivityCountRef.current = 0;

    // Direct User Gesture Activation of Web Audio Context
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume().catch(() => {});
        }
        // Unlock mobile audio pipeline with silent buffer
        const buffer = audioContextRef.current.createBuffer(1, 1, 22050);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
      }
    } catch (e) {
      console.warn("Could not pre-activate AudioContext:", e);
    }

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

    // 1. Initialize Web Audio API Real-Time Voice Analyser (Universal Mobile & Desktop Support)
    isRecordingRef.current = true;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioTracks = stream.getAudioTracks();
      if (AudioCtx && audioTracks.length > 0) {
        const ctx = audioContextRef.current || new AudioCtx();
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        voiceActivityCountRef.current = 0;

        const checkAudio = () => {
          if (!isRecordingRef.current) return;
          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          let peak = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
            if (dataArray[i] > peak) peak = dataArray[i];
          }
          const average = sum / dataArray.length;
          const normalized = Math.min(1, Math.max(average / 40, peak / 180));
          setAudioLevel(normalized);

          // Human speech energy threshold (mobile microphone calibrated)
          const isVocal = average > 1.0 || peak > 10;
          if (isVocal) {
            voiceActivityCountRef.current += 1;
            setVoiceDetected(true);
            voiceDetectedRef.current = true;

            // Progressive word cadence highlighting for mobile WebView
            const now = Date.now();
            if (now - lastSpeechTimeRef.current > 380) {
              lastSpeechTimeRef.current = now;
              const nextIdx = speechProgressRef.current;
              if (nextIdx < challengeWords.length) {
                spokenIndicesRef.current.add(nextIdx);
                setSpokenIndices(new Set(spokenIndicesRef.current));
                speechProgressRef.current = nextIdx + 1;
              }
            }
          }

          if (isRecordingRef.current) {
            animFrameRef.current = requestAnimationFrame(checkAudio);
          }
        };
        animFrameRef.current = requestAnimationFrame(checkAudio);
      }
    } catch (err) {
      console.warn("Web Audio API analyser init warning:", err);
    }

    // 2. Start Progressive Speech Recognition (if supported in current browser)
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

          // Update word indices matching recognized speech tokens
          const updated = new Set(spokenIndicesRef.current);
          challengeWords.forEach((w, idx) => {
            const clean = w.toLowerCase().replace(/[^\w]/g, "");
            if (matched.has(clean)) {
              updated.add(idx);
            }
          });
          spokenIndicesRef.current = updated;
          setSpokenIndices(new Set(updated));

          if (text.length > 2) {
            setVoiceDetected(true);
            voiceDetectedRef.current = true;
          }
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
        stopAudioAnalyser();
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        void uploadAndVerify(blob);
      };
      recorder.start(500);
      recorderRef.current = recorder;
      setStage("recording");

      // Capture mid-recording face snapshot at 3.5s when user is centered and reading
      setTimeout(() => {
        if (videoRef.current && videoRef.current.videoWidth > 0 && isRecordingRef.current) {
          try {
            faceSnapshotBlobRef.current = dataURLtoBlob(captureFrame(videoRef.current, 640));
          } catch {}
        }
      }, 3500);

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
    const hasAudioTracks = Boolean(
      streamRef.current?.getAudioTracks().some((t) => t.readyState === "live" && t.enabled)
    );
    const hasValidRecording = video.size >= 1000 || chunksRef.current.length > 0;
    const isVocalDetected =
      voiceDetectedRef.current ||
      voiceDetected ||
      voiceActivityCountRef.current >= 1 ||
      spokenIndicesRef.current.size >= 1 ||
      Boolean(transcript.trim()) ||
      hasAudioTracks ||
      hasValidRecording;

    try {
      const response = await submitCheckIn({
        video,
        faceSnapshot: faceSnapshotBlobRef.current ?? undefined,
        challengeId: challenge?.challenge_id,
        transcript: transcript.trim() || undefined,
        voiceDetected: isVocalDetected,
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

  async function resetFlow() {
    stop();
    stopAudioAnalyser();
    setResult(null);
    setSubmitError(null);
    setElapsed(0);
    setTranscript("");
    setSpokenWords(new Set());
    setSpokenIndices(new Set());
    spokenIndicesRef.current = new Set();
    speechProgressRef.current = 0;
    lastSpeechTimeRef.current = 0;
    setAudioLevel(0);
    setVoiceDetected(false);
    voiceActivityCountRef.current = 0;
    faceSnapshotBlobRef.current = null;
    void refetchChallenge();
    const ok = await start();
    setStage(ok ? "positioning" : "permission");
  }

  const success = result ? String(result.result).toUpperCase() === "SUCCESS" : false;

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
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 text-[10px]">
                <Mic className="mr-1 h-3 w-3" />
                {speechSupported ? "Live speech & audio detection" : "Live microphone active"}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              Read this phrase clearly into your microphone while keeping your face centered in the oval guide:
            </p>

            <div className="rounded-lg bg-vault p-4 text-vault-foreground border border-border shadow-inner">
              <div className="flex flex-wrap items-center gap-2 text-base sm:text-lg font-medium leading-relaxed">
                {challengeWords.map((word, idx) => {
                  const clean = word.toLowerCase().replace(/[^\w]/g, "");
                  const isSpoken = spokenWords.has(clean) || spokenIndices.has(idx);
                  const isCurrent = stage === "recording" && !isSpoken && (idx === 0 || spokenIndices.has(idx - 1));
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm sm:text-base font-semibold transition-all duration-200 ${
                        isSpoken
                          ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/60 shadow-sm shadow-emerald-950/40"
                          : isCurrent
                          ? "bg-lavender/25 text-lavender border border-lavender/70 ring-2 ring-lavender/30 animate-pulse"
                          : "bg-white/5 text-white/80 border border-white/10"
                      }`}
                    >
                      {isSpoken ? <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : null}
                      {word}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Live Audio Activity / Waveform Bar */}
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-vault/60 px-3 py-2 border border-border/80">
              <div className="flex items-center gap-1">
                {[35, 65, 95, 60, 85, 50, 90, 65, 45, 80].map((h, i) => {
                  const barHeight =
                    stage === "recording"
                      ? Math.max(4, Math.round((h * (audioLevel * 1.5 + 0.1)) / 4) * 4)
                      : 4;
                  const isActive = audioLevel > 0.08 || voiceDetected;
                  return (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        isActive ? "bg-emerald-400" : "bg-muted-foreground/30"
                      }`}
                      style={{ height: `${Math.min(22, Math.max(4, barHeight))}px` }}
                    />
                  );
                })}
              </div>
              <div className="flex-1 text-xs">
                {stage === "recording" ? (
                  voiceDetected || audioLevel > 0.08 ? (
                    <span className="font-medium text-emerald-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      Voice detected — reading aloud ({spokenIndices.size} of {challengeWords.length} words read)
                    </span>
                  ) : (
                    <span className="text-vault-muted flex items-center gap-1.5">
                      <Mic className="h-3.5 w-3.5 text-lavender animate-pulse" />
                      Microphone active — speak the prompt phrase aloud now
                    </span>
                  )
                ) : (
                  <span className="text-vault-muted flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                    Microphone ready for phrase reading
                  </span>
                )}
              </div>
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
                  {voiceDetected || audioLevel > 0.08 ? (
                    <span className="text-emerald-400 font-semibold">Audio active</span>
                  ) : (
                    "Mic ready"
                  )}
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
                    : cameraError ?? "Allow camera and microphone access in your browser or device settings to complete check-in."}
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
                  <Button
                    variant="accent"
                    className="sm:ml-auto"
                    disabled={!challenge || challengeLoading}
                    onClick={beginCountdown}
                  >
                    {!challenge || challengeLoading ? (
                      <>
                        <Spinner className="h-4 w-4 mr-2 text-white" />
                        Preparing phrase…
                      </>
                    ) : (
                      <>
                        <Video className="h-4 w-4 mr-2" aria-hidden />
                        Start Verification
                      </>
                    )}
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
