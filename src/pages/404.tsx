import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { componentTypography, typography } from '@/lib/typography'

export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 - Page Not Found</title>
        <meta name="description" content="Page not found" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className={`text-4xl text-gray-900 ${typography.pageTitle}`}>404</h1>
          <p className={`text-gray-600 max-w-lg ${typography.bodyLarge}`}>Sorry, we couldn't find the page you requested. This page may have been moved, deleted, or never existed.</p>
          <Button asChild className={componentTypography.button.primary}>
            <Link href="/">
              Return to home page
            </Link>
          </Button>
        </div>
      </main>
    </>
  )
}
