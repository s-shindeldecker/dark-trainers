import { useFeatureFlag } from '../context/FlagManager';

/**
 * useTrialDays
 * Returns the number of days for the free trial from LaunchDarkly
 * @param defaultDays - default number of days (defaults to 7)
 * 
 * Usage:
 *   const { trialDays, isLoading } = useTrialDays(7);
 */
export const useTrialDays = (defaultDays: number = 7) => {
  const { value: trialDays, isLoading } = useFeatureFlag('number-of-days-trial', defaultDays);
  
  // Ensure we always return a valid number
  const validTrialDays = typeof trialDays === 'number' && trialDays > 0 ? trialDays : defaultDays;
  
  return { trialDays: validTrialDays, isLoading };
}; 