import { useParams, Link } from 'react-router-dom';
import styled from '@emotion/styled';
import { products } from '../components/Products/productData';

const PageContainer = styled.div`
  max-width: 700px;
  margin: 2em auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(53, 82, 74, 0.07);
  padding: 2.5em 2em;
  color: #35524A;
`;

const BackLink = styled(Link)`
  display: inline-block;
  margin-bottom: 1.5em;
  color: #6A994E;
  text-decoration: none;
  font-weight: 500;
  &:hover {
    text-decoration: underline;
  }
`;

const PlanName = styled.h1`
  font-size: 2.2em;
  margin-bottom: 0.15em;
`;

const Tagline = styled.p`
  color: #6A994E;
  font-size: 1.1em;
  margin-bottom: 1.5em;
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.4em;
  margin-bottom: 2em;
`;

const Price = styled.span`
  font-size: 2.8em;
  font-weight: bold;
`;

const Interval = styled.span`
  font-size: 1em;
  color: #999;
`;

const SectionTitle = styled.h2`
  font-size: 1.3em;
  margin-bottom: 0.6em;
  color: #35524A;
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 2em;
`;

const Feature = styled.li`
  padding: 0.6em 0;
  border-bottom: 1px solid #F6E7CB;
  font-size: 1.05em;
  &::before {
    content: "✓ ";
    color: #6A994E;
    font-weight: bold;
  }
`;

const SignUpButton = styled.button`
  display: block;
  width: 100%;
  padding: 1em;
  background: #FFD166;
  color: #35524A;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.15em;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #D7263D;
    color: #fff;
  }
`;

const HelpLink = styled(Link)`
  display: block;
  text-align: center;
  margin-top: 1.5em;
  color: #6A994E;
  font-size: 0.95em;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const NotFound = styled.div`
  text-align: center;
  padding: 3em;
  color: #999;
  font-size: 1.2em;
`;

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const product = products.find((p) => p.id === id);

  if (!product) {
    return (
      <PageContainer>
        <NotFound>
          <p>Plan not found.</p>
          <BackLink to="/products">Back to Plans</BackLink>
        </NotFound>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BackLink to="/products">&larr; Back to Plans</BackLink>
      <PlanName>{product.name}</PlanName>
      <Tagline>{product.tagline}</Tagline>
      <PriceRow>
        <Price>{product.price}</Price>
        <Interval>/ {product.interval}</Interval>
      </PriceRow>
      <SectionTitle>What's Included</SectionTitle>
      <FeatureList>
        {product.features.map((f) => (
          <Feature key={f}>{f}</Feature>
        ))}
      </FeatureList>
      <SignUpButton onClick={() => alert('Thank you for your interest! This is a demo site.')}>
        Sign Up for {product.name}
      </SignUpButton>
      <HelpLink to="/signup">Need help choosing? Let our AI assistant guide you</HelpLink>
    </PageContainer>
  );
};

export default ProductDetail;
