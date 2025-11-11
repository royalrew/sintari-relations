import { NextRequest, NextResponse } from "next/server";

/**
 * Rate limit middleware för /api/coach/* routes
 * Skyddar mot missbruk med IP + session-baserad begränsning
 */

// In-memory store (använd Redis i produktion)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minut
  maxRequests: 10, // Max 10 requests per minut per IP
};

function getClientId(request: NextRequest): string {
  // Kombinera IP och session för bättre tracking
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const sessionId = request.cookies.get("session_token")?.value || "anonymous";
  return `${ip}:${sessionId}`;
}

function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitStore.get(clientId);

  if (!record || now > record.resetAt) {
    // Ny window eller expired
    const resetAt = now + RATE_LIMIT.windowMs;
    rateLimitStore.set(clientId, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1, resetAt };
  }

  if (record.count >= RATE_LIMIT.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  rateLimitStore.set(clientId, record);
  return { allowed: true, remaining: RATE_LIMIT.maxRequests - record.count, resetAt: record.resetAt };
}

// Cleanup gamla entries var 5:e minut
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimitMiddleware(request: NextRequest) {
  const clientId = getClientId(request);
  const result = checkRateLimit(clientId);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: "För många förfrågningar. Försök igen om en stund.",
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT.maxRequests),
          "X-RateLimit-Remaining": String(result.remaining),
          "X-RateLimit-Reset": String(result.resetAt),
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  return null; // Allow request
}

