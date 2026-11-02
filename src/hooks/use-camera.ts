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
 * Robust wrapper around getUserMedia for camera previews.
 * Handles React DOM mount timing, stream synchronization, and hardware fallbacks.
 */
export function useCamera(options: { audio?: boolean } = {}): UseCameraResult {
  const { audio = false } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Synchronize active media stream with video element whenever ref mounts or status changes
  useEffect(() => {
    if (status === "ready" && videoRef.current && streamRef.current) {
      const video = videoRef.current;
      if (video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current;
      }
      video.play().catch((err) => {
        console.warn("Camera video play interrupted:", err);
      });
    }
  });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) {
      if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
      return true;
    }

    setStatus("starting");
    setError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio,
        });
      } catch (firstErr) {
        if (firstErr instanceof DOMException && (firstErr.name === "NotAllowedError" || firstErr.name === "SecurityError")) {
          throw firstErr;
        }
        // Fallback to basic video constraint if camera doesn't support specific resolution or facingMode
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio,
        });
      }

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
