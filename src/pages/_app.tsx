import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fontVariables } from "@/lib/fonts";
import { FontDebug } from "@/components/debug/FontDebug";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/toast-provider";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useLayoutEffect } from "react";

// Expose supabase to window for console testing
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}

function AppContent({ Component, pageProps }: { Component: any; pageProps: any }) {
  const { loading } = useAuth();
  
  // Set body data-auth attribute for FOUC prevention (runs before paint)
  useLayoutEffect(() => {
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
  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => console.log('Service Worker registered:', registration.scope))
        .catch(error => console.error('Service Worker registration failed:', error));
    }
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <main className={fontVariables}>
          <AuthProvider>
            <AppContent Component={Component} pageProps={pageProps} />
            {process.env.NODE_ENV === 'development' && <FontDebug />}
          </AuthProvider>
        </main>
      </ToastProvider>
    </ErrorBoundary>
  );
}
