/**
 * Shared server-side LaunchDarkly context builder.
 *
 * Mirrors the client (src/context/LDContext.tsx) so flag/experiment bucketing
 * and metric events share the same units:
 *   - anonymous  → session-only  { kind: 'session' }
 *   - identified → multi { session, user }
 *
 * Including the session kind is what lets an experiment randomize on session,
 * so anonymous visitors are still bucketed and their conversions attributed.
 * Extracted from routes/card-creator.ts so every server route that evaluates a
 * flag builds the context identically — a route that quietly used a user-only
 * context would bucket the same visitor differently from the rest of the app.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function ldContextFromBody(
  userContext: Record<string, unknown> | undefined,
  sessionKey: string | undefined,
  /**
   * Last-resort key when a caller sends neither a user nor a session. Per-route
   * so a stray context-less request is traceable to the route that made it.
   */
  anonymousFallbackKey: string,
) {
  const session = isNonEmptyString(sessionKey)
    ? { kind: 'session' as const, key: sessionKey }
    : undefined;

  const isAnonymous = !userContext?.key || userContext.anonymous === true;

  if (isAnonymous) {
    // Match the client: an anonymous visitor is a session-only context.
    return session ?? { kind: 'user' as const, key: anonymousFallbackKey, anonymous: true };
  }

  const user = {
    kind: 'user' as const,
    key: String(userContext!.key),
    name: userContext!.name as string | undefined,
    email: userContext!.email as string | undefined,
    country: userContext!.country as string | undefined,
    state: userContext!.state as string | undefined,
    memberTier: userContext!.memberTier as string | undefined,
    memberSince: userContext!.memberSince as string | undefined,
    lifetimeSpend: userContext!.lifetimeSpend as number | undefined,
    preferredCategory: userContext!.preferredCategory as string | undefined,
    earlyAccessEnabled: userContext!.earlyAccessEnabled as boolean | undefined,
    anonymous: false,
  };

  return session ? { kind: 'multi' as const, session, user } : user;
}
