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

const FromLabel = styled.span`
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #737373;
`;

const MoreColors = styled.p`
  margin: -0.3rem 0 0.55rem;
  font-size: 0.75rem;
  color: #c8f000;
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
  /** Route prefix for the card CTA (e.g. '/products' or '/collectibles'). */
  linkBase?: string;
  /**
   * Fired when the visitor clicks through to the PDP. Optional: the default
   * catalog grid passes nothing, while the PLP search results pass a handler
   * that tracks `search_result_clicked`. Navigation happens either way.
   */
  onSelect?: (product: Product) => void;
  /**
   * Drop-access entitlement, resolved by the caller. `false` is the `view-only`
   * state: show the product, block the purchase.
   *
   * Passed in rather than resolved here because the two call sites learn it from
   * different places — the grid maps the client's `ac26-drop-access` read, while
   * a search result carries the server's own `_purchasable`. Resolving it inside
   * this component would mean the search card silently re-deriving entitlement
   * from a client flag read that can disagree with what the server returned.
   *
   * Defaults to `true` so callers with no entitlement concept (e.g. the
   * collectibles grid) are unaffected.
   */
  purchasable?: boolean;
  /**
   * Set when this card stands for a product *line* rather than a single SKU —
   * i.e. several models share one photograph. Renders the line name, a model
   * count, and a "from" price, and links to the cheapest member (the product
   * that price refers to).
   *
   * Absent for ordinary one-SKU cards, which is every card the collectibles
   * grid and the search results render.
   */
  line?: {
    name: string;
    modelCount: number;
    priceFrom: number;
    memberPriceFrom: number;
  };
  /**
   * Search results only: the other members of this SKU's product line that
   * matched the same query. The card still IS `product` (its name, price,
   * CTA and click target all belong to the SKU the arm ranked highest); this
   * just adds a "+N more colors" note so the collapsed siblings aren't lost.
   */
  variants?: Array<{ id: string; name: string; subtitle?: string; colorway: string }>;
}

export function ProductCard({
  product,
  linkBase = '/products',
  onSelect,
  purchasable = true,
  line,
  variants,
}: ProductCardProps) {
  const { value: showVipPricing } = useFeatureFlag(LD_FLAGS.showVipPricing, false);
  const { value: showDropToNonVip } = useFeatureFlag(LD_FLAGS.showDropExclusiveProducts, false);
  const { user } = useUser();

  const isVip = isIdentifiedUser(user) && user.memberTier === 'vip';
  // The `view-only` drop-access state: the resolver has already decided this
  // visitor may see the product but not buy it.
  //
  // Checked FIRST, and this ordering is load-bearing. `show-drop-exclusive-products`
  // serves false to every non-VIP, and a VIP gets ac26-drop-access=full-access, so
  // evaluating `lockedDrop` first made it true for the entire early-access audience
  // — shadowing this branch completely and showing the older "upgrade to view" copy
  // to people who can already see the product. Drop access is the more specific
  // signal, so it wins.
  const viewOnly = !purchasable;
  // Older, broader gate, independent of ac26-drop-access: a non-VIP seeing a
  // drop-exclusive SKU only because `show-drop-exclusive-products` is on. Only
  // consulted when drop access hasn't already blocked the purchase.
  const lockedDrop = !viewOnly && product.isDropExclusive && !isVip && !showDropToNonVip;
  // A line card only exists when several models share one photo; a one-model
  // "line" is just an ordinary card and the caller omits the prop.
  const isLine = Boolean(line && line.modelCount > 1);

  return (
    <Card>
      <Img src={product.imageUrl} alt="" width={800} height={800} loading="lazy" />
      <Body>
        <Cat>{product.category}</Cat>
        <Name className="font-display">{isLine ? line!.name : product.name}</Name>
        <Colorway>{isLine ? `${line!.modelCount} models` : product.colorway}</Colorway>
        {!isLine && variants && variants.length > 0 && (
          <MoreColors
            title={variants
              .map((v) => `${v.name}${v.subtitle ? ` ${v.subtitle}` : ''} (${v.colorway})`)
              .join('\n')}
          >
            +{variants.length} more {variants.length === 1 ? 'color' : 'colors'}
          </MoreColors>
        )}
        {product.isDropExclusive && <Badge style={{ marginBottom: '0.35rem', alignSelf: 'flex-start' }}>Drop</Badge>}
        <PriceRow>
          {isLine && <FromLabel>from</FromLabel>}
          {showVipPricing ? (
            <>
              <Strike>${isLine ? line!.priceFrom : product.price}</Strike>
              <MemberPrice>${isLine ? line!.memberPriceFrom : product.memberPrice}</MemberPrice>
            </>
          ) : (
            <Price>${isLine ? line!.priceFrom : product.price}</Price>
          )}
        </PriceRow>
        {viewOnly ? (
          <Locked>VIP early access — upgrade to purchase this drop.</Locked>
        ) : lockedDrop ? (
          <Locked>VIP early access — sign in as VIP or upgrade to view.</Locked>
        ) : (
          <Cta to={`${linkBase}/${product.id}`} onClick={() => onSelect?.(product)}>
            {isLine ? 'Shop the line' : 'View drop'}
          </Cta>
        )}
      </Body>
    </Card>
  );
}
