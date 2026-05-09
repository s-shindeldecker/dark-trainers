import styled from '@emotion/styled';
import type { MemberTier } from '../../types/darktrainers';

const Badge = styled.span<{ $tier: MemberTier }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-family: 'DM Sans', sans-serif;
  ${({ $tier }) =>
    $tier === 'vip'
      ? `
    background: linear-gradient(135deg, #c8f000 0%, #9db800 100%);
    color: #0d0d0d;
    box-shadow: 0 0 12px rgba(200, 240, 0, 0.35);
  `
      : `
    background: #2a2a2a;
    color: #d4d4d4;
    border: 1px solid #404040;
  `}
`;

interface MemberBadgeProps {
  tier: MemberTier;
}

export function MemberBadge({ tier }: MemberBadgeProps) {
  return <Badge $tier={tier}>{tier === 'vip' ? 'VIP' : 'Member'}</Badge>;
}
