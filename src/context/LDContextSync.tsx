// Cleaned up by AI on 2025-06-18, see git history for previous versions.
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { ContextVersionContext } from './ContextVersion';
import { FlagManagerProvider } from './FlagManager';

const LDContextSync = ({ context, children }: PropsWithChildren<{ context: any }>) => {
  const ldClient = useLDClient();
  const [contextVersion, setContextVersion] = useState(0);
  const prevContextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ldClient || !context) return;
    const contextString = JSON.stringify(context);
    if (prevContextRef.current === contextString) return;
    prevContextRef.current = contextString;

    (async () => {
      try {
        console.log('[LD] Waiting for client initialization...');
        await ldClient.waitForInitialization();
        console.log('[LD] Client initialized, about to identify with context:', JSON.stringify(context, null, 2));
        await ldClient.identify(context);
        const currentContext = ldClient.getContext();
        console.log('[LD] After identify, current context is:', JSON.stringify(currentContext, null, 2));
        setContextVersion(v => {
          const newVersion = v + 1;
          console.log('[LD] Incrementing contextVersion from', v, 'to', newVersion);
          return newVersion;
        });
      } catch (error) {
        console.error('[LD] Error updating context:', error);
      }
    })();
  }, [ldClient, context]);

  return (
    <ContextVersionContext.Provider value={contextVersion}>
      <FlagManagerProvider>
        {children}
      </FlagManagerProvider>
    </ContextVersionContext.Provider>
  );
};

export default LDContextSync; 