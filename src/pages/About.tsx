import styled from '@emotion/styled';

const AboutContainer = styled.div`
  max-width: 720px;
  margin: 2rem auto;
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

const AboutUs = () => (
  <AboutContainer>
    <AboutTitle className="font-display">The Drop Philosophy</AboutTitle>
    <p>
      DarkTrainers exists for one reason: limited sneakers should feel urgent, fair, and worth the obsession. We build
      small-batch releases with honest materials and sharp design — then we get out of the way and let the product
      speak.
    </p>
    <p>
      Drops are intentionally scarce. VIP members get early access and member pricing because they commit to the
      culture, not because algorithms said so. Everyone else still sees the full line when we open the gates — just on
      our schedule, not a hype bot’s.
    </p>
    <blockquote
      style={{
        fontStyle: 'italic',
        color: '#c8f000',
        margin: '1.5rem 0',
        borderLeft: '4px solid #c8f000',
        paddingLeft: '1rem',
      }}
    >
      Drop-ready, just a toggle away.
    </blockquote>
    <p>What we care about:</p>
    <ul style={{ marginLeft: '1.25rem', marginBottom: '1rem' }}>
      <li>Photo-forward presentation — the shoe is the hero.</li>
      <li>Transparent release windows and real inventory (no phantom SKUs).</li>
      <li>Membership that actually moves the needle on price and access.</li>
    </ul>
    <p>Thanks for pulling up. Lace tight, notifications on, and we’ll see you at the drop.</p>
  </AboutContainer>
);

export default AboutUs;
