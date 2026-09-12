/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained build output (server + only the deps it actually needs) —
  // keeps the Docker image lean; irrelevant to the Vercel deploy path.
  output: "standalone",
  // pdf-parse pulls in pdfjs-dist, which breaks when webpack tries to bundle
  // it for route handlers — run it via native Node `require` instead.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
  },
};

export default nextConfig;
