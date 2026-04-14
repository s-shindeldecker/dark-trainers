import styled from '@emotion/styled';

const SkeletonContainer = styled.div`
  width: 100%;
  min-height: 700px;
  @media (max-width: 900px) {
    min-height: 550px;
  }
  @media (max-width: 600px) {
    min-height: 400px;
  }
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  
  @keyframes loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

export const HeroSkeleton = () => {
  return <SkeletonContainer />;
}; 