import { useState } from 'react';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useTrialDays } from '../../hooks/useTrialDays';
import { useIsIdentifying } from '../../context/ContextVersion';
import { HeroSkeleton } from './HeroSkeleton';
import styled from '@emotion/styled';

const HeroContainer = styled.div`
  width: 100%;
  min-height: 700px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  justify-content: center;
  @media (max-width: 900px) {
    min-height: 550px;
  }
  @media (max-width: 600px) {
    min-height: 400px;
  }
`;

const HeroImage = styled.img`
  width: 100%;
  height: 700px;
  object-fit: cover;
  object-position: center 30%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  @media (max-width: 900px) {
    height: 550px;
  }
  @media (max-width: 600px) {
    height: 400px;
  }
`;

const HeroText = styled.div<{ color: string }>(
  ({ color }) => ({
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2,
    color: color,
    textAlign: 'center' as const,
    width: '100%',
    top: '5%',
  })
);

const HeroTextOverlay = styled.div`
  display: inline-block;
  padding: 0.25em 2.5em;
  border-radius: 8px;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.10);
  max-width: 800px;
  margin: 0 auto;
`;

const SubBannerText = styled.p`
  margin-top: 0.5em;
  color: #FFFFFF;
`;

const HeroButtonWrapper = styled.div`
  position: absolute;
  bottom: 7%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  width: 100%;
  display: flex;
  justify-content: center;
`;

const FallbackBanner = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background: #ff9800;
  color: #222;
  padding: 0.5em;
  z-index: 3;
  font-weight: bold;
`;

const TrialButton = styled.button`
  padding: 1em 2em;
  font-size: 1.2em;
  background: #FFD166;
  color: #35524A;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #D7263D;
    color: #fff;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  color: #35524A;
  padding: 2em;
  border-radius: 12px;
  max-width: 400px;
  width: 100%;
  text-align: center;
`;

const DEFAULT_BANNER = {
  'banner-text': 'Fresh, healthy meals crafted in Gravity Falls',
  'banner-text-color': '#FFFFFF',
  'sub-banner-text': "Start your pup's journey to better health with our free trial",
  'image-file': 'hero-control.jpeg',
};

export const HeroSection = () => {
  const { value: showTrialButton, isLoading: isButtonLoading } = useFeatureFlag('show-trial-button', false);
  const { value: bannerConfig = DEFAULT_BANNER, isLoading: isBannerLoading } = useFeatureFlag('hero-banner-text', DEFAULT_BANNER);
  const { trialDays, isLoading: isTrialDaysLoading } = useTrialDays(7);
  const isIdentifying = useIsIdentifying();
  const [showModal, setShowModal] = useState(false);

  if (isBannerLoading || isIdentifying) {
    return <HeroSkeleton />;
  }

  const imageFile = bannerConfig['image-file'] || DEFAULT_BANNER['image-file'];
  const isFlagValid = imageFile && typeof imageFile === 'string' && imageFile.trim() !== '';
  const bannerText = bannerConfig['banner-text'] || DEFAULT_BANNER['banner-text'];
  const bannerTextColor = bannerConfig['banner-text-color'] || DEFAULT_BANNER['banner-text-color'];
  const subBannerText = bannerConfig['sub-banner-text'] || DEFAULT_BANNER['sub-banner-text'];

  const trialButtonText = `Try ${trialDays} Days Free`;
  const trialModalText = `Get ${trialDays} days of fresh, customized meals for your dog.`;

  return (
    <HeroContainer>
      {isFlagValid ? (
        <HeroImage src={`/images/${imageFile}`} alt="Pet food subscription" />
      ) : (
        <FallbackBanner>
          LaunchDarkly flag not set or not working. No hero image to display.
        </FallbackBanner>
      )}
      <HeroText color={bannerTextColor}>
        <HeroTextOverlay>
          <h1>{bannerText}</h1>
          <SubBannerText>{subBannerText}</SubBannerText>
        </HeroTextOverlay>
      </HeroText>
      {(!isButtonLoading && !isTrialDaysLoading && showTrialButton) && (
        <HeroButtonWrapper>
          <TrialButton onClick={() => setShowModal(true)}>
            {trialButtonText}
          </TrialButton>
        </HeroButtonWrapper>
      )}
      {showModal && (
        <ModalOverlay onClick={() => setShowModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <h2>Start Your Free Trial Today!</h2>
            <p>{trialModalText}</p>
            <form className="trial-form" onSubmit={e => {e.preventDefault(); setShowModal(false); alert('Thank you for your interest! This is a demo site.');}}>
              <input type="email" placeholder="Enter your email" required style={{width: '100%', padding: '0.5em', marginBottom: '1em'}} />
              <button type="submit" className="cta-button" style={{width: '100%'}}>Get Started</button>
            </form>
            <p className="modal-footnote">No commitment required. Cancel anytime.</p>
            <button onClick={() => setShowModal(false)} style={{marginTop: '1em'}}>Close</button>
          </ModalContent>
        </ModalOverlay>
      )}
    </HeroContainer>
  );
};
