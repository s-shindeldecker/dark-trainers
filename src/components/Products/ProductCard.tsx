import styled from '@emotion/styled';
import { Link } from 'react-router-dom';

export interface Product {
  id: string;
  name: string;
  tagline: string;
  price: string;
  interval: string;
  features: string[];
  highlighted?: boolean;
}

const Card = styled.div<{ highlighted?: boolean }>(({ highlighted }) => ({
  background: highlighted ? '#35524A' : '#fff',
  color: highlighted ? '#fff' : '#35524A',
  borderRadius: 16,
  boxShadow: highlighted
    ? '0 8px 32px rgba(53, 82, 74, 0.25)'
    : '0 2px 12px rgba(53, 82, 74, 0.07)',
  padding: '2.5em 2em',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  transition: 'transform 0.2s, box-shadow 0.2s',
  flex: '1 1 280px',
  maxWidth: 360,
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 12px 36px rgba(53, 82, 74, 0.18)',
  },
}));

const PlanName = styled.h2`
  font-size: 1.6em;
  margin: 0 0 0.25em;
`;

const Tagline = styled.p<{ highlighted?: boolean }>(({ highlighted }) => ({
  fontSize: '0.95em',
  color: highlighted ? 'rgba(255,255,255,0.8)' : '#6A994E',
  marginBottom: '1.5em',
}));

const Price = styled.div`
  font-size: 2.4em;
  font-weight: bold;
  margin-bottom: 0.1em;
`;

const Interval = styled.div<{ highlighted?: boolean }>(({ highlighted }) => ({
  fontSize: '0.85em',
  color: highlighted ? 'rgba(255,255,255,0.7)' : '#999',
  marginBottom: '1.5em',
}));

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 2em;
  width: 100%;
  text-align: left;
`;

const Feature = styled.li<{ highlighted?: boolean }>(({ highlighted }) => ({
  padding: '0.5em 0',
  borderBottom: `1px solid ${highlighted ? 'rgba(255,255,255,0.15)' : '#F6E7CB'}`,
  fontSize: '0.95em',
  '&::before': {
    content: '"✓ "',
    color: highlighted ? '#FFD166' : '#6A994E',
    fontWeight: 'bold',
  },
}));

const SelectButton = styled(Link)<{ highlighted?: boolean }>(({ highlighted }) => ({
  display: 'inline-block',
  padding: '0.8em 2em',
  borderRadius: 8,
  fontWeight: 'bold',
  fontSize: '1.05em',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'background 0.2s, color 0.2s',
  background: highlighted ? '#FFD166' : '#35524A',
  color: highlighted ? '#35524A' : '#fff',
  border: 'none',
  '&:hover': {
    background: highlighted ? '#FFC233' : '#6A994E',
  },
}));

interface ProductCardProps {
  product: Product;
}

export const ProductCard = ({ product }: ProductCardProps) => (
  <Card highlighted={product.highlighted}>
    <PlanName>{product.name}</PlanName>
    <Tagline highlighted={product.highlighted}>{product.tagline}</Tagline>
    <Price>{product.price}</Price>
    <Interval highlighted={product.highlighted}>{product.interval}</Interval>
    <FeatureList>
      {product.features.map((f) => (
        <Feature key={f} highlighted={product.highlighted}>{f}</Feature>
      ))}
    </FeatureList>
    <SelectButton to={`/products/${product.id}`} highlighted={product.highlighted}>
      View Plan
    </SelectButton>
  </Card>
);
