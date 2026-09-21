import type { LDClient, LDContext } from '@launchdarkly/node-server-sdk';
import {
  DEFAULT_DROP_ACCESS,
  DROP_ACCESS_FLAG_KEY,
  dropAccessStateFromFlag,
  type DropAccessState,
} from '../../src/lib/dropAccess.js';

/**
 * The one server-side drop-access resolver.
 *
 * Every server surface that needs to know what a visitor may see or buy calls
 * this — no route re-derives it, and no route evaluates `ac26-drop-access`
 * itself. If a second server surface needs entitlement later, it calls this
 * function; it does not grow its own copy.
 *
 * The context passed in must be the one already built by server/ld-context.ts
 * for that request (`multi{session,user}`, or session-only for an anonymous
 * visitor). Building a second context here would evaluate the flag against
 * different bucketing than the rest of the request — exactly the drift this
 * signature is shaped to prevent, which is why it takes a context rather than
 * a request body.
 */
export async function getDropAccessState(
  ldClient: LDClient,
  context: LDContext,
): Promise<DropAccessState> {
  // Emits an evaluation event for ac26-drop-access, which is correct rather
  // than incidental: deciding what a visitor may see IS this flag's decision
  // point on the server.
  const value = await ldClient.variation(DROP_ACCESS_FLAG_KEY, context, DEFAULT_DROP_ACCESS);
  return dropAccessStateFromFlag(value);
}

export { DROP_ACCESS_FLAG_KEY, type DropAccessState };
