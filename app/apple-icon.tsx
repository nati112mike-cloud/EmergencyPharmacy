import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so no border-radius here (unlike icon.tsx).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1d4ed8",
        }}
      >
        <svg viewBox="0 0 24 24" width="112" height="112" fill="white">
          <path d="M10.5 2h3a1 1 0 0 1 1 1v6.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-6.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-6.5H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6.5V3a1 1 0 0 1 1-1Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
