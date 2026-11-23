import { useId } from "react";

export function BrandLogo({
  size = 34,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const bgId = `syt-bg-${uid}`;
  const glowId = `syt-glow-${uid}`;
  const strokeId = `syt-rim-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={bgId} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="52%" stopColor="#172554" />
          <stop offset="100%" stopColor="#0B1120" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11 8) rotate(48) scale(24)">
          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#2563EB" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={strokeId} x1="6" y1="1" x2="30" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.52" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* Deep precision squircle tile */}
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.5" fill={`url(#${bgId})`} />
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.5" fill={`url(#${glowId})`} />
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.5" stroke={`url(#${strokeId})`} strokeWidth="1.2" />

      {/* Geometric Academic Crest + Precision Compass */}
      {/* Upper diamond / mortarboard roof */}
      <path
        d="M18 8.5L28 13.7L18 18.9L8 13.7L18 8.5Z"
        fill="#FFFFFF"
      />
      {/* Architectural rising book / academy shield underneath */}
      <path
        d="M11.6 17.6V22.4C11.6 24.4 14.5 26.2 18 26.2C21.5 26.2 24.4 24.4 24.4 22.4V17.6L18 20.9L11.6 17.6Z"
        fill="#93C5FD"
        fillOpacity="0.92"
      />
      {/* Precision screening tassel / pointer dot */}
      <path
        d="M26.8 14.8V21.2"
        stroke="#60A5FA"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="26.8" cy="22.4" r="1.45" fill="#FFFFFF" />
    </svg>
  );
}
