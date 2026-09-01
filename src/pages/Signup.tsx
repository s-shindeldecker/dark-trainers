import styled from '@emotion/styled';
import { MemberSignupForm } from '../components/Signup/MemberSignupForm';

const VOLT = '#c8f000';

const PageWrap = styled.div`
  max-width: 1000px;
  margin: 2.5rem auto;
  padding: 0 clamp(1.25rem, 5vw, 2.5rem) 3rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: clamp(1.75rem, 5vw, 3.5rem);
  align-items: center;
  @media (max-width: 820px) {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
`;

const Intro = styled.div``;

const Eyebrow = styled.p`
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${VOLT};
`;

const Title = styled.h1`
  margin: 0 0 0.85rem;
  font-size: clamp(2.25rem, 6vw, 3.25rem);
  line-height: 1.02;
  color: #f5f5f5;
`;

const Lead = styled.p`
  margin: 0 0 1.75rem;
  font-size: 1.05rem;
  line-height: 1.6;
  color: #a3a3a3;
  max-width: 34ch;
`;

const Perks = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const Perk = styled.li`
  padding: 0.5rem 0;
  font-size: 1rem;
  color: #d4d4d4;
  &::before {
    content: '✓ ';
    color: ${VOLT};
    font-weight: bold;
  }
`;

const Signup = () => (
  <PageWrap>
    <Grid>
      <Intro>
        <Eyebrow>DarkTrainers Membership</Eyebrow>
        <Title className="font-display">Become a member</Title>
        <Lead>
          Create a free account to get early access to new drops and offers tailored to you. Takes
          about ten seconds — no card required.
        </Lead>
        <Perks>
          <Perk>Early access windows and a heads-up on new drops</Perk>
          <Perk>A saved profile for faster checkout and order history</Perk>
          <Perk>Member-only offers — and the option to upgrade to VIP for member pricing</Perk>
        </Perks>
      </Intro>
      <MemberSignupForm />
    </Grid>
  </PageWrap>
);

export default Signup;
