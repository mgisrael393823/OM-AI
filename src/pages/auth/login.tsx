import React, { useState, useEffect } from "react"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { componentTypography, typography } from "@/lib/typography"
import { DEV_AUTH_UTILS } from "@/lib/dev-auth-utils"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  // Redirect if already authenticated
  useEffect(() => {
    console.log('🔐 Login page - auth state:', { loading, hasUser: !!user })
    if (!loading && user) {
      const redirectTo = router.query.redirect as string || "/app"
      console.log('✅ Already authenticated, redirecting to:', redirectTo)
      router.push(redirectTo)
    }
  }, [user, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      console.log('🔐 Attempting login for:', email)
      const { user, error } = await signIn(email, password)
      
      if (error) {
        console.log('❌ Login error:', error.message)
        setError(error.message)
        return
      }

      if (user) {
        console.log('✅ Login successful, user:', user.email)
        const redirectTo = router.query.redirect as string || "/app"
        console.log('🔄 Redirecting to:', redirectTo)
        await router.push(redirectTo)
        window.location.reload() // Force reload to clear cache
      } else {
        console.log('⚠️ Login returned no user')
        setError("Login failed - no user returned")
      }
    } catch (err: unknown) {
      console.log('💥 Login exception:', err)
      if (err instanceof Error) {
        if (err.message.includes('Missing Supabase environment variables')) {
          setError(`Configuration Error: ${err.message}. Please contact support.`)
        } else {
          setError(err.message)
        }
      } else {
        setError("An unexpected error occurred.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Sign In - OM Intel Chat</title>
        <meta name="description" content="Sign in to your OM Intel Chat account" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className={`inline-flex items-center space-x-2 text-slate-900 dark:text-white ${typography.pageTitle}`}>
              <Building2 className="h-8 w-8 text-blue-600" />
              <span>OM Intel Chat</span>
            </Link>
          </div>

          <Card className="border-0 bg-white/80 backdrop-blur-md dark:bg-slate-800/80">
            <CardHeader className="text-center">
              <CardTitle className={typography.sectionHeader}>Welcome back</CardTitle>
              <CardDescription className={typography.body}>
                Sign in to your account to continue analyzing deals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription className={typography.error}>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className={componentTypography.form.label}>Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    className={componentTypography.form.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className={componentTypography.form.label}>Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className={componentTypography.form.input}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button type="submit" className={`w-full ${componentTypography.button.primary}`} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button type="button" className={`text-blue-600 hover:underline ${componentTypography.button.link}`}>
                  Forgot your password?
                </button>
              </div>

              {/* Development debugging tools */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                    Development Tools
                  </div>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() => DEV_AUTH_UTILS.clearAuthStorage()}
                      className="text-xs px-2 py-1 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded hover:bg-yellow-300 dark:hover:bg-yellow-700"
                    >
                      Clear Auth Cache
                    </button>
                    <button
                      type="button"
                      onClick={() => DEV_AUTH_UTILS.debugAuthStorage()}
                      className="text-xs px-2 py-1 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-300 dark:hover:bg-blue-700"
                    >
                      Debug Storage
                    </button>
                  </div>
                </div>
              )}

              <div className={`mt-6 text-center text-slate-600 dark:text-slate-400 ${typography.body}`}>
                Don't have an account?{" "}
                <Link href="/auth/register" className={`text-blue-600 hover:underline ${componentTypography.button.link} font-medium`}>
                  Sign up
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
