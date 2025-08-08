import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fontVariables } from "@/lib/fonts";
import { FontDebug } from "@/components/debug/FontDebug";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/toast-provider";
import { useEffect } from "react";

// Expose supabase to window for console testing
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
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
            <Component {...pageProps} />
            {process.env.NODE_ENV === 'development' && <FontDebug />}
          </AuthProvider>
        </main>
      </ToastProvider>
    </ErrorBoundary>
  );
}
