import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } },
  },
  // Only the paired extension may call the API from a browser context.
  async headers() {
    return [{
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: process.env.EXTENSION_ORIGIN ?? 'null' },
        { key: 'Access-Control-Allow-Headers', value: 'authorization, content-type' },
        { key: 'Vary', value: 'Origin' },
      ],
    }];
  },
};

export default nextConfig;
