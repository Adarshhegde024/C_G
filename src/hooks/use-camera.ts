import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "starting" | "ready" | "denied" | "error";

interface UseCameraResult {
  status: CameraStatus;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<boolean>;
  stop: () => void;
}

/**
 * Thin wrapper around getUserMedia for camera previews. Audio is requested
 * together with video so the check-in flow can record both.
 */
export function useCamera(options: { audio?: boolean } = {}): UseCameraResult {
  const { audio = false } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return true;
    setStatus("starting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
      return true;
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        setStatus("denied");
        setError("Camera access was blocked. Allow camera access in your browser settings and try again.");
      } else {
        setStatus("error");
        setError("We couldn't start the camera. Please check that a camera is connected and try again.");
      }
      return false;
    }
  }, [audio]);

  useEffect(() => () => stop(), [stop]);

  return { status, error, videoRef, start, stop };
}

/** Capture the current video frame as a JPEG data URL. */
export function captureFrame(video: HTMLVideoElement, width = 640): string {
  const aspect = video.videoHeight && video.videoWidth ? video.videoHeight / video.videoWidth : 0.75;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width * aspect);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
