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
    // Note: Use 'next dev --turbo' to enable Turbopack in development
    // Removed turbopack config option to prevent webpack hot-update.json 404s
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
      
      // Reduce logging noise and improve HMR performance
      config.infrastructureLogging = { level: 'error' };
      config.watchOptions = {
        poll: false,
        ignored: /node_modules/,
        aggregateTimeout: 300, // Delay before rebuilding after first change
      };
      
      // Source maps handled by Sentry webpack plugin
    }
    
    // Canvas package gating when disabled
    if (process.env.USE_CANVAS !== 'true') {
      // Server builds: Add to externals
      if (isServer) {
        const canvasExternals = {
          'canvas': 'commonjs canvas',
          '@napi-rs/canvas': 'commonjs @napi-rs/canvas'
        };
        
        if (typeof config.externals === 'function') {
          const originalExternals = config.externals;
          config.externals = async (context, request) => {
            if (canvasExternals[request]) return canvasExternals[request];
            return await originalExternals(context, request);
          };
        } else {
          config.externals = [...(config.externals || []), canvasExternals];
        }
      }
      
      // Client builds: Alias to false
      if (!isServer) {
        config.resolve.alias = {
          ...config.resolve.alias,
          'canvas': false,
          '@napi-rs/canvas': false
        };
      }
    }
    
    // Always add path2d-polyfill alias for both client and server
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      'path2d-polyfill': 'path2d'
    };
    
    return config;
  },
  
  // Development server optimizations
  ...(process.env.NODE_ENV === 'development' && {
    onDemandEntries: {
      // Period (in ms) where the server will keep pages in the buffer
      maxInactiveAge: 60 * 1000, // Increased from 25s to 60s for better HMR stability
      // Number of pages that should be kept simultaneously without being disposed
      pagesBufferLength: 5, // Increased from 2 to 5 for better page buffering
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
