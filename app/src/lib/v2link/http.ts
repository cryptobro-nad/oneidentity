import { NextResponse } from "next/server";

/** A 429 with a `Retry-After` header (seconds) and matching JSON, so clients get
 *  clear retry timing. */
export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  const secs = Math.max(1, Math.ceil(retryAfterSeconds));
  return NextResponse.json(
    { error: "Too many requests. Try again shortly.", retryAfterSeconds: secs },
    { status: 429, headers: { "Retry-After": String(secs) } },
  );
}
