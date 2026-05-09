import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { HeroSkeleton } from './HeroSkeleton';
import { useIsIdentifying } from '../../context/ContextVersion';

const HeroContainer = styled.div`
  width: 100%;
  min-height: 560px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: #0d0d0d;
  @media (max-width: 900px) {
    min-height: 420px;
  }
`;

const HeroImage = styled.img`
  width: 100%;
  height: 560px;
  object-fit: cover;
  object-position: center;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  opacity: 0.85;
  @media (max-width: 900px) {
    height: 420px;
  }
`;

const HeroText = styled.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  color: #f5f5f5;
  text-align: center;
  width: 100%;
  top: 12%;
  padding: 0 1rem;
`;

const HeroTextOverlay = styled.div`
  display: inline-block;
  padding: 1rem 2rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  max-width: 720px;
`;

const Title = styled.h1`
  margin: 0 0 0.25rem;
  font-size: clamp(2.5rem, 8vw, 4.5rem);
  line-height: 1;
`;

const Sub = styled.p`
  margin: 0;
  font-size: 1.05rem;
  color: #c8f000;
  font-weight: 500;
`;

const CtaRow = styled.div`
  position: absolute;
  bottom: 10%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
`;

const Cta = styled(Link)`
  display: inline-block;
  padding: 0.85em 1.75em;
  font-size: 1rem;
  font-weight: 700;
  background: #c8f000;
  color: #0d0d0d;
  border-radius: 8px;
  text-decoration: none;
  transition: transform 0.15s, box-shadow 0.2s;
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 0 24px rgba(200, 240, 0, 0.35);
  }
`;

const CtaGhost = styled(Link)`
  display: inline-block;
  padding: 0.85em 1.75em;
  font-size: 1rem;
  font-weight: 600;
  background: transparent;
  color: #f5f5f5;
  border: 1px solid #404040;
  border-radius: 8px;
  text-decoration: none;
  &:hover {
    border-color: #c8f000;
    color: #c8f000;
  }
`;

const HERO_IMG =
  'https://placehold.co/1920x700/111111/C8F000/png?text=DarkTrainers+Drop+Engine';

export const HeroSection = () => {
  const isIdentifying = useIsIdentifying();

  if (isIdentifying) {
    return <HeroSkeleton />;
  }

  return (
    <HeroContainer>
      <HeroImage src={HERO_IMG} alt="" fetchPriority="high" />
      <HeroText>
        <HeroTextOverlay>
          <Title className="font-display">Drop-Ready, just a toggle away.</Title>
          <Sub>Premium limited releases. VIP gets early access and member pricing.</Sub>
        </HeroTextOverlay>
      </HeroText>
      <CtaRow>
        <Cta to="/products">Shop drops</Cta>
        <CtaGhost to="/signup">Join VIP</CtaGhost>
      </CtaRow>
    </HeroContainer>
  );
};
