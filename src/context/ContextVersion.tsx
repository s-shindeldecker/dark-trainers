import { createContext, useContext } from 'react';

interface ContextVersionState {
  contextVersion: number;
  isIdentifying: boolean;
}

export const ContextVersionContext = createContext<ContextVersionState>({
  contextVersion: 0,
  isIdentifying: false,
});

export const useContextVersion = () => {
  const { contextVersion } = useContext(ContextVersionContext);
  return contextVersion;
};

export const useIsIdentifying = () => {
  const { isIdentifying } = useContext(ContextVersionContext);
  return isIdentifying;
};
