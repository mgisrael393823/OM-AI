import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { withSentryConfig } from "@sentry/nextjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

export default withSentryConfig(
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
