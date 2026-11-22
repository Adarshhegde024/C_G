import { useState, useEffect } from "react";
import { Camera, RotateCcw, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

import { captureFrame, useCamera } from "@/hooks/use-camera";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { triggerHaptic } from "@/lib/native";
import { FaceOvalGuide } from "./FaceOvalGuide";

const INSTRUCTIONS = [
  "Center face inside the oval",
  "Background is filtered out",
  "Ensure face is well-lit",
  "Look directly at camera",
];

const REQUIRED_SAMPLES = 5;

interface FaceEnrollmentProps {
  onComplete: (samples: string[]) => void;
  submitting?: boolean;
}

/**
 * Face enrollment widget used during registration. The frontend only collects
 * image samples — biometric processing happens on the backend.
 */
export function FaceEnrollment({ onComplete, submitting }: FaceEnrollmentProps) {
  const { status, error, videoRef, start, stop } = useCamera();
  const [samples, setSamples] = useState<string[]>([]);

  // Automatically request camera access when entering Face Enrollment step
  useEffect(() => {
    start().catch(() => undefined);
  }, [start]);

  async function openCamera() {
    await start();
  }

  function capture() {
    const video = videoRef.current;
    if (!video) {
      toast.error("Camera preview is not active. Please tap 'Open camera'.");
      return;
    }
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      toast.info("Camera is initializing, please hold your face steady and tap again.");
      return;
    }
    try {
      const sample = captureFrame(video, 360);
      const nextSamples = [...samples, sample].slice(0, REQUIRED_SAMPLES);
      setSamples(nextSamples);
      void triggerHaptic("light");

      if (nextSamples.length === REQUIRED_SAMPLES) {
        void triggerHaptic("success");
        toast.success("All 5 face samples captured!");
        setTimeout(() => {
          stop();
          onComplete(nextSamples);
        }, 500);
      }
    } catch (err) {
      toast.error("Could not capture frame. Please ensure your camera is visible.");
    }
  }

  function retake(index: number) {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.info("Camera is initializing, please try again in a moment.");
      return;
    }
    try {
      const sample = captureFrame(video, 360);
      setSamples((current) => current.map((s, i) => (i === index ? sample : s)));
      void triggerHaptic("light");
    } catch {
      toast.error("Could not retake sample.");
    }
  }

  function removeSample(index: number) {
    setSamples((current) => current.filter((_, i) => i !== index));
  }

  function finish() {
    stop();
    onComplete(samples);
  }

  const count = samples.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">Face enrollment</h3>
          <p className="text-sm text-muted-foreground">Capture five face samples for your secure profile.</p>
        </div>
        <Badge variant={count === REQUIRED_SAMPLES ? "success" : "lavender"} aria-live="polite">
          {count}/{REQUIRED_SAMPLES}
        </Badge>
      </div>

      <ul className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        {INSTRUCTIONS.map((instruction) => (
          <li key={instruction} className="rounded-lg bg-secondary px-3 py-2 text-secondary-foreground">
            {instruction}
          </li>
        ))}
      </ul>

      <div className="relative overflow-hidden rounded-xl border border-border bg-vault">
        <div className="flex aspect-[4/3] items-center justify-center">
          <video
            ref={videoRef}
            className={`h-full w-full object-cover ${status === "ready" ? "block" : "hidden"}`}
            playsInline
            muted
            autoPlay
            aria-label="Camera preview"
          />
          {status !== "ready" ? (
            <div className="px-6 text-center text-vault-muted">
              <Video className="mx-auto h-10 w-10 opacity-60" aria-hidden />
              <p className="mt-3 text-sm">
                {status === "starting"
                  ? "Starting camera…"
                  : status === "denied" || status === "error"
                    ? error
                    : "Your camera preview will appear here."}
              </p>
              {status !== "starting" ? (
                <Button variant="outline" className="mt-4 border-white/20 bg-white/10 text-vault-foreground hover:bg-white/20" onClick={openCamera}>
                  <Camera className="h-4 w-4" aria-hidden />
                  Open camera
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {status === "ready" ? (
          <FaceOvalGuide
            status={count === REQUIRED_SAMPLES ? "locked" : "aligning"}
            hint={count === REQUIRED_SAMPLES ? "All 5 samples captured" : "Center face in oval · Background excluded"}
          />
        ) : null}
      </div>

      {count > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your samples</p>
          <div className="flex flex-wrap gap-3">
            {samples.map((sample, index) => (
              <div key={index} className="group relative">
                <img src={sample} alt={`Face sample ${index + 1}`} className="h-20 w-20 rounded-lg border border-border object-cover" />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-vault/70 px-1.5 text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                <div className="absolute inset-x-0 bottom-1 flex justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {status === "ready" ? (
                    <button
                      type="button"
                      aria-label={`Retake sample ${index + 1}`}
                      onClick={() => retake(index)}
                      className="rounded-md bg-vault/80 p-1 text-white hover:bg-vault focus-ring"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Delete sample ${index + 1}`}
                    onClick={() => removeSample(index)}
                    className="rounded-md bg-destructive/90 p-1 text-white hover:bg-destructive focus-ring"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {status === "ready" ? (
          <>
            <Button
              onClick={count >= REQUIRED_SAMPLES ? finish : capture}
              disabled={submitting}
              className={
                count >= REQUIRED_SAMPLES
                  ? "bg-accent text-accent-foreground shadow-md hover:bg-accent/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }
            >
              <Camera className="h-4 w-4 mr-2" aria-hidden />
              {submitting
                ? "Storing enrollment…"
                : count >= REQUIRED_SAMPLES
                  ? "✓ Complete enrollment & continue"
                  : `Capture sample (${count + 1}/${REQUIRED_SAMPLES})`}
            </Button>
            <Button variant="outline" onClick={stop} disabled={submitting}>
              Close camera
            </Button>
          </>
        ) : null}
        <Button
          variant="accent"
          onClick={finish}
          disabled={count < REQUIRED_SAMPLES || submitting}
          className="sm:ml-auto"
        >
          {submitting ? "Storing enrollment…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
