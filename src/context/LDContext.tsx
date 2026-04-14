import { LDProvider } from 'launchdarkly-react-client-sdk';
import type { ReactNode } from 'react';
import { useUser } from './UserContext';
import { useMemo } from 'react';
import LDContextSync from './LDContextSync';
import Observability from '@launchdarkly/observability';
import SessionReplay from '@launchdarkly/session-replay';

interface LDContextProps {
  children: ReactNode;
}

export const LDContextProvider = ({ children }: LDContextProps) => {
  const clientSideID = import.meta.env.LAUNCHDARKLY_CLIENT_KEY;
  const { user, previousAnonymousKey } = useUser();

  const context = useMemo(() => {
    if (previousAnonymousKey && !user.anonymous) {
      return {
        kind: 'multi',
        user: {
          key: user.key,
          name: user.name,
          country: user.country,
          state: user.state,
          petType: user.petType?.toLowerCase(),
          planType: user.planType,
          paymentType: user.paymentType,
          anonymous: false
        },
        anonymous: {
          key: previousAnonymousKey,
          anonymous: true
        }
      };
    }
    return {
      kind: 'user',
      key: user.key,
      anonymous: user.anonymous,
      name: user.name,
      country: user.country,
      state: user.state,
      petType: user.petType?.toLowerCase(),
      planType: user.planType,
      paymentType: user.paymentType
    };
  }, [user, previousAnonymousKey]);

  return (
    <LDProvider
      clientSideID={clientSideID}
      context={context as any}
      options={{
        streaming: true,
        evaluationReasons: true,
        plugins: [
          new Observability({ tracingOrigins: true, networkRecording: { enabled: true } }),
          new SessionReplay({ privacySetting: 'strict' })
        ]
      }}
    >
      <LDContextSync context={context}>
        {children}
      </LDContextSync>
    </LDProvider>
  );
};
