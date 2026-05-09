import styled from '@emotion/styled';

const Page = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  box-sizing: border-box;
`;

const HeroMascot = styled.img`
  display: block;
  width: 100%;
  max-height: 480px;
  object-fit: cover;
  object-position: center;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
  margin-bottom: 2rem;
`;

const AboutContainer = styled.div`
  max-width: 720px;
  margin: 0 auto 2rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  padding: 2.5rem 2rem;
  color: #d4d4d4;
  font-size: 1.05rem;
  line-height: 1.65;
`;

const AboutTitle = styled.h1`
  font-size: 2.25rem;
  margin: 0 0 1rem;
  text-align: center;
  color: #f5f5f5;
`;

const StoryGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.75rem;
  align-items: start;
  margin: 1.5rem 0;
  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const ChicagoImage = styled.img`
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
`;

const StoryCopy = styled.div`
  min-width: 0;
`;

const AboutUs = () => (
  <Page>
    <HeroMascot src="/images/about-mascot.webp" alt="" />
    <AboutContainer>
      <AboutTitle className="font-display">The Drop Philosophy</AboutTitle>
      <p>
        DarkTrainers exists for one reason: limited sneakers should feel urgent, fair, and worth the obsession. We build
        small-batch releases with honest materials and sharp design — then we get out of the way and let the product
        speak.
      </p>
      <StoryGrid>
        <ChicagoImage src="/images/about-chicago.webp" alt="" />
        <StoryCopy>
          <p>
            Drops are intentionally scarce. VIP members get early access and member pricing because they commit to the
            culture, not because algorithms said so. Everyone else still sees the full line when we open the gates — just
            on our schedule, not a hype bot’s.
          </p>
          <blockquote
            style={{
              fontStyle: 'italic',
              color: '#c8f000',
              margin: '1.5rem 0 0',
              borderLeft: '4px solid #c8f000',
              paddingLeft: '1rem',
            }}
          >
            Drop-ready, just a toggle away.
          </blockquote>
        </StoryCopy>
      </StoryGrid>
      <p>What we care about:</p>
      <ul style={{ marginLeft: '1.25rem', marginBottom: '1rem' }}>
        <li>Photo-forward presentation — the shoe is the hero.</li>
        <li>Transparent release windows and real inventory (no phantom SKUs).</li>
        <li>Membership that actually moves the needle on price and access.</li>
      </ul>
      <p>Thanks for pulling up. Lace tight, notifications on, and we’ll see you at the drop.</p>
    </AboutContainer>
  </Page>
);

export default AboutUs;
