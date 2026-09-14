import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Same mark used inline in the login page and NavBar (a blue circle with a
// plus/cross), rendered as a real PNG so it can back both the favicon and
// the PWA manifest icons.
export default function Icon() {
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
          borderRadius: 96,
        }}
      >
        <svg viewBox="0 0 24 24" width="320" height="320" fill="white">
          <path d="M10.5 2h3a1 1 0 0 1 1 1v6.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-6.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-6.5H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6.5V3a1 1 0 0 1 1-1Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
