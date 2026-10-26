import { useState } from "react";
import { Camera, RotateCcw, Trash2, Video } from "lucide-react";

import { captureFrame, useCamera } from "@/hooks/use-camera";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const INSTRUCTIONS = [
  "Look directly at the camera",
  "Keep your face clearly visible",
  "Use good lighting",
  "Remove anything covering your face",
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

  async function openCamera() {
    await start();
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    setSamples((current) => [...current, captureFrame(video, 480)].slice(0, REQUIRED_SAMPLES));
  }

  function retake(index: number) {
    const video = videoRef.current;
    if (!video) return;
    setSamples((current) => current.map((sample, i) => (i === index ? captureFrame(video, 480) : sample)));
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
          {status === "ready" ? (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
              aria-label="Camera preview"
            />
          ) : (
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
          )}
        </div>
        {status === "ready" ? (
          <div className="pointer-events-none absolute inset-8 rounded-[50%] border-2 border-dashed border-lavender/60" aria-hidden />
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
            <Button onClick={capture} disabled={count >= REQUIRED_SAMPLES}>
              <Camera className="h-4 w-4" aria-hidden />
              Capture
            </Button>
            <Button variant="outline" onClick={stop}>
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
          {submitting ? "Creating account…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
