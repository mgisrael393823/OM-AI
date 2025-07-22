import React from "react"
import Head from "next/head"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Building2, 
  FileText, 
  CheckCircle,
  ArrowRight,
  Zap,
  MessageSquare,
  BarChart3,
  TrendingUp,
  Shield,
  Clock,
  Users
} from "lucide-react"

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
          <div className="container flex h-16 items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">OM Intel Chat</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/auth/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/auth/register">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="py-20 lg:py-32">
          <div className="container">
            <div className="mx-auto max-w-4xl text-center">
              <Badge variant="secondary" className="mb-4">
                <Zap className="mr-1 h-3 w-3" />
                AI-Powered Analysis
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-6xl lg:text-7xl">
                Transform Your{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  CRE Deal Analysis
                </span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
                Upload offering memorandums and get instant insights, key metrics, and investment analysis 
                through conversational AI. Make smarter real estate decisions faster.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link href="/auth/register">
                  <Button size="lg" className="h-12 px-8">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="h-12 px-8">
                  Watch Demo
                </Button>
              </div>
              <div className="mt-8 flex items-center justify-center space-x-6 text-sm text-slate-500">
                <div className="flex items-center">
                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                  No credit card required
                </div>
                <div className="flex items-center">
                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                  14-day free trial
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Everything you need for CRE analysis
              </h2>
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
                Powerful AI tools designed specifically for commercial real estate professionals
              </p>
            </div>
            <div className="mx-auto mt-16 max-w-6xl">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                <Card className="border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
                  <CardHeader>
                    <FileText className="h-10 w-10 text-blue-600" />
                    <CardTitle>Smart Document Processing</CardTitle>
                    <CardDescription>
                      Upload PDFs and get instant text extraction with intelligent parsing of key deal metrics
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
                  <CardHeader>
                    <MessageSquare className="h-10 w-10 text-green-600" />
                    <CardTitle>Conversational AI</CardTitle>
                    <CardDescription>
                      Ask questions about your deals in natural language and get detailed, contextual responses
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
                  <CardHeader>
                    <BarChart3 className="h-10 w-10 text-purple-600" />
                    <CardTitle>Deal Snapshots</CardTitle>
                    <CardDescription>
                      Automatically generate comprehensive deal summaries with key metrics and investment highlights
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
                  <CardHeader>
                    <TrendingUp className="h-10 w-10 text-orange-600" />
                    <CardTitle>Investment Analysis</CardTitle>
                    <CardDescription>
                      Get insights on cap rates, NOI, cash flow projections, and comparative market analysis
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
                  <CardHeader>
                    <Shield className="h-10 w-10 text-red-600" />
                    <CardTitle>Secure & Private</CardTitle>
                    <CardDescription>
                      Enterprise-grade security with encrypted storage and user-specific data isolation
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
                  <CardHeader>
                    <Clock className="h-10 w-10 text-indigo-600" />
                    <CardTitle>Real-time Processing</CardTitle>
                    <CardDescription>
                      Fast document processing with streaming AI responses for immediate insights
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="py-16">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Trusted by real estate professionals
              </h3>
              <div className="mt-8 flex items-center justify-center space-x-8 opacity-60">
                <Users className="h-8 w-8" />
                <Building2 className="h-8 w-8" />
                <TrendingUp className="h-8 w-8" />
                <BarChart3 className="h-8 w-8" />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-20 bg-slate-50 dark:bg-slate-800/50">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Simple, transparent pricing
              </h2>
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
                Choose the plan that fits your deal flow
              </p>
            </div>
            <div className="mx-auto mt-16 max-w-4xl">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <Card className="border-2 border-slate-200 dark:border-slate-700">
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Starter</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">$49</span>
                      <span className="text-slate-600 dark:text-slate-400">/month</span>
                    </div>
                    <CardDescription>Perfect for individual investors</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>10 document uploads/month</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>Unlimited AI conversations</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>Deal snapshots</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>Email support</span>
                    </div>
                    <Button className="w-full mt-6">Start Free Trial</Button>
                  </CardContent>
                </Card>
                
                <Card className="border-2 border-blue-500 relative">
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500">
                    Most Popular
                  </Badge>
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Professional</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">$149</span>
                      <span className="text-slate-600 dark:text-slate-400">/month</span>
                    </div>
                    <CardDescription>For teams and active investors</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>50 document uploads/month</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>Unlimited AI conversations</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>Advanced deal analysis</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>Priority support</span>
                    </div>
                    <div className="flex items-center">
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      <span>Team collaboration</span>
                    </div>
                    <Button className="w-full mt-6">Start Free Trial</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Ready to transform your deal analysis?
              </h2>
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
                Join thousands of real estate professionals using AI to make smarter investment decisions.
              </p>
              <div className="mt-8">
                <Link href="/auth/register">
                  <Button size="lg" className="h-12 px-8">
                    Start Your Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t bg-white/80 backdrop-blur-md dark:bg-slate-900/80">
          <div className="container py-12">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Building2 className="h-6 w-6 text-blue-600" />
                  <span className="font-bold text-slate-900 dark:text-white">OM Intel Chat</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  AI-powered commercial real estate analysis platform.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Product</h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">Features</Link></li>
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">Pricing</Link></li>
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">API</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Company</h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">About</Link></li>
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">Blog</Link></li>
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">Careers</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Support</h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">Help Center</Link></li>
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">Contact</Link></li>
                  <li><Link href="#" className="hover:text-slate-900 dark:hover:text-white">Privacy</Link></li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t pt-8 text-center text-sm text-slate-600 dark:text-slate-400">
              © 2024 OM Intel Chat. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
