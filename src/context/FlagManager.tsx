import { useLDClient } from 'launchdarkly-react-client-sdk';
import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useContextVersion } from './ContextVersion';

// Define the flags we need to pre-load
export const REQUIRED_FLAGS = [
  'hero-banner-text',
  'show-trial-button', 
  'number-of-days-trial',
  'seasonal-sale-banner-text'
] as const;

export type FlagKey = typeof REQUIRED_FLAGS[number];

interface FlagValues {
  'hero-banner-text': any;
  'show-trial-button': boolean;
  'number-of-days-trial': number;
  'seasonal-sale-banner-text': string;
}

interface FlagManagerContextType {
  flags: Partial<FlagValues>;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

const FlagManagerContext = createContext<FlagManagerContextType | null>(null);

interface FlagManagerProviderProps {
  children: ReactNode;
}

export const FlagManagerProvider = ({ children }: FlagManagerProviderProps) => {
  const ldClient = useLDClient();
  const contextVersion = useContextVersion();
  const [flags, setFlags] = useState<Partial<FlagValues>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInitializedRef = useRef(false);
  const lastContextVersionRef = useRef<number | null>(null);

  const evaluateAllFlags = useCallback(async () => {
    if (!ldClient) {
      console.log('[LD] No client available, using defaults');
      setIsLoading(false);
      setIsReady(true);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Wait for client initialization
      if (!isInitializedRef.current) {
        console.log('[LD] Waiting for client initialization...');
        await ldClient.waitForInitialization();
        isInitializedRef.current = true;
        console.log('[LD] Client initialized');
      }

      // Evaluate all required flags at once
      const flagPromises = REQUIRED_FLAGS.map(async (flagKey) => {
        try {
          const value = await ldClient.variation(flagKey, getDefaultValue(flagKey));
          console.log(`[LD] Evaluated flag [${flagKey}]:`, value);
          return { flagKey, value };
        } catch (err) {
          console.error(`[LD] Error evaluating flag [${flagKey}]:`, err);
          return { flagKey, value: getDefaultValue(flagKey) };
        }
      });

      const results = await Promise.all(flagPromises);
      const newFlags: Partial<FlagValues> = {};
      
      results.forEach(({ flagKey, value }) => {
        newFlags[flagKey] = value;
      });

      setFlags(newFlags);
      setIsReady(true);
      
      console.log('[LD] All flags evaluated successfully:', newFlags);
    } catch (error) {
      console.error('[LD] Error evaluating flags:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      // Set default values on error
      const defaultFlags: Partial<FlagValues> = {};
      REQUIRED_FLAGS.forEach(flagKey => {
        defaultFlags[flagKey] = getDefaultValue(flagKey);
      });
      setFlags(defaultFlags);
      setIsReady(true);
    } finally {
      setIsLoading(false);
    }
  }, [ldClient]);

  // Evaluate flags when context changes
  useEffect(() => {
    if (ldClient && contextVersion !== lastContextVersionRef.current) {
      lastContextVersionRef.current = contextVersion;
      console.log('[LD] Context version changed, re-evaluating flags...');
      evaluateAllFlags();
    }
  }, [ldClient, contextVersion, evaluateAllFlags]);

  // Listen for flag changes
  useEffect(() => {
    if (!ldClient) return;

    const handleFlagChange = (changedFlags: any) => {
      console.log('[LD] Flag change detected:', changedFlags);
      // Re-evaluate all flags when any flag changes
      evaluateAllFlags();
    };

    ldClient.on('change', handleFlagChange);
    return () => {
      ldClient.off('change', handleFlagChange);
    };
  }, [ldClient, evaluateAllFlags]);

  return (
    <FlagManagerContext.Provider value={{ flags, isLoading, isReady, error }}>
      {children}
    </FlagManagerContext.Provider>
  );
};

// Helper function to get default values
function getDefaultValue(flagKey: FlagKey): any {
  switch (flagKey) {
    case 'hero-banner-text':
      return {
        'banner-text': 'Fresh, healthy meals crafted in Gravity Falls',
        'banner-text-color': '#FFFFFF',
        'sub-banner-text': "Start your pup's journey to better health with our free trial",
        'sub-banner-text-color': '#FFFFFF',
        'horiz-justification': 'center',
        'vert-justification': 'top',
        'image-file': 'hero-control.jpeg',
      };
    case 'show-trial-button':
      return false;
    case 'number-of-days-trial':
      return 7;
    case 'seasonal-sale-banner-text':
      return '';
    default:
      return null;
  }
}

export const useFlagManager = () => {
  const context = useContext(FlagManagerContext);
  if (!context) {
    throw new Error('useFlagManager must be used within a FlagManagerProvider');
  }
  return context;
};

// New hook that uses the centralized flag manager
export const useFeatureFlagNew = <K extends FlagKey>(flagKey: K, defaultValue?: FlagValues[K]) => {
  const { flags, isLoading, isReady } = useFlagManager();
  
  const value = flags[flagKey] ?? defaultValue ?? getDefaultValue(flagKey);
  
  return {
    value,
    isLoading: !isReady || isLoading,
    isReady
  };
};
