import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { withSentryConfig } from "@sentry/nextjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: process.env.NODE_ENV !== 'development',
  transpilePackages: ['pdfjs-dist'],
  
  // Headers for cache busting
  headers: async () => {
    const headers = [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];

    if (process.env.NODE_ENV === 'development') {
      return [
        ...headers,
        {
          source: '/(.*)',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-cache, no-store, must-revalidate',
            },
            {
              key: 'Pragma',
              value: 'no-cache',
            },
            {
              key: 'Expires',
              value: '0',
            },
            {
              key: 'Access-Control-Allow-Origin',
              value: '*',
            },
            {
              key: 'Access-Control-Allow-Headers',
              value: 'Content-Type, Authorization',
            },
          ],
        },
        // Aggressive cache busting for auth routes
        {
          source: '/auth/(.*)',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-cache, no-store, must-revalidate, max-age=0',
            },
            {
              key: 'Pragma',
              value: 'no-cache',
            },
            {
              key: 'Expires',
              value: '0',
            },
            {
              key: 'Vary',
              value: '*',
            },
          ],
        },
        // Auth API routes cache busting
        {
          source: '/api/auth/(.*)',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-cache, no-store, must-revalidate, max-age=0',
            },
            {
              key: 'Pragma',
              value: 'no-cache',
            },
            {
              key: 'Expires',
              value: '0',
            },
            {
              key: 'Vary',
              value: '*',
            },
          ],
        },
        {
          source: '/_next/static/(.*)',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-cache, no-store, must-revalidate',
            },
            {
              key: 'Access-Control-Allow-Origin',
              value: '*',
            },
            {
              key: 'Access-Control-Allow-Headers',
              value: 'Content-Type',
            },
          ],
        },
      ];
    }
    return headers;
  },
  
  // Optimize build performance
  experimental: {
    // Disable Turbopack in development for better HMR stability
    // turbo: {},
  },
  // Canvas external package removed - text-only PDF processing
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  allowedDevOrigins: ['*.daytona.work'],
  
  // Configure webpack for better caching
  webpack: (config, { dev, isServer }) => {
    // Configure caching - less aggressive in development for better HMR
    if (dev) {
      // Development: Use memory cache for faster HMR
      config.cache = {
        type: 'memory',
        maxGenerations: 1,
      };
    } else {
      // Production: Use filesystem cache
      config.cache = {
        type: 'filesystem',
        allowCollectingMemory: false,
        buildDependencies: {
          config: [__filename],
        },
      };
    }
    
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
    
    // Development optimizations for better HMR
    if (dev) {
      // Faster rebuilds and better HMR boundaries
      config.optimization.removeAvailableModules = false;
      config.optimization.removeEmptyChunks = false;
      config.optimization.splitChunks = false;
      
      // Source maps handled by Sentry webpack plugin
    }
    
    return config;
  },
  
  // Development server optimizations
  ...(process.env.NODE_ENV === 'development' && {
    onDemandEntries: {
      // Period (in ms) where the server will keep pages in the buffer
      maxInactiveAge: 25 * 1000,
      // Number of pages that should be kept simultaneously without being disposed
      pagesBufferLength: 2,
    },
  }),
};

// Only use Sentry in production to avoid development issues
let finalConfig;
if (process.env.NODE_ENV === 'production') {
  finalConfig = withSentryConfig(
    nextConfig,
    {
      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options

      // Suppresses source map uploading logs during build
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    },
    {
      // For all available options, see:
      // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

      // Upload a larger set of source maps for prettier stack traces (increases build time)
      widenClientFileUpload: true,

      // Transpiles SDK to be compatible with IE11 (increases bundle size)
      transpileClientSDK: true,

      // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      // This can increase your server load as well as your hosting bill.
      // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
      // side errors will fail.
      // tunnelRoute: "/monitoring",

      // Hides source maps from generated client bundles
      hideSourceMaps: true,

      // Automatically tree-shake Sentry logger statements to reduce bundle size
      disableLogger: true,

      // Enables automatic instrumentation of Vercel Cron Monitors.
      // See the following for more information:
      // https://docs.sentry.io/product/crons/
      // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
      automaticVercelMonitors: true,
    }
  );
} else {
  finalConfig = nextConfig;
}

export default finalConfig;
