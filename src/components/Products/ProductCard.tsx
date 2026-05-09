import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import type { Product } from './productData';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { LD_FLAGS } from '../../lib/ldFlagKeys';
import { useUser } from '../../context/UserContext';
import { isIdentifiedUser } from '../../types/darktrainers';

const Card = styled.article`
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  transition: border-color 0.2s, transform 0.2s;
  &:hover {
    border-color: #444;
    transform: translateY(-2px);
  }
`;

const Img = styled.img`
  display: block;
  width: 100%;
  height: 280px;
  object-fit: cover;
  object-position: center;
  background: #0d0d0d;
`;

const Body = styled.div`
  padding: 0.85rem 1rem 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const Cat = styled.span`
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #c8f000;
`;

const Name = styled.h2`
  margin: 0.3rem 0 0.2rem;
  font-size: 1.1rem;
  line-height: 1.15;
`;

const Colorway = styled.p`
  margin: 0 0 0.55rem;
  font-size: 0.8rem;
  color: #a3a3a3;
`;

const PriceRow = styled.div`
  margin-top: auto;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Price = styled.span`
  font-size: 1.15rem;
  font-weight: 700;
`;

const MemberPrice = styled.span`
  font-size: 1rem;
  font-weight: 700;
  color: #c8f000;
`;

const Strike = styled.span`
  text-decoration: line-through;
  color: #737373;
  font-size: 0.85rem;
`;

const Badge = styled.span`
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  background: #2a2a2a;
  color: #d4d4d4;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
`;

const Cta = styled(Link)`
  display: block;
  text-align: center;
  margin-top: 0.65rem;
  padding: 0.55em 0.65em;
  font-size: 0.9rem;
  background: #c8f000;
  color: #0d0d0d;
  font-weight: 700;
  border-radius: 8px;
  text-decoration: none;
  &:hover {
    filter: brightness(1.05);
  }
`;

const Locked = styled.div`
  margin-top: 0.65rem;
  padding: 0.55em 0.65em;
  text-align: center;
  background: #1a1a1a;
  color: #a3a3a3;
  border-radius: 8px;
  font-size: 0.8rem;
  border: 1px dashed #444;
`;

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { value: showVipPricing } = useFeatureFlag(LD_FLAGS.showVipPricing, false);
  const { value: showDropToNonVip } = useFeatureFlag(LD_FLAGS.showDropExclusiveProducts, false);
  const { user } = useUser();

  const isVip = isIdentifiedUser(user) && user.memberTier === 'vip';
  const lockedDrop = product.isDropExclusive && !isVip && !showDropToNonVip;

  return (
    <Card>
      <Img src={product.imageUrl} alt="" width={800} height={800} loading="lazy" />
      <Body>
        <Cat>{product.category}</Cat>
        <Name className="font-display">{product.name}</Name>
        <Colorway>{product.colorway}</Colorway>
        {product.isDropExclusive && <Badge style={{ marginBottom: '0.35rem', alignSelf: 'flex-start' }}>Drop</Badge>}
        <PriceRow>
          {showVipPricing ? (
            <>
              <Strike>${product.price}</Strike>
              <MemberPrice>${product.memberPrice}</MemberPrice>
            </>
          ) : (
            <Price>${product.price}</Price>
          )}
        </PriceRow>
        {lockedDrop ? (
          <Locked>VIP early access — sign in as VIP or upgrade to view.</Locked>
        ) : (
          <Cta to={`/products/${product.id}`}>View drop</Cta>
        )}
      </Body>
    </Card>
  );
}
