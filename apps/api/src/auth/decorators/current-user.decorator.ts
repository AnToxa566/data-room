import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types.js';

/** The authenticated user, as attached to `request.user` by `JwtStrategy.validate()`.
 * Only meaningful behind `JwtAuthGuard` (i.e. on a non-`@Public()` route). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedUser;
  },
);
