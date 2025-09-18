import { useFlagManager } from '../../context/FlagManager';
import { ReactNode } from 'react';
import styled from '@emotion/styled';

const LoadingOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
`;

const LoadingSpinner = styled.div`
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #6A994E;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  margin-top: 1em;
  color: #6A994E;
  font-weight: 600;
`;

interface FlagLoadingProviderProps {
  children: ReactNode;
}

export const FlagLoadingProvider = ({ children }: FlagLoadingProviderProps) => {
  const { isLoading, isReady } = useFlagManager();

  // Show loading overlay during context switches or initial load
  if (isLoading || !isReady) {
    return (
      <LoadingOverlay>
        <div style={{ textAlign: 'center' }}>
          <LoadingSpinner />
          <LoadingText>Loading your personalized experience...</LoadingText>
        </div>
      </LoadingOverlay>
    );
  }

  return <>{children}</>;
};
