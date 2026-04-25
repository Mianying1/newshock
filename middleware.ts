import { NextRequest, NextResponse } from 'next/server'

const ADMIN_COOKIE = 'newshock_admin'

async function adminCookieValue(secret: string) {
  const bytes = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function isApi(pathname: string) {
  return pathname.startsWith('/api/')
}

function unauthorized(pathname: string, message = 'Unauthorized') {
  if (isApi(pathname)) {
    return NextResponse.json({ error: message }, { status: 401 })
  }

  return new NextResponse(
    [
      'Admin access required.',
      '',
      'Open this page with ?admin_secret=... once to set an HttpOnly admin session cookie.',
    ].join('\n'),
    {
      status: 401,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    }
  )
}

function suppliedSecret(request: NextRequest): { source: 'header' | 'cookie' | 'query'; value: string } | null {
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return { source: 'header', value: auth.slice('Bearer '.length).trim() }

  const header = request.headers.get('x-admin-secret')
  if (header) return { source: 'header', value: header.trim() }

  const cookie = request.cookies.get(ADMIN_COOKIE)?.value
  if (cookie) return { source: 'cookie', value: cookie }

  const query = request.nextUrl.searchParams.get('admin_secret')
  return query?.trim() ? { source: 'query', value: query.trim() } : null
}

export async function middleware(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET
  const { pathname } = request.nextUrl

  if (!secret) {
    return unauthorized(pathname, 'Admin auth is not configured')
  }

  const candidate = suppliedSecret(request)
  const cookieValue = await adminCookieValue(secret)
  const valid = candidate?.source === 'cookie'
    ? candidate.value === cookieValue
    : candidate?.value === secret

  if (!valid) {
    return unauthorized(pathname)
  }

  const querySecret = request.nextUrl.searchParams.get('admin_secret')
  if (querySecret && !isApi(pathname)) {
    const cleanUrl = request.nextUrl.clone()
    cleanUrl.searchParams.delete('admin_secret')

    const response = NextResponse.redirect(cleanUrl)
    response.cookies.set(ADMIN_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 12,
    })
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/theme-alerts/:path*', '/debug/:path*'],
}
