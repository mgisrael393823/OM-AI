import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { CheckCircle, Loader2 } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { typography, componentTypography } from '@/lib/typography'
import { cn } from '@/lib/utils'

export default function PaymentSuccess() {
  const router = useRouter()
  const { session_id } = router.query
  const [isVerifying, setIsVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session_id) {
      // In a real app, you'd verify the session with your backend
      // For now, we'll just simulate a delay
      setTimeout(() => {
        setIsVerifying(false)
      }, 2000)
    }
  }, [session_id])

  return (
    <>
      <Head>
        <title>Payment Successful - OM Intel Chat</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex flex-col">
        {/* Simple Navigation */}
        <nav className="border-b bg-white/80 backdrop-blur-md dark:bg-slate-900/80">
          <div className="container mx-auto px-4 h-16 flex items-center">
            <Link href="/">
              <Logo size="md" />
            </Link>
          </div>
        </nav>

        {/* Success Content */}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
              {isVerifying ? (
                <>
                  <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
                  <h1 className={cn('text-slate-900 dark:text-white mb-2', typography.sectionHeader)}>
                    Verifying Payment...
                  </h1>
                  <p className={cn('text-slate-600 dark:text-slate-300', typography.body)}>
                    Please wait while we confirm your subscription.
                  </p>
                </>
              ) : error ? (
                <>
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-red-600 dark:text-red-400 text-2xl">!</span>
                  </div>
                  <h1 className={cn('text-slate-900 dark:text-white mb-2', typography.sectionHeader)}>
                    Payment Verification Failed
                  </h1>
                  <p className={cn('text-slate-600 dark:text-slate-300 mb-6', typography.body)}>
                    {error}
                  </p>
                  <Link
                    href="/pricing"
                    className={cn(
                      'inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors',
                      componentTypography.button.primary
                    )}
                  >
                    Back to Pricing
                  </Link>
                </>
              ) : (
                <>
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h1 className={cn('text-slate-900 dark:text-white mb-2', typography.sectionHeader)}>
                    Welcome to OM Intel Chat!
                  </h1>
                  <p className={cn('text-slate-600 dark:text-slate-300 mb-6', typography.body)}>
                    Your subscription is now active. You can start analyzing offering memorandums right away.
                  </p>
                  
                  <div className="space-y-4">
                    <Link
                      href="/app"
                      className={cn(
                        'block bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors',
                        componentTypography.button.primary
                      )}
                    >
                      Go to Dashboard
                    </Link>
                    
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                      <p className={cn('text-slate-600 dark:text-slate-400 mb-2', typography.bodySmall)}>
                        Next steps:
                      </p>
                      <ul className="text-left space-y-2">
                        <li className={cn('text-slate-600 dark:text-slate-400', typography.bodySmall)}>
                          Upload your first offering memorandum
                        </li>
                        <li className={cn('text-slate-600 dark:text-slate-400', typography.bodySmall)}>
                          Ask questions about the deal
                        </li>
                        <li className={cn('text-slate-600 dark:text-slate-400', typography.bodySmall)}>
                          Generate investment summaries
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}