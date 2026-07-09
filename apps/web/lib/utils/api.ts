import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './errors';
import { logger } from './logger';

/**
 * Convert any thrown value into a typed JSON response.
 * Centralized so every route handler stays consistent.
 */

/**
 * Build a typed success response. Mirrors the shape of the
 * error response (`{ ok: true, data }`) so clients can switch
 * on `body.ok` for every route. Returns a `NextResponse` so
 * route handlers can also set cookies or headers on the
 * returned object.
 */
export function jsonResponse<T>(
  body: { ok: true; data: T },
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json(body, init);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Validation failed.', details: err.flatten() } },
      { status: 422 },
    );
  }
  logger.error('Unhandled error in route handler', { error: (err as Error)?.message });
  return NextResponse.json(
    { error: { code: 'server_error', message: 'Internal Server Error' } },
    { status: 500 },
  );
}
