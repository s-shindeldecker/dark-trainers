import styled from '@emotion/styled';

/**
 * Card-shaped placeholders for the PLP grid while a server-side search is in
 * flight. Anti-flicker is a repo convention: the grid must never flash the old
 * (or default) result set while new results are on the wire.
 */

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  width: 100%;
`;

const CardSkeleton = styled.div`
  height: 420px;
  border-radius: 10px;
  border: 1px solid #2a2a2a;
  background: linear-gradient(90deg, #111 25%, #1c1c1c 50%, #111 75%);
  background-size: 200% 100%;
  animation: plp-search-loading 1.5s infinite;

  @keyframes plp-search-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Grid aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </Grid>
  );
}
