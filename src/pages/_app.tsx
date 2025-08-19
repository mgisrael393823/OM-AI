import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/toast-provider";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { Inter } from 'next/font/google';

// Load Inter font with next/font for consistent rendering
const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  display: 'swap'
});

// Expose supabase to window for console testing
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}

function AppContent({ Component, pageProps }: { Component: any; pageProps: any }) {
  const { loading } = useAuth();
  
  // Set body data-auth attribute for FOUC prevention (runs before paint)
  useIsomorphicLayoutEffect(() => {
    // Only apply loading state on authenticated pages (app route)
    const isAppPage = window.location.pathname.startsWith('/app');
    if (isAppPage) {
      document.body.setAttribute('data-auth', loading ? 'loading' : 'ready');
    } else {
      document.body.setAttribute('data-auth', 'ready');
    }
  }, [loading]);

  // Watchdog timer to unhide body after timeout
  useEffect(() => {
    const id = setTimeout(() => {
      if (document.body.getAttribute('data-auth') === 'loading') {
        document.body.setAttribute('data-auth', 'ready');
        console.warn('[auth] Watchdog released body visibility after timeout');
      }
    }, 4000);
    return () => clearTimeout(id);
  }, []);

  return <Component {...pageProps} />;
}

export default function App({ Component, pageProps }: AppProps) {
  // Register/unregister service worker based on environment
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {})
      } else {
        // Unregister any SW in development to prevent caching issues
        navigator.serviceWorker.getRegistrations().then(regs => {
          regs.forEach(reg => reg.unregister())
        })
      }
    }
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className={`${inter.variable} font-inter`}>
          <AuthProvider>
            <AppContent Component={Component} pageProps={pageProps} />
          </AuthProvider>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
