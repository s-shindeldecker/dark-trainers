import styled from '@emotion/styled';

const SkeletonContainer = styled.div`
  width: 100%;
  min-height: 560px;
  @media (max-width: 900px) {
    min-height: 420px;
  }
  background: linear-gradient(90deg, #141414 25%, #1f1f1f 50%, #141414 75%);
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
