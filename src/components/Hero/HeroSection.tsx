import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeroSkeleton } from './HeroSkeleton';
import { useIsIdentifying } from '../../context/ContextVersion';
import { useVipModal } from '../../context/VipModalContext';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { resolveHeroContent, type HeroContent } from '../../lib/heroContent';

const VOLT = '#c8f000';
const STATIC_HERO_IMAGE = '/images/hero-shoes.webp';

const HeroContainer = styled.section<{ $bg: string }>`
  position: relative;
  width: 100%;
  min-height: 560px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  background-color: #0d0d0d;
  background-image: url('${(props) => props.$bg}');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  @media (max-width: 900px) {
    min-height: 420px;
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: rgba(0, 0, 0, 0.55);
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

const ctaGhostStyles = `
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

const CtaGhostButton = styled.button`
  ${ctaGhostStyles}
  cursor: pointer;
  font-family: inherit;
`;

export const HeroSection = () => {
  const isIdentifying = useIsIdentifying();
  const { openVipModal } = useVipModal();
  const ldClient = useLDClient();
  const { value: variation, isLoading: flagLoading } = useFeatureFlag(
    'hero-content-experiment',
    'control',
  );

  // Hero CTA click-through, tagged with the served variation so it's attributable
  // per variation. Matches the existing banner_click / add_to_cart track() convention.
  const trackCtaClick = (ctaText: string, ctaUrl: string) => {
    ldClient?.track('hero_cta_click', {
      variation,
      cta_text: ctaText,
      cta_url: ctaUrl,
      timestamp: new Date().toISOString(),
    });
  };

  // Resolved Contentful content tagged with the variation it belongs to. `content`
  // is HeroContent when Contentful resolved, or null to render the static fallback.
  const [resolved, setResolved] = useState<{ variation: string; content: HeroContent | null } | null>(
    null,
  );

  useEffect(() => {
    if (flagLoading) return;
    let cancelled = false;
    resolveHeroContent(variation).then((content) => {
      if (!cancelled) setResolved({ variation, content });
    });
    return () => {
      cancelled = true;
    };
  }, [variation, flagLoading]);

  // The loading state must cover BOTH async steps (flag eval + Contentful fetch).
  // Gating on resolved.variation === variation means a flag change re-shows the
  // skeleton in the same render, so there's no flash of stale/default content.
  const ready = !isIdentifying && !flagLoading && resolved?.variation === variation;
  if (!ready) {
    return <HeroSkeleton />;
  }

  const content = resolved!.content;

  // Contentful-driven Hero (control / benefit-led / drive-vip-signup entry).
  if (content) {
    return (
      <HeroContainer $bg={content.backgroundImage || STATIC_HERO_IMAGE} aria-labelledby="hero-heading">
        <Inner>
          <div>
            <Title id="hero-heading" className="font-display">
              {content.headline}
            </Title>
            <TitleUnderline aria-hidden />
          </div>
          <Sub>{content.subhead}</Sub>
          <CtaRow>
            <Cta to={content.ctaUrl} onClick={() => trackCtaClick(content.ctaText, content.ctaUrl)}>
              {content.ctaText}
            </Cta>
          </CtaRow>
        </Inner>
      </HeroContainer>
    );
  }

  // Static fallback — used when Contentful is unavailable or has no matching entry.
  return (
    <HeroContainer $bg={STATIC_HERO_IMAGE} aria-labelledby="hero-heading">
      <Inner>
        <div>
          <Title id="hero-heading" className="font-display">
            Drop-Ready, just a <VoltWord>toggle</VoltWord> away.
          </Title>
          <TitleUnderline aria-hidden />
        </div>
        <Sub>Premium limited releases. VIP gets early access and member pricing.</Sub>
        <CtaRow>
          <Cta to="/products" onClick={() => trackCtaClick('Shop drops', '/products')}>
            Shop drops
          </Cta>
          <CtaGhostButton type="button" onClick={() => openVipModal()}>
            Join VIP
          </CtaGhostButton>
        </CtaRow>
      </Inner>
    </HeroContainer>
  );
};
