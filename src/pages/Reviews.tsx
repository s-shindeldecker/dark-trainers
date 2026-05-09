import styled from '@emotion/styled';

const Page = styled.div`
  max-width: 900px;
  margin: 2rem auto;
  padding: 0 1rem 3rem;
`;

const Title = styled.h1`
  text-align: center;
  font-size: 2.25rem;
  margin-bottom: 2rem;
  color: #f5f5f5;
`;

const Grid = styled.div`
  display: grid;
  gap: 1.25rem;
`;

const Card = styled.blockquote`
  margin: 0;
  padding: 1.25rem 1.5rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  color: #d4d4d4;
  font-size: 1rem;
  line-height: 1.55;
`;

const Reviewer = styled.footer`
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #c8f000;
`;

const Reviews = () => (
  <Page>
    <Title className="font-display">From the community</Title>
    <Grid>
      <Card>
        <p>
          “First DarkTrainers drop I hit was the VOLT-1. Packaging felt premium, shoe is insane in hand — photos
          didn’t oversell it.”
        </p>
        <Reviewer>— M. Reyes, Brooklyn</Reviewer>
      </Card>
      <Card>
        <p>
          “VIP paid for itself on two pairs. Early access is no joke; I checked out before the public link even
          tweeted.”
        </p>
        <Reviewer>— K. Okafor, Atlanta</Reviewer>
      </Card>
      <Card>
        <p>
          “I live in my APEX LOWs. Clean lines, no loud branding — just quality leather and a silhouette that works with
          everything.”
        </p>
        <Reviewer>— Sam T., Portland</Reviewer>
      </Card>
    </Grid>
  </Page>
);

export default Reviews;
