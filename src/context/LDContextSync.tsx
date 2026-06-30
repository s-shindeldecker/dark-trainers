import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { ContextVersionContext } from './ContextVersion';
import { exposeLDClientForGTM } from '../lib/gtmStub';

const LDContextSync = ({ context, children }: PropsWithChildren<{ context: any }>) => {
  const ldClient = useLDClient();
  const [contextVersion, setContextVersion] = useState(0);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const prevContextRef = useRef<string | null>(null);

  // Expose the app-initialized client on window so a GTM Custom HTML tag can
  // call ldClient.track() directly (see src/lib/gtmStub.ts).
  useEffect(() => {
    if (!ldClient) return;
    exposeLDClientForGTM(ldClient);
  }, [ldClient]);

  useEffect(() => {
    if (!ldClient || !context) return;
    const contextString = JSON.stringify(context);
    if (prevContextRef.current === contextString) return;
    prevContextRef.current = contextString;

    (async () => {
      try {
        setIsIdentifying(true);
        await ldClient.waitForInitialization();
        await ldClient.identify(context);
        setContextVersion(v => v + 1);
      } catch (error) {
        console.error('[LD] Error updating context:', error);
      } finally {
        setIsIdentifying(false);
      }
    })();
  }, [ldClient, context]);

  return (
    <ContextVersionContext.Provider value={{ contextVersion, isIdentifying }}>
      {children}
    </ContextVersionContext.Provider>
  );
};

export default LDContextSync;
