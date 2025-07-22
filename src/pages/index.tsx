import React from "react"
import Head from "next/head"
import Link from "next/link"

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
          <div className="container mx-auto flex h-16 items-center justify-between px-4">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">OM</span>
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white">OM Intel Chat</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/auth/login" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                Sign In
              </Link>
              <Link href="/auth/register" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="py-20 lg:py-32">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-4 inline-flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                <span className="mr-1">⚡</span>
                AI-Powered Analysis
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-6xl lg:text-7xl mb-6">
                Transform Your{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  CRE Deal Analysis
                </span>
              </h1>
              <p className="text-lg leading-8 text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-10">
                Upload offering memorandums and get instant insights, key metrics, and investment analysis 
                through conversational AI. Make smarter real estate decisions faster.
              </p>
              <div className="flex items-center justify-center gap-x-6">
                <Link href="/auth/register" className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center">
                  Start Free Trial
                  <span className="ml-2">→</span>
                </Link>
                <button className="border border-slate-300 text-slate-700 px-8 py-3 rounded-lg hover:bg-slate-50 transition-colors">
                  Watch Demo
                </button>
              </div>
              <div className="mt-8 flex items-center justify-center space-x-6 text-sm text-slate-500">
                <div className="flex items-center">
                  <span className="mr-2 text-green-500">✓</span>
                  No credit card required
                </div>
                <div className="flex items-center">
                  <span className="mr-2 text-green-500">✓</span>
                  14-day free trial
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Everything you need for CRE analysis
              </h2>
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
                Powerful AI tools designed specifically for commercial real estate professionals
              </p>
            </div>
            <div className="mx-auto max-w-6xl">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                <div className="p-6 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
                    📄
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Smart Document Processing</h3>
                  <p className="text-slate-600 dark:text-slate-300">
                    Upload PDFs and get instant text extraction with intelligent parsing of key deal metrics
                  </p>
                </div>
                
                <div className="p-6 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="h-10 w-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
                    💬
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Conversational AI</h3>
                  <p className="text-slate-600 dark:text-slate-300">
                    Ask questions about your deals in natural language and get detailed, contextual responses
                  </p>
                </div>
                
                <div className="p-6 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="h-10 w-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-4">
                    📊
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Deal Snapshots</h3>
                  <p className="text-slate-600 dark:text-slate-300">
                    Automatically generate comprehensive deal summaries with key metrics and investment highlights
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Ready to transform your deal analysis?
              </h2>
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
                Join thousands of real estate professionals using AI to make smarter investment decisions.
              </p>
              <div className="mt-8">
                <Link href="/auth/register" className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center">
                  Start Your Free Trial
                  <span className="ml-2">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t bg-white/80 backdrop-blur-md dark:bg-slate-900/80">
          <div className="container mx-auto py-12 px-4">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <div className="h-6 w-6 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white font-bold text-xs">OM</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">OM Intel Chat</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                AI-powered commercial real estate analysis platform.
              </p>
              <div className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400">
                © 2024 OM Intel Chat. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}