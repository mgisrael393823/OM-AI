import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

// Expose supabase to window for console testing
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
