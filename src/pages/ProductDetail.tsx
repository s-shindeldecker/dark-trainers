import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import styled from '@emotion/styled';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { getProductById } from '../components/Products/productData';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { useUser } from '../context/UserContext';
import { useCart } from '../context/CartContext';
import { useVipModal } from '../context/VipModalContext';
import { isIdentifiedUser } from '../types/darktrainers';

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
  width: 100%;
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

const SelectRow = styled.div`
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
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

  const isVip = isIdentifiedUser(user) && user.memberTier === 'vip';
  const lockedDrop = product?.isDropExclusive && !isVip && !showDropToNonVip;

  useEffect(() => {
    if (!product || !ldClient) return;
    ldClient.track('product_viewed', { value: product.price });
  }, [product, ldClient]);

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

  const editorial = layout === 'editorial';
  const msLeft = Math.max(0, releaseMs - now);
  const showCd = product.isDropExclusive && showCountdown && isVip && msLeft > 0;

  const openVipWithOptionalPending = () => {
    if (size === '') return;
    openVipModal({ product, size: size as number });
  };

  const handleAddToCart = () => {
    if (size === '') return;
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
      ldClient.track('add_to_cart', { value: product.price });
    }
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
          <HeroImg src={product.imageUrl} alt="" />
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
            {isVip && showVipPricing ? (
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
            <label style={{ fontSize: '0.85rem', color: '#a3a3a3' }}>US size</label>
            <select value={size} onChange={(e) => setSize(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Select size</option>
              {product.sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </SelectRow>
          <Actions>
            {!lockedDrop ? (
              <button type="button" onClick={handleAddToCart} disabled={size === ''}>
                Add to cart
              </button>
            ) : (
              <button type="button" onClick={openVipWithOptionalPending} disabled={size === ''}>
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
