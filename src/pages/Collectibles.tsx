import styled from '@emotion/styled';
import { useMemo } from 'react';
import { Navigate, Link as RouterLink } from 'react-router-dom';
import Button from '@mui/material/Button';
import { ProductCard } from '../components/Products/ProductCard';
import { products } from '../components/Products/productData';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';

const PageContainer = styled.div`
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  box-sizing: border-box;
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
  width: 100%;
`;

const LoadingShell = styled.div`
  min-height: 50vh;
  display: grid;
  place-items: center;
  color: #d4d4d4;
  padding: 2rem;
`;

const CtaBanner = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 2rem;
  padding: 1.25rem 1.5rem;
  border-radius: 12px;
  background: linear-gradient(135deg, #1a1a2e 0%, #2a1a3e 100%);
  border: 1px solid #3a2a5e;
`;

const CtaText = styled.span`
  font-size: 1.1rem;
  font-weight: 600;
  color: #f5f5f5;
`;

const collectibles = products.filter((product) => product.category === 'collectibles');

function sortCollectibles(list: typeof collectibles, mode: 'featured' | 'price-low' | 'new') {
  const arr = [...list];
  if (mode === 'price-low') {
    arr.sort((a, b) => a.price - b.price);
  } else if (mode === 'new') {
    arr.sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
  }
  return arr;
}

export default function Collectibles() {
  const { value: showCollectibles, isLoading: isLoadingFlag } = useFeatureFlag(
    LD_FLAGS.showCollectiblesCatalog,
    false,
  );
  const { value: sortDefault } = useFeatureFlag(LD_FLAGS.plpSortDefault, 'featured');
  const { value: showCardCreator } = useFeatureFlag(LD_FLAGS.showCardCreator, false);

  const sorted = useMemo(() => {
    const mode = (['featured', 'price-low', 'new'] as const).includes(
      sortDefault as 'featured' | 'price-low' | 'new',
    )
      ? (sortDefault as 'featured' | 'price-low' | 'new')
      : 'featured';
    return sortCollectibles(collectibles, mode);
  }, [sortDefault]);

  if (isLoadingFlag) {
    return (
      <PageContainer>
        <LoadingShell>Loading collectibles...</LoadingShell>
      </PageContainer>
    );
  }

  if (!showCollectibles) {
    return <Navigate to="/" replace />;
  }

  return (
    <PageContainer>
      <Title className="font-display">Collectibles</Title>
      <Subtitle>Limited-run figures, plush, and trading cards. Member pricing applies when flags are on.</Subtitle>
      {showCollectibles && showCardCreator && (
        <CtaBanner>
          <CtaText>✨ Create Your Own Togglemon Card</CtaText>
          <Button variant="contained" component={RouterLink} to="/collectibles/card-creator">
            Start Creating
          </Button>
        </CtaBanner>
      )}
      <Grid>
        {sorted.map((p) => (
          <ProductCard key={p.id} product={p} linkBase="/collectibles" />
        ))}
      </Grid>
    </PageContainer>
  );
}
