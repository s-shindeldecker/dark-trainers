import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useContextVersion } from '../context/ContextVersion';

export const useFeatureFlag = (flagKey: string, defaultValue: any = false) => {
  const ldClient = useLDClient();
  const contextVersion = useContextVersion();
  const [value, setValue] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);

  const evaluateFlag = useCallback(async () => {
    if (!ldClient) {
      setIsLoading(false);
      return;
    }

    try {
      if (!isInitializedRef.current) {
        await ldClient.waitForInitialization();
        isInitializedRef.current = true;
      }
      // Non-eventing read: allFlags() returns preloaded values WITHOUT emitting an
      // evaluation event, so reading a flag here never counts as an experiment
      // exposure. Exposures are recorded deliberately at a feature's decision point
      // via useFlagExposure / useExposureRecorder (ldClient.variationDetail).
      const allFlags = ldClient.allFlags();
      const flagValue = allFlags[flagKey] ?? defaultValue;
      setValue(flagValue);
    } catch (error) {
      console.error(`[LD] Error evaluating flag ${flagKey}:`, error);
      setValue(defaultValue);
    } finally {
      setIsLoading(false);
    }
  }, [ldClient, flagKey, defaultValue]);

  useEffect(() => {
    if (ldClient) {
      evaluateFlag();
    }
  }, [ldClient, flagKey, contextVersion, evaluateFlag]);

  useEffect(() => {
    if (!ldClient) return;

    const handleFlagChange = (changedFlags: any) => {
      if (changedFlags && (changedFlags[flagKey] !== undefined || Object.keys(changedFlags).length === 0)) {
        evaluateFlag();
      }
    };

    ldClient.on('change', handleFlagChange);
    return () => {
      ldClient.off('change', handleFlagChange);
    };
  }, [ldClient, flagKey, evaluateFlag]);

  return { value, isLoading };
};
