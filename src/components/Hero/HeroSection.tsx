import { useLDClient } from 'launchdarkly-react-client-sdk'; 
import { useState, useEffect } from 'react';
import { useFeatureFlag } from '../../context/FlagManager';
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

const HeroText = styled.div<{ horiz: string; vert: string; color: string }>(
  ({ horiz, vert, color }) => ({
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2,
    color: color,
    textAlign: horiz as any,
    width: '100%',
    top: vert === 'top' ? '5%' : vert === 'center' ? '40%' : 'auto',
    bottom: vert === 'bottom' ? '15%' : 'auto',
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

const SubBannerText = styled.p<{ color: string }>(
  ({ color }) => ({
    marginTop: '0.5em',
    color: color,
  })
);

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
  padding: 2em;
  border-radius: 12px;
  max-width: 400px;
  width: 100%;
  text-align: center;
`;

const LoadingSkeleton = styled.div`
  width: 100%;
  min-height: 700px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  
  @keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  
  @media (max-width: 900px) {
    min-height: 550px;
  }
  @media (max-width: 600px) {
    min-height: 400px;
  }
`;

const DEFAULT_BANNER = {
  'banner-text': 'Fresh, healthy meals crafted in Gravity Falls',
  'banner-text-color': '#FFFFFF',
  'sub-banner-text': "Start your pup's journey to better health with our free trial",
  'sub-banner-text-color': '#FFFFFF',
  'horiz-justification': 'center',
  'vert-justification': 'top',
  'image-file': 'hero-control.jpeg',
};

export const HeroSection = () => {
  const ldClient = useLDClient(); 
  const { value: showTrialButton, isLoading: isButtonLoading } = useFeatureFlag('show-trial-button', false);
  const { value: bannerConfig = DEFAULT_BANNER, isLoading: isBannerLoading } = useFeatureFlag('hero-banner-text', DEFAULT_BANNER);
  const { value: trialDays, isLoading: isTrialDaysLoading } = useFeatureFlag('number-of-days-trial', 7);
  const [showModal, setShowModal] = useState(false);

  // Show loading skeleton while any flag is loading
  const isAnyLoading = isButtonLoading || isBannerLoading || isTrialDaysLoading;

  const imageFile = bannerConfig['image-file'] || DEFAULT_BANNER['image-file'];
  const isFlagValid = imageFile && typeof imageFile === 'string' && imageFile.trim() !== '';

  // Defensive: fallback to defaults if any field is missing
  const bannerText = bannerConfig['banner-text'] || DEFAULT_BANNER['banner-text'];
  const bannerTextColor = bannerConfig['banner-text-color'] || DEFAULT_BANNER['banner-text-color'];
  const subBannerText = bannerConfig['sub-banner-text'] || DEFAULT_BANNER['sub-banner-text'];
  const subBannerTextColor = bannerConfig['sub-banner-text-color'] || DEFAULT_BANNER['sub-banner-text-color'];
  const horiz = bannerConfig['horiz-justification'] || DEFAULT_BANNER['horiz-justification'];
  const vert = bannerConfig['vert-justification'] || DEFAULT_BANNER['vert-justification'];

  // Create dynamic trial text
  const trialButtonText = `Try ${trialDays} Days Free`;
  const trialModalText = `Get ${trialDays} days of fresh, customized meals for your dog.`;

  const handleTrialButtonClick = () => {
    if (ldClient) {
      ldClient.track('new_demo_trial-button-clicked', { numDays: trialDays});
    }
    setShowModal(true);
  };



  useEffect(() => {
    console.log('[LD] Hero Section Render:', {
      timestamp: new Date().toISOString(),
      showTrialButton,
      bannerConfig,
      isButtonLoading,
      trialDays,
      isTrialDaysLoading,
      isAnyLoading,
      defaultBannerConfig: DEFAULT_BANNER,
      isFlagValid,
      computedValues: {
        bannerText,
        bannerTextColor,
        subBannerText,
        subBannerTextColor,
        horiz,
        vert,
        imageFile,
        trialButtonText,
        trialModalText
      }
    });
  }, [showTrialButton, bannerConfig, isButtonLoading, trialDays, isTrialDaysLoading, isAnyLoading, isFlagValid, bannerText, bannerTextColor, subBannerText, subBannerTextColor, horiz, vert, imageFile, trialButtonText, trialModalText]);

  // Show loading skeleton while flags are being evaluated
  if (isAnyLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <HeroContainer>
      {isFlagValid ? (
        <HeroImage src={`/images/${imageFile}`} alt="Pet food subscription" />
      ) : (
        <FallbackBanner>
          LaunchDarkly flag not set or not working. No hero image to display.
        </FallbackBanner>
      )}
      <HeroText horiz={horiz} vert={vert} color={bannerTextColor}>
        <HeroTextOverlay>
          <h1>{bannerText}</h1>
          <SubBannerText color={subBannerTextColor}>{subBannerText}</SubBannerText>
        </HeroTextOverlay>
      </HeroText>
      {showTrialButton && (
        <HeroButtonWrapper>
          <TrialButton onClick={handleTrialButtonClick}>
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