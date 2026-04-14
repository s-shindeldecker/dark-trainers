import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/Products/ProductCard';
import { products } from '../components/Products/productData';

const PageContainer = styled.div`
  max-width: 1100px;
  margin: 2em auto;
  padding: 0 1em;
`;

const Title = styled.h1`
  font-size: 2.4em;
  text-align: center;
  color: #35524A;
  margin-bottom: 0.2em;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #6A994E;
  font-size: 1.15em;
  margin-bottom: 2.5em;
`;

const CardGrid = styled.div`
  display: flex;
  gap: 2em;
  justify-content: center;
  flex-wrap: wrap;
`;

const HelpBanner = styled.div`
  text-align: center;
  margin-top: 3em;
  padding: 2em;
  background: #F6E7CB;
  border-radius: 16px;
`;

const HelpText = styled.p`
  color: #35524A;
  font-size: 1.1em;
  margin-bottom: 0.8em;
`;

const HelpLink = styled(Link)`
  display: inline-block;
  background: #35524A;
  color: #fff;
  padding: 0.7em 2em;
  border-radius: 8px;
  font-weight: bold;
  text-decoration: none;
  transition: background 0.2s;
  &:hover {
    background: #6A994E;
  }
`;

const Products = () => (
  <PageContainer>
    <Title>Choose Your Plan</Title>
    <Subtitle>Fresh, vet-approved meals delivered to your door. No commitment required.</Subtitle>
    <CardGrid>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </CardGrid>
    <HelpBanner>
      <HelpText>Not sure which plan is right for your pet?</HelpText>
      <HelpLink to="/signup">Let our AI assistant help you choose</HelpLink>
    </HelpBanner>
  </PageContainer>
);

export default Products;
