import React from "react";

interface FaceOvalGuideProps {
  status?: "aligning" | "locked" | "recording";
  hint?: string;
  className?: string;
}

export function FaceOvalGuide({
  status = "aligning",
  hint = "Keep face inside oval · Background is filtered",
  className = "",
}: FaceOvalGuideProps) {
  const isRecording = status === "recording";
  const isLocked = status === "locked";

  const strokeColor = isRecording
    ? "#f43f5e"
    : isLocked
    ? "#10b981"
    : "#a78bfa";

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {/* SVG Vignette Mask to dim background outside the face oval */}
      <svg className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <mask id="face-oval-cutout">
            {/* White reveals everything */}
            <rect width="100%" height="100%" fill="white" />
            {/* Black cuts out the face oval */}
            <ellipse cx="50%" cy="48%" rx="28%" ry="38%" fill="black" />
          </mask>
        </defs>

        {/* Semi-transparent dark overlay covering background */}
        <rect
          width="100%" height="100%"
          fill="rgba(8, 10, 20, 0.65)"
          mask="url(#face-oval-cutout)"
        />

        {/* Dynamic Oval Border */}
        <ellipse
          cx="50%"
          cy="48%"
          rx="28%"
          ry="38%"
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeDasharray={isRecording ? "none" : "8 6"}
          className={isRecording ? "animate-pulse" : "transition-colors duration-300"}
        />
      </svg>

      {/* Subtle Biometric Crosshair Tick Marks */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-[76%] w-[56%]">
          {/* Top bracket */}
          <div
            className="absolute -top-2 left-1/2 h-3 w-6 -translate-x-1/2 border-t-2"
            style={{ borderColor: strokeColor }}
          />
          {/* Bottom bracket */}
          <div
            className="absolute -bottom-2 left-1/2 h-3 w-6 -translate-x-1/2 border-b-2"
            style={{ borderColor: strokeColor }}
          />
          {/* Left bracket */}
          <div
            className="absolute -left-2 top-1/2 h-6 w-3 -translate-y-1/2 border-l-2"
            style={{ borderColor: strokeColor }}
          />
          {/* Right bracket */}
          <div
            className="absolute -right-2 top-1/2 h-6 w-3 -translate-y-1/2 border-r-2"
            style={{ borderColor: strokeColor }}
          />
        </div>
      </div>

      {/* Alignment Guidance Pill */}
      {hint ? (
        <div className="absolute bottom-4 inset-x-0 flex justify-center">
          <span className="rounded-full bg-vault/80 backdrop-blur-sm px-3 py-1 text-[11px] font-medium tracking-wide text-vault-foreground shadow-sm border border-white/10">
            {hint}
          </span>
        </div>
      ) : null}
    </div>
  );
}
