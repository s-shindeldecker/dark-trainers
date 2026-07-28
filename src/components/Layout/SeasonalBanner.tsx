import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useFlagExposure } from '../../context/ExposureLog';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { LD_FLAGS } from '../../lib/ldFlagKeys';

const BannerContainer = styled.div`
  width: 100%;
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #111 100%);
  color: #f5f5f5;
  text-align: center;
  padding: 0.75em 1em;
  font-weight: 600;
  font-size: 0.95em;
  position: relative;
  z-index: 101;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: linear-gradient(135deg, #222 0%, #333 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  }
  
  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
`;

const BannerText = styled.span`
  display: inline-block;
  max-width: 1200px;
  margin: 0 auto;
`;

export const SeasonalBanner = () => {
  // Non-eventing preload: read the value to decide whether to render, WITHOUT
  // counting an experiment exposure. The exposure is deferred to VisibleBanner,
  // which mounts only when the banner is actually shown to the user.
  const { value: bannerText, isLoading } = useFeatureFlag(LD_FLAGS.promoBannerText, '');
  const text = typeof bannerText === 'string' ? bannerText : '';

  // Don't render anything (and don't expose) if there's no banner text or if still loading
  if (isLoading || text.trim() === '') {
    return null;
  }

  return <VisibleBanner text={text} />;
};

const VisibleBanner = ({ text }: { text: string }) => {
  // This component mounts only when the promo banner is visible, so exposing the
  // experiment flag here counts the user exactly when they actually see it —
  // protecting the live promo-banner-text experiment now that reads are non-eventing.
  useFlagExposure(LD_FLAGS.promoBannerText, '');
  const ldClient = useLDClient();
  const navigate = useNavigate();

  const handleBannerClick = () => {
    // Track the banner click event
    if (ldClient) {
      ldClient.track('banner_click', {
        banner_text: text,
        timestamp: new Date().toISOString()
      });
    }

    // Navigate to About Us page
    navigate('/about');
  };

  return (
    <BannerContainer onClick={handleBannerClick}>
      <div className="centered-container">
        <BannerText>
          {text}
        </BannerText>
      </div>
    </BannerContainer>
  );
};