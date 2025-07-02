// Cleaned up by AI on 2025-06-18, see git history for previous versions.
import { LDProvider } from 'launchdarkly-react-client-sdk';
import type { ReactNode } from 'react';
import { useUser } from './UserContext';
import { useMemo } from 'react';
import LDContextSync from './LDContextSync';

interface LDContextProps {
  children: ReactNode;
}

export const LDContextProvider = ({ children }: LDContextProps) => {
  const clientSideID = import.meta.env.LAUNCHDARKLY_CLIENT_KEY;
  
  // Debug logging
  console.log('[LD] Environment variables check:', {
    LAUNCHDARKLY_CLIENT_KEY: import.meta.env.LAUNCHDARKLY_CLIENT_KEY,
    clientSideID: clientSideID,
    isUndefined: clientSideID === undefined,
    isNull: clientSideID === null,
    isEmpty: clientSideID === '',
    type: typeof clientSideID
  });
  
  const { user, previousAnonymousKey } = useUser();

  // Memoize context so it only changes when user or previousAnonymousKey changes
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
        bootstrap: 'localStorage',
        streaming: true,
        evaluationReasons: true
      }}
    >
      <LDContextSync context={context}>
        {children}
      </LDContextSync>
    </LDProvider>
  );
}; 