import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fontVariables } from "@/lib/fonts";
import { FontDebug } from "@/components/debug/FontDebug";

// Expose supabase to window for console testing
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={fontVariables}>
      <AuthProvider>
        <Component {...pageProps} />
        {process.env.NODE_ENV === 'development' && <FontDebug />}
      </AuthProvider>
    </main>
  );
}
