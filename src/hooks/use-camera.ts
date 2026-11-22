import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

export type CameraStatus = "idle" | "starting" | "ready" | "denied" | "error";

interface UseCameraResult {
  status: CameraStatus;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  getStream: () => MediaStream | null;
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
      // On native mobile (Capacitor Android/iOS), request permissions via native plugin
      if (Capacitor.isNativePlatform()) {
        try {
          const { Camera } = await import("@capacitor/camera");
          await Camera.requestPermissions();
        } catch (capErr) {
          console.warn("Native camera permission request:", capErr);
        }
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API is not supported in this browser or context (requires HTTPS).");
      }

      let stream: MediaStream | null = null;
      let lastErr: unknown = null;

      // Tier 1: Front camera + audio with ideal dimensions
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: audio ? true : false,
        });
      } catch (err1) {
        lastErr = err1;
        // Tier 2: Flexible front camera + audio
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: audio ? true : false,
          });
        } catch (err2) {
          lastErr = err2;
          // Tier 3: Basic video first, then attach audio track if available
          try {
            const vStream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });
            if (audio) {
              try {
                const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                aStream.getAudioTracks().forEach((track) => vStream.addTrack(track));
              } catch (audioErr) {
                console.warn("Audio stream unavailable, proceeding with video-only:", audioErr);
              }
            }
            stream = vStream;
          } catch (err3) {
            lastErr = err3;
          }
        }
      }

      if (!stream) {
        throw lastErr || new Error("Failed to initialize camera or microphone stream.");
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
      return true;
    } catch (err) {
      console.error("Camera acquisition error:", err);
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        setStatus("denied");
        setError("Camera access was blocked. Tap 'Enable camera & microphone' or check app/browser permissions and try again.");
      } else {
        setStatus("error");
        setError("We couldn't start the camera. Please check that a camera is connected and try again.");
      }
      return false;
    }
  }, [audio]);

  const getStream = useCallback(() => streamRef.current, []);

  useEffect(() => () => stop(), [stop]);

  return { status, error, videoRef, stream: streamRef.current, getStream, start, stop };
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
