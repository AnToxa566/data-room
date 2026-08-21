import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types.js';

/** The authenticated user if one is present, `null` for an anonymous caller. Only
 * meaningful behind `OptionalJwtAuthGuard` — see its doc comment. Contrast `CurrentUser`,
 * which asserts a session is guaranteed to exist. */
export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | null => {
    const request = context.switchToHttp().getRequest<Request>();
    return (request.user as AuthenticatedUser | undefined) ?? null;
  },
);
