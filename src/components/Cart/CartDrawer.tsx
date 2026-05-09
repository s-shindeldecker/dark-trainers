import styled from '@emotion/styled';
import { useMemo } from 'react';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { LD_FLAGS, DEFAULT_CHECKOUT_VIP_BANNER } from '../../lib/ldFlagKeys';
import { useCart } from '../../context/CartContext';
import { useUser } from '../../context/UserContext';
import { isIdentifiedUser } from '../../types/darktrainers';
import { getProductById } from '../Products/productData';

const Backdrop = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10040;
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
  transition: opacity 0.2s;
`;

const Panel = styled.aside<{ $open: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: min(400px, 100vw);
  background: #111;
  border-left: 1px solid #2a2a2a;
  z-index: 10041;
  transform: translateX(${({ $open }) => ($open ? '0' : '100%')});
  transition: transform 0.25s ease;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.35);
`;

const Head = styled.div`
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.25rem;
`;

const CloseBtn = styled.button`
  background: transparent;
  color: #a3a3a3;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  &:hover {
    color: #fff;
  }
`;

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
`;

const Line = styled.div`
  padding: 0.75rem 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 0.9rem;
`;

const Upsell = styled.div`
  margin: 1rem 0;
  padding: 1rem;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 0.85rem;
`;

const Foot = styled.div`
  padding: 1rem 1.25rem;
  border-top: 1px solid #2a2a2a;
`;

const Total = styled.div`
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  margin-bottom: 0.75rem;
`;

const CheckoutBtn = styled.button`
  width: 100%;
`;

export function CartDrawer({ onJoinVip }: { onJoinVip: () => void }) {
  const ldClient = useLDClient();
  const { lines, isOpen, closeCart, cartSubtotal, updateQty, removeLine } = useCart();
  const { user } = useUser();
  const { value: bannerJson } = useFeatureFlag(LD_FLAGS.checkoutVipBanner, DEFAULT_CHECKOUT_VIP_BANNER);
  const { value: ctaCopy } = useFeatureFlag(LD_FLAGS.vipUpgradeCtaCopy, 'Join VIP');

  const banner =
    typeof bannerJson === 'object' && bannerJson !== null
      ? { ...DEFAULT_CHECKOUT_VIP_BANNER, ...(bannerJson as Record<string, unknown>) }
      : DEFAULT_CHECKOUT_VIP_BANNER;

  const showUpsell =
    (!isIdentifiedUser(user) || user.memberTier !== 'vip') && (banner as { show?: boolean }).show !== false;

  const savingsPct = 18;

  const displayTotal = useMemo(() => {
    if (!isIdentifiedUser(user) || user.memberTier !== 'vip') {
      return cartSubtotal;
    }
    return lines.reduce((sum, l) => {
      const p = getProductById(l.productId);
      const unit = p?.memberPrice ?? l.unitPrice;
      return sum + unit * l.qty;
    }, 0);
  }, [user, lines, cartSubtotal]);

  const handleCheckout = () => {
    if (ldClient) {
      ldClient.track('checkout_initiated', { value: displayTotal });
    }
    closeCart();
  };

  return (
    <>
      <Backdrop $open={isOpen} onClick={closeCart} aria-hidden={!isOpen} />
      <Panel $open={isOpen} aria-hidden={!isOpen}>
        <Head>
          <Title>Your cart</Title>
          <CloseBtn type="button" onClick={closeCart} aria-label="Close cart">
            ×
          </CloseBtn>
        </Head>
        <Body>
          {lines.length === 0 ? (
            <p style={{ color: '#737373' }}>Your cart is empty.</p>
          ) : (
            lines.map((l) => {
              const p = getProductById(l.productId);
              const memberPrice = p?.memberPrice;
              const showMember = isIdentifiedUser(user) && user.memberTier === 'vip' && memberPrice != null;
              return (
                <Line key={`${l.productId}-${l.size}`}>
                  <div style={{ fontWeight: 600 }}>{l.name}</div>
                  <div style={{ color: '#a3a3a3', fontSize: '0.85rem' }}>
                    Size {l.size} × {l.qty}
                  </div>
                  <div style={{ marginTop: '0.35rem' }}>
                    {showMember ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: '#737373', marginRight: '0.5rem' }}>
                          ${(l.unitPrice * l.qty).toFixed(2)}
                        </span>
                        <span style={{ color: '#c8f000' }}>${((memberPrice ?? l.unitPrice) * l.qty).toFixed(2)} VIP</span>
                      </>
                    ) : (
                      <span>${(l.unitPrice * l.qty).toFixed(2)}</span>
                    )}
                  </div>
                  <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.8rem', color: '#a3a3a3' }}>Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => updateQty(l.productId, l.size, Number(e.target.value) || 1)}
                      style={{ width: '4rem', padding: '0.25rem' }}
                    />
                    <button type="button" className="secondary" style={{ fontSize: '0.75rem' }} onClick={() => removeLine(l.productId, l.size)}>
                      Remove
                    </button>
                  </div>
                </Line>
              );
            })
          )}
          {showUpsell && (
            <Upsell>
              <strong style={{ color: '#f5f5f5' }}>{String((banner as { headline?: string }).headline)}</strong>
              <p style={{ margin: '0.5rem 0', color: '#a3a3a3' }}>{String((banner as { subtext?: string }).subtext)}</p>
              <p style={{ margin: '0 0 0.5rem', color: '#c8f000' }}>
                Join VIP — save ~{savingsPct}% on this order
              </p>
              <button type="button" onClick={onJoinVip}>
                {String((banner as { cta?: string }).cta ?? ctaCopy)}
              </button>
            </Upsell>
          )}
        </Body>
        <Foot>
          <Total>
            <span>Subtotal</span>
            <span>${displayTotal.toFixed(2)}</span>
          </Total>
          <CheckoutBtn type="button" onClick={handleCheckout} disabled={lines.length === 0}>
            Checkout
          </CheckoutBtn>
        </Foot>
      </Panel>
    </>
  );
}
