import styled from '@emotion/styled';
import type { SearchLabItem } from '../../lib/searchLabApi';
import { LAB } from './palette';

const Card = styled.button`
  display: block;
  width: 100%;
  padding: 0.9rem 1rem;
  font: inherit;
  text-align: left;
  color: inherit;
  background: ${LAB.surface};
  border: 1px solid ${LAB.border};
  border-radius: 12px;
  cursor: pointer;
  &:hover {
    border-color: ${LAB.accent};
  }
  &:focus-visible {
    outline: none;
    border-color: ${LAB.accent};
    box-shadow: 0 0 0 3px ${LAB.accentSoft};
  }
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
`;

const Name = styled.span`
  display: block;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: ${LAB.ink};
`;

const Hint = styled.span`
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: ${LAB.accent};
`;

const KindBadge = styled.span`
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: capitalize;
  color: ${LAB.accent};
  background: ${LAB.accentSoft};
  border-radius: 999px;
`;

const Area = styled.span`
  display: block;
  margin: 0.2rem 0 0.5rem;
  font-size: 0.82rem;
  color: ${LAB.inkMuted};
`;

const Description = styled.span`
  display: block;
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: ${LAB.ink};
`;

interface ResultCardProps {
  item: SearchLabItem;
  expanded: boolean;
  onToggle: () => void;
}

/** A result; clicking it expands or collapses the description. */
export function ResultCard({ item, expanded, onToggle }: ResultCardProps) {
  return (
    <Card type="button" aria-expanded={expanded} onClick={onToggle}>
      <Head>
        <Name>{item.name}</Name>
        <KindBadge>{item.kind.replace(/-/g, ' ')}</KindBadge>
      </Head>
      <Area>{item.area}</Area>
      {expanded ? (
        <Description>{item.description}</Description>
      ) : (
        <Hint>Show details</Hint>
      )}
    </Card>
  );
}
