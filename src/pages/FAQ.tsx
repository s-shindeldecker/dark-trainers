import styled from '@emotion/styled';

const FaqContainer = styled.div`
  max-width: 720px;
  margin: 2rem auto;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  padding: 2.5rem 2rem;
  color: #d4d4d4;
`;

const FaqTitle = styled.h1`
  font-size: 2.25rem;
  margin: 0 0 1.5rem;
  text-align: center;
  color: #f5f5f5;
`;

const Question = styled.h2`
  font-size: 1.15rem;
  margin: 1.5rem 0 0.5rem;
  color: #c8f000;
`;

const FAQ = () => (
  <FaqContainer>
    <FaqTitle className="font-display">FAQ</FaqTitle>
    <Question>How do drops work?</Question>
    <p>We publish a release date and inventory count. VIP members may enter during an early window; the public window opens after. When stock is gone, it’s gone.</p>
    <Question>What does VIP include?</Question>
    <p>Early access to select releases, member pricing (typically 15–20% off), and priority support during busy drop minutes — $14.99/month in this demo.</p>
    <Question>How do sizes run?</Question>
    <p>US men’s sizing on product pages. If you’re between sizes, we suggest going half up for running silhouettes with thicker socks.</p>
    <Question>What is your return policy?</Question>
    <p>Demo storefront — no real fulfillment. In a production rollout we’d align with industry-standard unworn returns within 30 days.</p>
    <Question>Do you ship internationally?</Question>
    <p>This demo assumes US shipping. International expansion would follow carrier partnerships and duty transparency.</p>
  </FaqContainer>
);

export default FAQ;
