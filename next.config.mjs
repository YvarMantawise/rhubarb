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
  webpack: (config, { isServer }) => {
    // Prevent Three.js from trying to resolve the node `canvas` package
    config.externals = [...(config.externals ?? []), { canvas: 'canvas' }]
    // rhubarb uses dynamic import('module') + createRequire — must not be bundled
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'rhubarb-lip-sync-wasm']
    }
    return config
  },
}

export default nextConfig