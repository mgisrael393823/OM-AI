/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true, // Use SWC for faster compilation
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  allowedDevOrigins: ['*.daytona.work'],
  
  // Optimize build performance
  experimental: {
    turbo: {
      // Enable Turbopack for faster builds in development
    },
  },
  
  // Configure webpack for better caching
  webpack: (config, { dev, isServer }) => {
    // Enable persistent caching
    config.cache = {
      type: 'filesystem',
      allowCollectingMemory: false,
      buildDependencies: {
        config: [__filename],
      },
    };
    
    // Optimize bundle splitting
    if (!dev && !isServer) {
      config.optimization.splitChunks.chunks = 'all';
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        pdf: {
          name: 'pdf-libs',
          test: /[\\/]node_modules[\\/](pdfjs-dist|pdfreader)[\\/]/,
          chunks: 'all',
          priority: 30,
        },
        tesseract: {
          name: 'tesseract',
          test: /[\\/]node_modules[\\/]tesseract\.js[\\/]/,
          chunks: 'async', // Lazy-loaded
          priority: 25,
        },
      };
    }
    
    return config;
  },
};

export default nextConfig;
