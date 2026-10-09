import styled from '@emotion/styled';
import { LAB } from './palette';

const Card = styled.div`
  padding: 1rem;
  background: ${LAB.surfaceMuted};
  border: 1px dashed ${LAB.border};
  border-radius: 12px;
  text-align: center;
`;

const Title = styled.p`
  margin: 0 0 0.35rem;
  font-weight: 600;
  color: ${LAB.ink};
`;

const Message = styled.p`
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: ${LAB.inkMuted};
`;

/** Shown instead of result cards when the server reports `declined: true`. */
export function DeclineCard({ message }: { message: string | null }) {
  return (
    <Card role="status">
      <Title>No results</Title>
      <Message>{message ?? "We couldn't find anything matching that search."}</Message>
    </Card>
  );
}
