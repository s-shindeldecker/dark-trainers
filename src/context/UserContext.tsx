import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  type AppUser,
  type IdentifiedUserProfile,
  STANDARD_DEMO_USER,
  VIP_DEMO_USER,
  newAnonymousKey,
} from '../types/darktrainers';
import { getOrCreateLdSessionKey, rotateLdSessionKey } from '../lib/ldSessionKey';

export type AuthState = {
  user: AppUser;
};

interface UserContextType {
  user: AppUser;
  /** Combined slice — updates atomically; used by LDContext. */
  authState: AuthState;
  /** Persisted browser-session key for LD `kind: "session"` (pre- and post-login). */
  sessionKey: string;
  /** True when browsing as anonymous Guest (not Standard/VIP). */
  isAnonymousGuest: boolean;
  /** True when identified Standard or VIP. */
  isIdentified: boolean;
  /** Called by CartProvider to wire persona transitions to clearCart(). */
  registerClearCart: (fn: () => void) => void;
  setUser: (user: AppUser) => void;
  resetToGuest: () => void;
  setIdentifiedStandard: () => void;
  setIdentifiedVip: () => void;
  /** Identified → random Standard user (UUID key); guest → identified preserves cart. */
  setRandomStandard: (userData: IdentifiedUserProfile) => void;
  /** Identified → random VIP user (UUID key); guest → identified preserves cart. */
  setRandomVip: (userData: IdentifiedUserProfile) => void;
  /** Standard → VIP; same session key, updated user in LD multi-context. */
  upgradeIdentifiedToVip: () => void;
  /** Guest → Standard; LD identifies with multi(session + user). */
  transitionGuestToStandard: () => void;
  /** Guest → VIP; LD identifies with multi(session + user). */
  transitionGuestToVip: () => void;
  /** Same as resetToGuest — for header “Log out”. Rotates session key. */
  logout: () => void;
  /** Rotate to a fresh session key (new experiment randomization unit); keeps current persona. */
  newSession: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const anonymousProfile = (): AppUser => ({
  anonymous: true,
  key: newAnonymousKey(),
});

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const clearCartRef = useRef<(() => void) | null>(null);
  const [sessionKey, setSessionKey] = useState(() => getOrCreateLdSessionKey());
  const [authState, setAuthState] = useState<AuthState>({
    user: anonymousProfile(),
  });

  const { user } = authState;

  const registerClearCart = useCallback((fn: () => void) => {
    clearCartRef.current = fn;
  }, []);

  const clearCartIfDifferentIdentifiedUser = useCallback((prev: AppUser, next: IdentifiedUserProfile) => {
    if (!prev.anonymous && prev.key !== next.key) {
      clearCartRef.current?.();
    }
  }, []);

  const setUser = useCallback((next: AppUser) => {
    setAuthState((prev) => {
      const prevUser = prev.user;
      if (!prevUser.anonymous && next.anonymous) {
        clearCartRef.current?.();
      } else if (!prevUser.anonymous && !next.anonymous && prevUser.key !== next.key) {
        clearCartRef.current?.();
      }
      return { ...prev, user: next };
    });
  }, []);

  const resetToGuest = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) {
        clearCartRef.current?.();
      }
      return { user: anonymousProfile() };
    });
    setSessionKey(rotateLdSessionKey());
  }, []);

  // Fresh session key = new randomization unit, without changing persona.
  // The LD context memo depends on sessionKey, so this re-identifies the
  // client (re-buckets flags/experiments) and the next API call sends it.
  const newSession = useCallback(() => {
    setSessionKey(rotateLdSessionKey());
  }, []);

  const setIdentifiedStandard = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) {
        clearCartIfDifferentIdentifiedUser(prev.user, STANDARD_DEMO_USER);
      }
      return { user: { ...STANDARD_DEMO_USER } };
    });
  }, [clearCartIfDifferentIdentifiedUser]);

  const setIdentifiedVip = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) {
        clearCartIfDifferentIdentifiedUser(prev.user, VIP_DEMO_USER);
      }
      return { user: { ...VIP_DEMO_USER } };
    });
  }, [clearCartIfDifferentIdentifiedUser]);

  const setRandomStandard = useCallback(
    (userData: IdentifiedUserProfile) => {
      setAuthState((prev) => {
        if (!prev.user.anonymous) {
          clearCartIfDifferentIdentifiedUser(prev.user, userData);
        }
        return { user: { ...userData } };
      });
    },
    [clearCartIfDifferentIdentifiedUser],
  );

  const setRandomVip = useCallback(
    (userData: IdentifiedUserProfile) => {
      setAuthState((prev) => {
        if (!prev.user.anonymous) {
          clearCartIfDifferentIdentifiedUser(prev.user, userData);
        }
        return { user: { ...userData } };
      });
    },
    [clearCartIfDifferentIdentifiedUser],
  );

  const upgradeIdentifiedToVip = useCallback(() => {
    setAuthState({
      user: { ...VIP_DEMO_USER },
    });
  }, []);

  const transitionGuestToStandard = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) return prev;
      return {
        user: { ...STANDARD_DEMO_USER },
      };
    });
  }, []);

  const transitionGuestToVip = useCallback(() => {
    setAuthState((prev) => {
      if (!prev.user.anonymous) return prev;
      return {
        user: { ...VIP_DEMO_USER },
      };
    });
  }, []);

  const isAnonymousGuest = user.anonymous === true;
  const isIdentified = user.anonymous === false;

  return (
    <UserContext.Provider
      value={{
        user,
        authState,
        sessionKey,
        isAnonymousGuest,
        isIdentified,
        registerClearCart,
        setUser,
        resetToGuest,
        setIdentifiedStandard,
        setIdentifiedVip,
        setRandomStandard,
        setRandomVip,
        upgradeIdentifiedToVip,
        transitionGuestToStandard,
        transitionGuestToVip,
        logout: resetToGuest,
        newSession,
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
