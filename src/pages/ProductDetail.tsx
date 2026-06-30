import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { getProductById } from '../components/Products/productData';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { useUser } from '../context/UserContext';
import { useCart } from '../context/CartContext';
import { useVipModal } from '../context/VipModalContext';
import { isIdentifiedUser } from '../types/darktrainers';
import { pushToDataLayer } from '../lib/gtmStub';

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

const Grid = styled.div<{ $editorial: boolean }>`
  display: grid;
  grid-template-columns: ${({ $editorial }) => ($editorial ? '1fr' : '1fr 1fr')};
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

const Countdown = styled.div`
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #c8f000;
`;

const shake = keyframes`
  0%,
  100% {
    transform: translateX(0);
  }
  18% {
    transform: translateX(-7px);
  }
  36% {
    transform: translateX(7px);
  }
  54% {
    transform: translateX(-4px);
  }
  72% {
    transform: translateX(4px);
  }
  90% {
    transform: translateX(-2px);
  }
`;

const SelectRow = styled.div`
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const SizeSelectWrap = styled.div`
  width: 100%;
  max-width: 280px;
  &.shake {
    animation: ${shake} 0.48s ease;
  }
`;

const SizeErrorText = styled.p`
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  line-height: 1.35;
  color: #c8f000;
  font-weight: 500;
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

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const product = id ? getProductById(id) : undefined;
  const ldClient = useLDClient();
  const { user } = useUser();
  const { addItem } = useCart();
  const { openVipModal } = useVipModal();

  const { value: layout } = useFeatureFlag(LD_FLAGS.pdpHeroLayout, 'standard');
  const { value: showVipPricing } = useFeatureFlag(LD_FLAGS.showVipPricing, false);
  const { value: showDropToNonVip } = useFeatureFlag(LD_FLAGS.showDropExclusiveProducts, false);
  const { value: showCountdown } = useFeatureFlag(LD_FLAGS.showEarlyAccessCountdown, false);
  const { value: ctaCopy } = useFeatureFlag(LD_FLAGS.vipUpgradeCtaCopy, 'Join VIP');

  const [size, setSize] = useState<number | ''>('');
  const [sizeError, setSizeError] = useState(false);
  const sizeSelectWrapRef = useRef<HTMLDivElement>(null);

  const triggerSizeShake = useCallback(() => {
    const el = sizeSelectWrapRef.current;
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }, []);

  const clearSizeError = useCallback(() => setSizeError(false), []);

  useEffect(() => {
    if (!sizeError) return;
    const t = window.setTimeout(() => setSizeError(false), 3000);
    return () => window.clearTimeout(t);
  }, [sizeError]);

  const requireSizeOrShowError = useCallback((): boolean => {
    if (size !== '') return true;
    setSizeError(true);
    triggerSizeShake();
    return false;
  }, [size, triggerSizeShake]);

  const isVip = isIdentifiedUser(user) && user.memberTier === 'vip';
  const lockedDrop = product?.isDropExclusive && !isVip && !showDropToNonVip;
  // Collectibles are served by /collectibles/:id, not the sneaker PDP.
  const isCollectible = product?.category === 'collectibles';

  useEffect(() => {
    if (!product || !ldClient || isCollectible) return;
    ldClient.track('product_viewed', null, product.price);
    pushToDataLayer({
      event: 'ld_conversion',
      eventKey: 'product_viewed',
      productId: product.id,
      value: product.price,
    });
  }, [product, ldClient, isCollectible]);

  const releaseMs = useMemo(() => (product ? new Date(product.releaseDate).getTime() : 0), [product]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!product?.isDropExclusive || !showCountdown || !isVip) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [product, showCountdown, isVip]);

  if (!product) {
    return (
      <Page>
        <p style={{ color: '#737373' }}>Product not found.</p>
        <Link to="/products" style={{ color: '#c8f000' }}>
          Back to shop
        </Link>
      </Page>
    );
  }

  // A collectible reached via /products/:id: send it to its canonical route,
  // which enforces the show-collectibles-catalog flag and renders sizeless UI.
  if (isCollectible) {
    return <Navigate to={`/collectibles/${product.id}`} replace />;
  }

  const editorial = layout === 'editorial';
  const msLeft = Math.max(0, releaseMs - now);
  const showCd = product.isDropExclusive && showCountdown && isVip && msLeft > 0;

  const openVipWithOptionalPending = () => {
    if (!requireSizeOrShowError()) return;
    openVipModal({ product, size: size as number });
  };

  const handleAddToCart = () => {
    if (!requireSizeOrShowError()) return;
    if (lockedDrop) {
      openVipWithOptionalPending();
      return;
    }
    const res = addItem(product, size as number);
    if (res.needsVipModal) {
      openVipModal({ product, size: size as number });
      return;
    }
    if (ldClient) {
      ldClient.track('add_to_cart', null, product.price);
    }
    pushToDataLayer({
      event: 'ld_conversion',
      eventKey: 'add_to_cart',
      productId: product.id,
      value: product.price,
    });
  };

  const handleJoinVip = () => {
    if (size !== '') {
      openVipModal({ product, size: size as number });
    } else {
      openVipModal();
    }
  };

  return (
    <Page>
      <Back to="/products">← All drops</Back>
      <Grid $editorial={editorial}>
        <div>
          <HeroImg src={product.imageUrl} alt="" loading="eager" fetchPriority="high" />
        </div>
        <div>
          <Title className="font-display">{product.name}</Title>
          <Meta>
            {product.brand} · {product.category} · {product.colorway}
          </Meta>
          {showCd && (
            <Countdown>
              Drop unlocks in {Math.floor(msLeft / 86400000)}d {Math.floor((msLeft % 86400000) / 3600000)}h{' '}
              {Math.floor((msLeft % 3600000) / 60000)}m {Math.floor((msLeft % 60000) / 1000)}s
            </Countdown>
          )}
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
          <SelectRow>
            <label htmlFor="pdp-size" style={{ fontSize: '0.85rem', color: '#a3a3a3' }}>
              US size
            </label>
            <SizeSelectWrap ref={sizeSelectWrapRef}>
              <select
                id="pdp-size"
                value={size}
                aria-invalid={sizeError}
                aria-describedby={sizeError ? 'pdp-size-error' : undefined}
                onChange={(e) => {
                  setSize(e.target.value === '' ? '' : Number(e.target.value));
                  clearSizeError();
                }}
              >
                <option value="">Select size</option>
                {product.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </SizeSelectWrap>
            {sizeError && (
              <SizeErrorText id="pdp-size-error" role="alert">
                Please select a size to continue
              </SizeErrorText>
            )}
          </SelectRow>
          <Actions>
            {!lockedDrop ? (
              <button type="button" onClick={handleAddToCart}>
                Add to cart
              </button>
            ) : (
              <button type="button" onClick={openVipWithOptionalPending}>
                Unlock with VIP
              </button>
            )}
            {(!isIdentifiedUser(user) || user.memberTier !== 'vip') && (
              <button type="button" className="secondary" onClick={handleJoinVip}>
                {ctaCopy}
              </button>
            )}
          </Actions>
          <Desc>{product.description}</Desc>
        </div>
      </Grid>
    </Page>
  );
}
