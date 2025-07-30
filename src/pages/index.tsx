import React from "react"
import Head from "next/head"
import Link from "next/link"
import { componentTypography, typography } from "@/lib/typography"

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
            <div className="grid grid-cols-[auto_auto] items-center gap-2">
              <div className="h-8 w-8 bg-blue-600 rounded grid grid-cols-1 justify-items-center items-center">
                <span className="text-white font-bold text-sm">OM</span>
              </div>
              <span className={`text-slate-900 dark:text-white ${typography.pageTitle}`}>OM Intel Chat</span>
            </div>
            <div></div> {/* Spacer column */}
            <div className="grid grid-cols-2 items-center gap-4">
              <Link href="/auth/login" className={`text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ${componentTypography.button.link}`}>
                Sign In
              </Link>
              <Link href="/auth/register" className={`bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors ${componentTypography.button.primary}`}>
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="py-20 lg:py-32">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-4xl text-center">
              <div className="grid grid-cols-1 justify-items-center gap-4">
                <div className={`grid grid-cols-[auto_auto] items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full ${typography.caption}`}>
                  <span>⚡</span>
                  <span>AI-Powered Analysis</span>
                </div>
                <h1 className={`text-4xl tracking-tight text-slate-900 dark:text-white sm:text-6xl lg:text-7xl ${typography.pageTitle}`}>
                  Transform Your{" "}
                  <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    CRE Deal Analysis
                  </span>
                </h1>
                <p className={`leading-8 text-slate-600 dark:text-slate-300 max-w-2xl ${typography.bodyLarge}`}>
                  Upload offering memorandums and get instant insights, key metrics, and investment analysis 
                  through conversational AI. Make smarter real estate decisions faster.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
                  <Link href="/auth/register" className={`bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors grid grid-cols-[auto_auto] items-center gap-2 ${componentTypography.button.primary}`}>
                    <span>Start Free Trial</span>
                    <span>→</span>
                  </Link>
                  <button className={`border border-slate-300 text-slate-700 px-8 py-3 rounded-lg hover:bg-slate-50 transition-colors ${componentTypography.button.secondary}`}>
                    Watch Demo
                  </button>
                </div>
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 text-slate-500 ${typography.bodySmall}`}>
                  <div className="grid grid-cols-[auto_auto] items-center gap-2 justify-self-center">
                    <span className="text-green-500">✓</span>
                    <span>No credit card required</span>
                  </div>
                  <div className="grid grid-cols-[auto_auto] items-center gap-2 justify-self-center">
                    <span className="text-green-500">✓</span>
                    <span>14-day free trial</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center grid grid-cols-1 gap-4 mb-16">
              <h2 className={`tracking-tight text-slate-900 dark:text-white sm:text-4xl ${typography.sectionHeader} text-3xl`}>
                Everything you need for CRE analysis
              </h2>
              <p className={`text-slate-600 dark:text-slate-300 ${typography.bodyLarge}`}>
                Powerful AI tools designed specifically for commercial real estate professionals
              </p>
            </div>
            <div className="mx-auto max-w-6xl">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                <div className="p-6 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-lg grid grid-cols-1 justify-items-center items-center">
                      📄
                    </div>
                    <h3 className={`text-slate-900 dark:text-white ${typography.subsectionHeader} text-xl`}>Smart Document Processing</h3>
                    <p className={`text-slate-600 dark:text-slate-300 ${typography.body}`}>
                      Upload PDFs and get instant text extraction with intelligent parsing of key deal metrics
                    </p>
                  </div>
                </div>
                
                <div className="p-6 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="h-10 w-10 bg-green-100 text-green-600 rounded-lg grid grid-cols-1 justify-items-center items-center">
                      💬
                    </div>
                    <h3 className={`text-slate-900 dark:text-white ${typography.subsectionHeader} text-xl`}>Conversational AI</h3>
                    <p className={`text-slate-600 dark:text-slate-300 ${typography.body}`}>
                      Ask questions about your deals in natural language and get detailed, contextual responses
                    </p>
                  </div>
                </div>
                
                <div className="p-6 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="h-10 w-10 bg-purple-100 text-purple-600 rounded-lg grid grid-cols-1 justify-items-center items-center">
                      📊
                    </div>
                    <h3 className={`text-slate-900 dark:text-white ${typography.subsectionHeader} text-xl`}>Deal Snapshots</h3>
                    <p className={`text-slate-600 dark:text-slate-300 ${typography.body}`}>
                      Automatically generate comprehensive deal summaries with key metrics and investment highlights
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <div className="grid grid-cols-1 gap-4 justify-items-center">
                <h2 className={`tracking-tight text-slate-900 dark:text-white sm:text-4xl ${typography.sectionHeader} text-3xl`}>
                  Ready to transform your deal analysis?
                </h2>
                <p className={`text-slate-600 dark:text-slate-300 ${typography.bodyLarge}`}>
                  Join thousands of real estate professionals using AI to make smarter investment decisions.
                </p>
                <Link href="/auth/register" className={`bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors grid grid-cols-[auto_auto] items-center gap-2 ${componentTypography.button.primary}`}>
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
                <div className="grid grid-cols-[auto_auto] items-center gap-2">
                  <div className="h-6 w-6 bg-blue-600 rounded grid grid-cols-1 justify-items-center items-center">
                    <span className="text-white font-bold text-xs">OM</span>
                  </div>
                  <span className={`text-slate-900 dark:text-white ${typography.navLink} font-bold`}>OM Intel Chat</span>
                </div>
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