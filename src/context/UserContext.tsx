import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type UserProfile = {
  key: string;
  anonymous: boolean;
  name?: string;
  country?: string;
  state?: string;
  petType?: string;
  planType?: string;
  paymentType?: string;
};

interface UserContextType {
  user: UserProfile;
  isLoggedIn: boolean;
  login: (profile: UserProfile) => void;
  logout: () => void;
  setUser: (profile: UserProfile) => void;
  previousAnonymousKey?: string;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const getRandomUserProfile = (): UserProfile => {
  const countries = ['US', 'CA', 'FR', 'UK'];
  const petTypes = ['dog', 'cat', 'both'];
  const planTypes = ['basic', 'premium', 'deluxe'];
  const paymentTypes = ['credit_card', 'paypal', 'apple_pay'];
  
  const country = countries[Math.floor(Math.random() * countries.length)];
  const petType = petTypes[Math.floor(Math.random() * petTypes.length)];
  const planType = planTypes[Math.floor(Math.random() * planTypes.length)];
  const paymentType = paymentTypes[Math.floor(Math.random() * paymentTypes.length)];
  
  let state = '';
  if (country === 'US') state = 'California';
  else if (country === 'CA') state = 'Ontario';
  else if (country === 'FR') state = 'Paris';
  else if (country === 'UK') state = 'Greater London';
  
  return {
    key: 'user-' + Math.random().toString(36).substring(2) + Date.now(),
    anonymous: false,
    name: 'Demo User',
    country,
    state,
    petType,
    planType,
    paymentType,
  };
};

const getAnonymousProfile = (): UserProfile => ({
  key: Math.random().toString(36).substring(2) + Date.now(),
  anonymous: true,
});

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile>(getAnonymousProfile());
  const [previousAnonymousKey, setPreviousAnonymousKey] = useState<string | undefined>();
  const isLoggedIn = !user.anonymous;

  const login = (profile: UserProfile) => {
    // Store the current anonymous key before setting the new user
    setPreviousAnonymousKey(user.key);
    setUser(profile);
  };

  const logout = () => {
    setUser(getAnonymousProfile());
    setPreviousAnonymousKey(undefined);
  };

  return (
    <UserContext.Provider value={{ 
      user, 
      isLoggedIn, 
      login, 
      logout, 
      setUser,
      previousAnonymousKey 
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
}; 