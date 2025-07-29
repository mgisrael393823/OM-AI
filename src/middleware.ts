import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  const allowOrigin =
    process.env.NODE_ENV === 'development'
      ? request.headers.get('origin') || '*'
      : process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || ''
  if (allowOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowOrigin)
    response.headers.set('Vary', 'Origin')
  }

  if (request.method === 'OPTIONS') {
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    )
    return response
  }

  return response
}

export const config = {
  matcher: ['/_next/static/webpack/:path*', '/api/uploadthing'],
}

