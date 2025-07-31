import React, { useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Logo } from '@/components/ui/logo'
import { PricingSection } from '@/components/homepage/PricingSection'
import { componentTypography } from '@/lib/typography'
import { cn } from '@/lib/utils'

export default function PricingPage() {
  const router = useRouter()
  const { canceled } = router.query

  useEffect(() => {
    if (canceled === 'true') {
      // Show a toast or notification that checkout was canceled
      console.log('Checkout was canceled')
    }
  }, [canceled])

  return (
    <>
      <Head>
        <title>Pricing - OM Intel Chat</title>
        <meta name="description" content="Choose the perfect plan for your CRE analysis needs. Start with a 14-day free trial." />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {/* Navigation */}
        <nav className="border-b bg-white/80 backdrop-blur-md dark:bg-slate-900/80 sticky top-0 z-50">
          <div className="container mx-auto grid grid-cols-[auto_1fr_auto] h-16 items-center px-4">
            <Link href="/">
              <Logo size="md" />
            </Link>
            <div></div>
            <div className="grid grid-cols-2 items-center gap-4">
              <Link href="/auth/login" className={cn('text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white', componentTypography.button.link)}>
                Sign In
              </Link>
              <Link href="/auth/register" className={cn('bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors', componentTypography.button.primary)}>
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Pricing Section */}
        <PricingSection />

        {/* Footer */}
        <footer className="border-t bg-white/80 backdrop-blur-md dark:bg-slate-900/80 py-8">
          <div className="container mx-auto px-4 text-center">
            <p className={cn('text-slate-600 dark:text-slate-400', componentTypography.card.footer)}>
              Questions? Email us at support@omintelchat.com
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}