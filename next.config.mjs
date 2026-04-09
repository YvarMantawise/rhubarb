/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Tell Next.js to load rhubarb-lip-sync-wasm natively (ESM-only package)
  serverExternalPackages: ['rhubarb-lip-sync-wasm'],
  // Include rhubarb's WASM/data assets in the Vercel deployment bundle
  outputFileTracingIncludes: {
    '/api/lipsync': ['./node_modules/rhubarb-lip-sync-wasm/dist/**/*'],
  },
  webpack: (config) => {
    // Prevent Three.js from trying to resolve the node `canvas` package
    config.externals = [...(config.externals ?? []), { canvas: 'canvas' }]
    return config
  },
}

export default nextConfig