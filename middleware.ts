import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Skydda /account route
  if (request.nextUrl.pathname.startsWith('/account')) {
    const sessionToken = request.cookies.get('session_token');
    const userId = request.cookies.get('user_id');
    
    if (!sessionToken || !userId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*'],
};

