import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route (or an entire controller) out of the global `JwtAuthGuard`.
 *
 * Default-deny is the point: every route is authenticated unless explicitly marked
 * `@Public()`. A new endpoint added without this decorator is protected by construction
 * — never invert this by defaulting routes to public and opting individual ones in.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
