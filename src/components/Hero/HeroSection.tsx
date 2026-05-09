import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { HeroSkeleton } from './HeroSkeleton';
import { useIsIdentifying } from '../../context/ContextVersion';

const VOLT = '#c8f000';

const HeroContainer = styled.section`
  position: relative;
  width: 100%;
  min-height: 560px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  background:
    radial-gradient(ellipse 120% 80% at 50% 100%, rgba(200, 240, 0, 0.07) 0%, transparent 55%),
    radial-gradient(ellipse 60% 50% at 85% 15%, rgba(200, 240, 0, 0.04) 0%, transparent 50%),
    linear-gradient(165deg, #050505 0%, #101010 42%, #0a0a0a 100%);
  @media (max-width: 900px) {
    min-height: 420px;
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.12;
    background-image:
      linear-gradient(90deg, rgba(200, 240, 0, 0.22) 1px, transparent 1px),
      linear-gradient(rgba(200, 240, 0, 0.15) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: linear-gradient(to bottom, black 0%, rgba(0, 0, 0, 0.35) 75%, transparent 100%);
    pointer-events: none;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.35;
    background-image: repeating-radial-gradient(
      circle at 20% 30%,
      transparent 0,
      transparent 2px,
      rgba(255, 255, 255, 0.03) 2px,
      rgba(255, 255, 255, 0.03) 3px
    );
    background-size: 8px 8px;
    mix-blend-mode: overlay;
    pointer-events: none;
  }
`;

const Inner = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 3.5rem clamp(1.25rem, 5vw, 3rem) 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.75rem;
  @media (max-width: 600px) {
    gap: 1.35rem;
    padding-top: 2.75rem;
    padding-bottom: 2.5rem;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(2.75rem, 10vw, 5rem);
  line-height: 0.98;
  color: #f5f5f5;
  max-width: 18ch;
`;

const VoltWord = styled.span`
  color: ${VOLT};
  text-shadow: 0 0 40px rgba(200, 240, 0, 0.25);
`;

const TitleUnderline = styled.span`
  display: block;
  margin-top: 0.85rem;
  height: 3px;
  width: min(12rem, 40vw);
  margin-left: auto;
  margin-right: auto;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, ${VOLT}, transparent);
  opacity: 0.85;
`;

const Sub = styled.p`
  margin: 0;
  font-size: clamp(1rem, 2.5vw, 1.2rem);
  line-height: 1.55;
  color: #a3a3a3;
  font-weight: 400;
  max-width: 36rem;
`;

const CtaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.25rem;
  justify-content: center;
  align-items: center;
  margin-top: 0.25rem;
`;

const Cta = styled(Link)`
  display: inline-block;
  padding: 0.9em 1.85em;
  font-size: 1rem;
  font-weight: 700;
  background: ${VOLT};
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
  padding: 0.9em 1.85em;
  font-size: 1rem;
  font-weight: 600;
  background: rgba(10, 10, 10, 0.5);
  color: #f5f5f5;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  text-decoration: none;
  backdrop-filter: blur(6px);
  &:hover {
    border-color: ${VOLT};
    color: ${VOLT};
  }
`;

export const HeroSection = () => {
  const isIdentifying = useIsIdentifying();

  if (isIdentifying) {
    return <HeroSkeleton />;
  }

  return (
    <HeroContainer aria-labelledby="hero-heading">
      <Inner>
        <div>
          <Title id="hero-heading" className="font-display">
            Drop-Ready, just a <VoltWord>toggle</VoltWord> away.
          </Title>
          <TitleUnderline aria-hidden />
        </div>
        <Sub>Premium limited releases. VIP gets early access and member pricing.</Sub>
        <CtaRow>
          <Cta to="/products">Shop drops</Cta>
          <CtaGhost to="/signup">Join VIP</CtaGhost>
        </CtaRow>
      </Inner>
    </HeroContainer>
  );
};
