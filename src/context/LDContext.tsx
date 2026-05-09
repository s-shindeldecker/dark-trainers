import { LDProvider } from 'launchdarkly-react-client-sdk';
import type { ReactNode } from 'react';
import { useUser } from './UserContext';
import { useMemo } from 'react';
import LDContextSync from './LDContextSync';
import Observability from '@launchdarkly/observability';
import SessionReplay from '@launchdarkly/session-replay';
import { isIdentifiedUser } from '../types/darktrainers';

function identifiedLdFields(profile: {
  key: string;
  name: string;
  email: string;
  country: string;
  state: string;
  memberTier: string;
  memberSince: string;
  lifetimeSpend: number;
  preferredCategory: string;
  earlyAccessEnabled: boolean;
}) {
  return {
    kind: 'user' as const,
    key: profile.key,
    name: profile.name,
    email: profile.email,
    country: profile.country,
    state: profile.state,
    memberTier: profile.memberTier,
    memberSince: profile.memberSince,
    lifetimeSpend: profile.lifetimeSpend,
    preferredCategory: profile.preferredCategory,
    earlyAccessEnabled: profile.earlyAccessEnabled,
    anonymous: false,
  };
}

interface LDContextProps {
  children: ReactNode;
}

export const LDContextProvider = ({ children }: LDContextProps) => {
  const clientSideID = import.meta.env.LAUNCHDARKLY_CLIENT_KEY;
  const { authState, sessionKey } = useUser();
  const { user } = authState;

  const context = useMemo(() => {
    const sessionLd = { kind: 'session' as const, key: sessionKey };

    if (user.anonymous) {
      return sessionLd;
    }

    return {
      kind: 'multi' as const,
      session: sessionLd,
      user: identifiedLdFields(user),
    };
  }, [authState, sessionKey]);

  return (
    <LDProvider
      clientSideID={clientSideID}
      context={context as any}
      options={{
        streaming: true,
        evaluationReasons: true,
        plugins: [
          new Observability({ tracingOrigins: true, networkRecording: { enabled: true } }),
          new SessionReplay({ privacySetting: 'strict' }),
        ],
      }}
    >
      <LDContextSync context={context}>{children}</LDContextSync>
    </LDProvider>
  );
};

/** Serialize user for chat / signup API bodies */
export function userToApiContext(user: import('../types/darktrainers').AppUser) {
  if (!isIdentifiedUser(user)) {
    return { key: user.key, anonymous: true };
  }
  return {
    key: user.key,
    name: user.name,
    email: user.email,
    country: user.country,
    state: user.state,
    memberTier: user.memberTier,
    memberSince: user.memberSince,
    lifetimeSpend: user.lifetimeSpend,
    preferredCategory: user.preferredCategory,
    earlyAccessEnabled: user.earlyAccessEnabled,
    anonymous: false,
  };
}
