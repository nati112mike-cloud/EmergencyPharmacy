/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse pulls in pdfjs-dist, which breaks when webpack tries to bundle
  // it for route handlers — run it via native Node `require` instead.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
  },
};

export default nextConfig;
