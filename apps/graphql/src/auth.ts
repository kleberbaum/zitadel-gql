import {
  authMiddleware,
  createDecorator,
  getContext,
  ServiceError
} from '@getcronit/pylon'

/**
 * `@requireAuth()` for this facade, replacing Pylon's.
 *
 * Pylon's useAuth sets `auth = {openidConfig}` on every request, including
 * one that carries no token at all, and its authMiddleware only asks whether
 * `auth` is truthy. The result is that an anonymous request passes every
 * `@requireAuth()` guard and reaches the resolver, which then calls Zitadel
 * without a token and fails with an opaque internal error. Nothing leaks,
 * because Zitadel refuses, but the guard is not doing what its name says and
 * a resolver that did not happen to call Zitadel would answer an anonymous
 * caller. This facade exposes every user, org and project of the Zitadel
 * behind it, so a missing token has to be a 401 before any resolver runs.
 *
 * Roles, when asked for, are delegated to Pylon's own check so the two stay
 * in step (including the AUTH_PROJECT_ID-prefixed spelling it accepts).
 */
export function requireAuth(checks?: {roles?: string[]}) {
  return createDecorator(async () => {
    const ctx = getContext()
    const auth = ctx.get('auth') as {user?: unknown} | undefined

    if (!auth?.user) {
      throw new ServiceError('Authentication required', {
        statusCode: 401,
        code: 'AUTH_REQUIRED'
      })
    }

    if (checks?.roles?.length) {
      // Pylon's middleware throws an HTTPException on a missing role; let it
      // surface as it does anywhere else in Pylon.
      await authMiddleware(checks)(ctx as any, async () => {})
    }
  })
}
