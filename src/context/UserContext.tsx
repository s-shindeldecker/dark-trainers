import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  type AppUser,
  type IdentifiedUserProfile,
  STANDARD_DEMO_USER,
  VIP_DEMO_USER,
  newAnonymousKey,
} from '../types/darktrainers';

interface UserContextType {
  user: AppUser;
  /** True when browsing as anonymous Guest (not Standard/VIP). */
  isAnonymousGuest: boolean;
  /** True when identified Standard or VIP. */
  isIdentified: boolean;
  previousAnonymousKey?: string;
  setUser: (user: AppUser) => void;
  setPreviousAnonymousKey: (key: string | undefined) => void;
  resetToGuest: () => void;
  setIdentifiedStandard: () => void;
  setIdentifiedVip: () => void;
  /** Standard → VIP; clears multi stitch key. */
  upgradeIdentifiedToVip: () => void;
  /** Guest → Standard with LD multi context (call while still anonymous). */
  transitionGuestToStandard: () => void;
  /** Guest → VIP with LD multi context (call while still anonymous). */
  transitionGuestToVip: () => void;
  /** Same as resetToGuest — for header “Log out”. */
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const anonymousProfile = (): AppUser => ({
  anonymous: true,
  key: newAnonymousKey(),
});

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser>(anonymousProfile);
  const [previousAnonymousKey, setPreviousAnonymousKey] = useState<string | undefined>();

  const resetToGuest = useCallback(() => {
    setPreviousAnonymousKey(undefined);
    setUser(anonymousProfile());
  }, []);

  const setIdentifiedStandard = useCallback(() => {
    setPreviousAnonymousKey(undefined);
    setUser({ ...STANDARD_DEMO_USER });
  }, []);

  const setIdentifiedVip = useCallback(() => {
    setPreviousAnonymousKey(undefined);
    setUser({ ...VIP_DEMO_USER });
  }, []);

  const upgradeIdentifiedToVip = useCallback(() => {
    setPreviousAnonymousKey(undefined);
    setUser({ ...VIP_DEMO_USER });
  }, []);

  const transitionGuestToStandard = useCallback(() => {
    if (!user.anonymous) return;
    const anonKey = user.key;
    setPreviousAnonymousKey(anonKey);
    setUser({ ...STANDARD_DEMO_USER });
  }, [user]);

  const transitionGuestToVip = useCallback(() => {
    if (!user.anonymous) return;
    const anonKey = user.key;
    setPreviousAnonymousKey(anonKey);
    setUser({ ...VIP_DEMO_USER });
  }, [user]);

  const isAnonymousGuest = user.anonymous === true;
  const isIdentified = user.anonymous === false;

  return (
    <UserContext.Provider
      value={{
        user,
        isAnonymousGuest,
        isIdentified,
        previousAnonymousKey,
        setUser,
        setPreviousAnonymousKey,
        resetToGuest,
        setIdentifiedStandard,
        setIdentifiedVip,
        upgradeIdentifiedToVip,
        transitionGuestToStandard,
        transitionGuestToVip,
        logout: resetToGuest,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
};

/** @deprecated use IdentifiedUserProfile / AppUser from types/darktrainers */
export type UserProfile = IdentifiedUserProfile;
