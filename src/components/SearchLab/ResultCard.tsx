import styled from '@emotion/styled';
import type { SearchLabItem } from '../../lib/searchLabApi';
import { LAB } from './palette';

const Card = styled.article`
  padding: 0.9rem 1rem;
  background: ${LAB.surface};
  border: 1px solid ${LAB.border};
  border-radius: 12px;
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
`;

const Name = styled.h2`
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: ${LAB.ink};
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

const Area = styled.p`
  margin: 0.2rem 0 0.5rem;
  font-size: 0.82rem;
  color: ${LAB.inkMuted};
`;

const Description = styled.p`
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: ${LAB.ink};
`;

export function ResultCard({ item }: { item: SearchLabItem }) {
  return (
    <Card>
      <Head>
        <Name>{item.name}</Name>
        <KindBadge>{item.kind.replace(/-/g, ' ')}</KindBadge>
      </Head>
      <Area>{item.area}</Area>
      <Description>{item.description}</Description>
    </Card>
  );
}
