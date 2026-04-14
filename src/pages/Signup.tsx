import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { SignupAgent } from '../components/Signup/SignupAgent';
import logo from '/gravity-farms-logo.png';

const Page = styled.div`
  min-height: 100vh;
  background: #fff;
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.div`
  background: #F6E7CB;
  padding: 1em 2em;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #eee;
`;

const LogoLink = styled(Link)`
  display: flex;
  align-items: center;
  text-decoration: none;
  gap: 0.5em;
`;

const LogoImg = styled.img`
  height: 60px;
`;

const LogoText = styled.span`
  font-weight: bold;
  font-size: 1.3em;
  color: #35524A;
`;

const HeroSection = styled.div`
  background: #35524A;
  color: #fff;
  text-align: center;
  padding: 3em 2em 2em;
`;

const HeroTitle = styled.h1`
  font-size: 2.2em;
  margin: 0 0 0.3em;
`;

const HeroSubtitle = styled.p`
  font-size: 1.1em;
  color: rgba(255, 255, 255, 0.8);
  max-width: 500px;
  margin: 0 auto;
`;

const AgentContainer = styled.div`
  flex: 1;
  padding: 2em;
`;

const Signup = () => (
  <Page>
    <TopBar>
      <LogoLink to="/">
        <LogoImg src={logo} alt="Gravity Farms Petfood" />
        <LogoText>Gravity Farms Petfood</LogoText>
      </LogoLink>
    </TopBar>
    <HeroSection>
      <HeroTitle>Let's find the perfect plan</HeroTitle>
      <HeroSubtitle>
        Our AI assistant will help match your pet with the ideal Gravity Farms meal plan.
      </HeroSubtitle>
    </HeroSection>
    <AgentContainer>
      <SignupAgent />
    </AgentContainer>
  </Page>
);

export default Signup;
