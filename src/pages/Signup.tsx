import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { SignupAgent } from '../components/Signup/SignupAgent';

const Page = styled.div`
  min-height: 100vh;
  background: #0d0d0d;
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.div`
  background: #111;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #2a2a2a;
`;

const LogoLink = styled(Link)`
  display: flex;
  align-items: center;
  text-decoration: none;
  gap: 0.35rem;
`;

const LogoText = styled.span`
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.5rem;
  letter-spacing: 0.06em;
  color: #f5f5f5;
`;

const Volt = styled.span`
  color: #c8f000;
`;

const HeroSection = styled.div`
  background: linear-gradient(180deg, #111 0%, #0d0d0d 100%);
  color: #fff;
  text-align: center;
  padding: 2.5rem 1.5rem 1.5rem;
`;

const HeroTitle = styled.h1`
  font-size: 2rem;
  margin: 0 0 0.35rem;
`;

const HeroSubtitle = styled.p`
  font-size: 1rem;
  color: #a3a3a3;
  max-width: 520px;
  margin: 0 auto;
`;

const AgentContainer = styled.div`
  flex: 1;
  padding: 1.5rem 1rem 2.5rem;
`;

const Signup = () => (
  <Page>
    <TopBar>
      <LogoLink to="/">
        <LogoText>
          DARK<Volt>TRAINERS</Volt>
        </LogoText>
      </LogoLink>
    </TopBar>
    <HeroSection>
      <HeroTitle className="font-display">VIP membership</HeroTitle>
      <HeroSubtitle>
        Our assistant walks through early access, member pricing, and whether VIP fits how you buy sneakers.
      </HeroSubtitle>
    </HeroSection>
    <AgentContainer>
      <SignupAgent />
    </AgentContainer>
  </Page>
);

export default Signup;
