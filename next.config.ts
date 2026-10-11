import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: 'tsconfig.build.json',
  },
  serverExternalPackages: ['tesseract.js'],
  async headers() {
    return [
      {
        source: '/ocr/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
