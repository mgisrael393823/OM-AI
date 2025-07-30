import React from "react"
import Head from "next/head"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { HeroSection } from "@/components/homepage/HeroSection"
import { HowItWorksSection } from "@/components/homepage/HowItWorksSection"
import { FeaturesGrid } from "@/components/homepage/FeaturesGrid"
import { componentTypography, typography } from "@/lib/typography"
import { CheckCircle } from "lucide-react"

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>OM Intel Chat - AI-Powered Commercial Real Estate Analysis</title>
        <meta name="description" content="Transform your CRE deal analysis with AI. Upload offering memorandums and get instant insights, key metrics, and investment analysis through conversational AI." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {/* Navigation */}
        <nav className="border-b bg-white/80 backdrop-blur-md dark:bg-slate-900/80 sticky top-0 z-50">
          <div className="container mx-auto grid grid-cols-[auto_1fr_auto] h-16 items-center px-4">
            <Logo size="md" />
            <div></div> {/* Spacer column */}
            <div className="grid grid-cols-2 items-center gap-4">
              <Link href="/auth/login" className={`text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ${componentTypography.button.link}`}>
                Sign In
              </Link>
              <Link href="/auth/register" className={`bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors ${componentTypography.button.primary}`}>
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <HeroSection />

        {/* How It Works Section */}
        <HowItWorksSection />
        
        {/* Features Section */}
        <FeaturesGrid />

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <div className="grid grid-cols-1 gap-4 justify-items-center">
                <h2 className={`tracking-tight text-slate-900 dark:text-white ${typography.sectionHeader}`}>
                  Ready to transform your deal analysis?
                </h2>
                <p className={`text-slate-600 dark:text-slate-300 ${typography.bodyLarge}`}>
                  Join thousands of real estate professionals using AI to make smarter investment decisions.
                </p>
                <Link href="/auth/register" className={`bg-primary text-primary-foreground px-8 py-3 rounded-lg hover:bg-primary/90 transition-colors grid grid-cols-[auto_auto] items-center gap-2 ${componentTypography.button.primary}`}>
                  <span>Start Your Free Trial</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t bg-white/80 backdrop-blur-md dark:bg-slate-900/80">
          <div className="container mx-auto py-12 px-4">
            <div className="text-center">
              <div className="grid grid-cols-1 justify-items-center gap-4">
                <Logo size="sm" />
                <p className={`text-slate-600 dark:text-slate-400 ${typography.bodySmall}`}>
                  AI-powered commercial real estate analysis platform.
                </p>
                <div className={`text-slate-600 dark:text-slate-400 ${typography.bodySmall}`}>
                  © 2024 OM Intel Chat. All rights reserved.
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}