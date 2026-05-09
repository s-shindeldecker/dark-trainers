import styled from '@emotion/styled';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/Products/ProductCard';
import { products } from '../components/Products/productData';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { isIdentifiedUser } from '../types/darktrainers';
import { useUser } from '../context/UserContext';

const PageContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
`;

const Title = styled.h1`
  font-size: clamp(2rem, 5vw, 3.25rem);
  margin: 0 0 0.35rem;
  text-align: center;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #a3a3a3;
  max-width: 520px;
  margin: 0 auto 2rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  justify-items: center;
`;

const Banner = styled.div`
  text-align: center;
  margin-top: 2.5rem;
  padding: 1.5rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
`;

function sortProducts(list: typeof products, mode: 'featured' | 'price-low' | 'new', preferredCategory?: string) {
  const arr = [...list];
  if (mode === 'price-low') {
    arr.sort((a, b) => a.price - b.price);
  } else if (mode === 'new') {
    arr.sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
  } else if (preferredCategory) {
    arr.sort((a, b) => {
      const aFirst = a.category === preferredCategory ? 0 : 1;
      const bFirst = b.category === preferredCategory ? 0 : 1;
      return aFirst - bFirst;
    });
  }
  return arr;
}

export default function Products() {
  const { value: sortDefault } = useFeatureFlag(LD_FLAGS.plpSortDefault, 'featured');
  const { user } = useUser();
  const preferred = isIdentifiedUser(user) ? user.preferredCategory : undefined;

  const sorted = useMemo(() => {
    const mode = (['featured', 'price-low', 'new'] as const).includes(sortDefault as any)
      ? (sortDefault as 'featured' | 'price-low' | 'new')
      : 'featured';
    return sortProducts(products, mode, preferred);
  }, [sortDefault, preferred]);

  return (
    <PageContainer>
      <Title className="font-display">Current drops</Title>
      <Subtitle>Limited releases across running, hoops, lifestyle, and training. VIP unlocks early windows and member pricing when flags are on.</Subtitle>
      <Grid>
        {sorted.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </Grid>
      <Banner>
        <p style={{ margin: '0 0 0.75rem', color: '#d4d4d4' }}>Not sure which silhouette fits your rotation?</p>
        <Link to="/signup" style={{ fontWeight: 700 }}>
          Talk VIP signup with our assistant
        </Link>
      </Banner>
    </PageContainer>
  );
}
