import { useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { getProductById } from '../components/Products/productData';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { useCart } from '../context/CartContext';
import { pushToDataLayer } from '../lib/gtmStub';
import { useTrackConversion } from '../hooks/useTrackConversion';

const Page = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
`;

const Back = styled(Link)`
  display: inline-block;
  margin-bottom: 1.25rem;
  color: #c8f000;
  font-size: 0.9rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: start;
  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const HeroImg = styled.img`
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
`;

const Title = styled.h1`
  margin: 0 0 0.5rem;
  font-size: clamp(2rem, 4vw, 3rem);
`;

const Meta = styled.p`
  color: #a3a3a3;
  margin: 0 0 1rem;
`;

const PriceBlock = styled.div`
  margin: 1rem 0;
  font-size: 1.75rem;
  font-weight: 700;
`;

const Strike = styled.span`
  text-decoration: line-through;
  color: #737373;
  font-size: 1.1rem;
  margin-right: 0.5rem;
`;

const Volt = styled.span`
  color: #c8f000;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;

const Desc = styled.p`
  color: #d4d4d4;
  line-height: 1.6;
`;

const LoadingShell = styled.div`
  min-height: 50vh;
  display: grid;
  place-items: center;
  color: #d4d4d4;
  padding: 2rem;
`;

export default function CollectibleDetail() {
  const { id } = useParams<{ id: string }>();
  const product = id ? getProductById(id) : undefined;
  const { addItem } = useCart();
  const { trackConversion, ready: conversionReady } = useTrackConversion();

  const { value: showCollectibles, isLoading: isLoadingFlag } = useFeatureFlag(
    LD_FLAGS.showCollectiblesCatalog,
    false,
  );
  const { value: showVipPricing } = useFeatureFlag(LD_FLAGS.showVipPricing, false);

  const isCollectible = product?.category === 'collectibles';

  // GTM: collectible-specific analytics event (spec §3). This is a pure
  // dataLayer signal (not an `ld_conversion`), so it is never forwarded to LD
  // and is independent of the conversion-routing flag — it fires as soon as the
  // collectible is on screen. The catalog-flag gate prevents it leaking for a
  // gated feature (the page otherwise redirects home).
  useEffect(() => {
    if (!product || !isCollectible || !showCollectibles) return;
    pushToDataLayer({
      event: 'collectible_viewed',
      productId: product.id,
      productName: product.name,
      price: product.price,
    });
  }, [product, isCollectible, showCollectibles]);

  // product_viewed conversion — routed through exactly one path (GTM dataLayer
  // or direct LD track). Gate on `conversionReady` so it fires once, after the
  // routing flag resolves: firing before then would use the default (direct)
  // path and fire again once routing flips to GTM, double-counting the view.
  useEffect(() => {
    if (!product || !isCollectible || !showCollectibles || !conversionReady) return;
    trackConversion('product_viewed', { productId: product.id, value: product.price });
  }, [product, isCollectible, showCollectibles, conversionReady, trackConversion]);

  if (isLoadingFlag) {
    return (
      <Page>
        <LoadingShell>Loading...</LoadingShell>
      </Page>
    );
  }

  if (!showCollectibles) {
    return <Navigate to="/" replace />;
  }

  if (!product || !isCollectible) {
    return (
      <Page>
        <p style={{ color: '#737373' }}>Collectible not found.</p>
        <Link to="/collectibles" style={{ color: '#c8f000' }}>
          Back to collectibles
        </Link>
      </Page>
    );
  }

  const handleAddToCart = () => {
    // Collectibles have no size; use 0 as the "no size" marker for the cart line.
    addItem(product, 0);
    trackConversion('add_to_cart', { productId: product.id, value: product.price });
  };

  return (
    <Page>
      <Back to="/collectibles">← All collectibles</Back>
      <Grid>
        <div>
          <HeroImg src={product.imageUrl} alt="" loading="eager" fetchPriority="high" />
        </div>
        <div>
          <Title className="font-display">{product.name}</Title>
          <Meta>
            {product.brand} · {product.category} · {product.colorway}
          </Meta>
          <PriceBlock>
            {showVipPricing ? (
              <>
                <Strike>${product.price}</Strike>
                <Volt>${product.memberPrice}</Volt>
                <span style={{ fontSize: '0.85rem', color: '#a3a3a3', fontWeight: 400 }}> VIP</span>
              </>
            ) : (
              <>${product.price}</>
            )}
          </PriceBlock>
          <Actions>
            <button type="button" onClick={handleAddToCart}>
              Add to cart
            </button>
          </Actions>
          <Desc>{product.description}</Desc>
        </div>
      </Grid>
    </Page>
  );
}
