import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';

const BannerContainer = styled.div`
  width: 100%;
  background: linear-gradient(135deg, #FFD166 0%, #6A994E 100%);
  color: white;
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
    background: linear-gradient(135deg, #FFC233 0%, #5A8A3E 100%);
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
  const { value: bannerText, isLoading } = useFeatureFlag('seasonal-sale-banner-text', '');
  const ldClient = useLDClient();
  const navigate = useNavigate();

  const handleBannerClick = () => {
    // Track the banner click event
    if (ldClient) {
      ldClient.track('banner_click', {
        banner_text: bannerText,
        timestamp: new Date().toISOString()
      });
    }
    
    // Navigate to About Us page
    navigate('/about');
  };

  // Don't render anything if there's no banner text or if still loading
  if (isLoading || !bannerText || bannerText.trim() === '') {
    return null;
  }

  return (
    <BannerContainer onClick={handleBannerClick}>
      <div className="centered-container">
        <BannerText>
          {bannerText}
        </BannerText>
      </div>
    </BannerContainer>
  );
}; 