import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

export interface TogglemonCard {
  name: string;
  type: 'Fire' | 'Water' | 'Electric' | 'Shadow' | 'Glitch' | 'Void';
  hp: number;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Holo Rare' | 'Ultra Rare';
  moves: Array<{ name: string; damage: number; description: string }>;
  weakness: string;
  resistance: string;
  flavorText: string;
  imagePrompt: string;
}

/** The six Togglemon types the creator supports (also the keys of TYPE_COLORS). */
export const TOGGLEMON_TYPES: ReadonlyArray<TogglemonCard['type']> = [
  'Fire',
  'Water',
  'Electric',
  'Shadow',
  'Glitch',
  'Void',
];

const TYPE_COLORS: Record<TogglemonCard['type'], string> = {
  Fire: '#E25822',
  Water: '#4A90D9',
  Electric: '#F5C518',
  Shadow: '#6B4C9A',
  Glitch: '#00FF88',
  Void: '#1A1A2E',
};

function headerTextColor(type: TogglemonCard['type']): string {
  return type === 'Electric' || type === 'Glitch' ? '#1a1a1a' : '#ffffff';
}

const CardShell = styled.div`
  width: 260px;
  min-height: 380px;
  border-radius: 8px;
  background: #ffffff;
  color: #1a1a1a;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  border: 1px solid #d9d9d9;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  font-family: inherit;
`;

const Header = styled.div<{ bg: string; fg: string }>`
  background: ${(p) => p.bg};
  color: ${(p) => p.fg};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  font-weight: 700;
`;

const CardName = styled.span`
  font-size: 0.95rem;
  line-height: 1.1;
`;

const CardHp = styled.span`
  font-size: 0.9rem;
  white-space: nowrap;
`;

const ArtWrap = styled.div`
  padding: 0.5rem 0.75rem 0.25rem;
`;

const ArtLabel = styled.div`
  font-size: 9px;
  color: #999;
  margin-bottom: 2px;
`;

const ArtBox = styled.div<{ noPad?: boolean }>`
  width: 230px;
  height: 150px;
  background: #f0f0f0;
  border: 2px solid #ccc;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: ${(p) => (p.noPad ? '0' : '0.5rem')};
  box-sizing: border-box;
  overflow: hidden;
`;

const ArtImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid #ddd;
  border-top-color: #888;
  animation: ${spin} 0.8s linear infinite;
`;

const ArtPrompt = styled.span`
  font-size: 10px;
  font-style: italic;
  color: #888;
`;

const PillRow = styled.div`
  display: flex;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem 0.25rem;
`;

const Pill = styled.span<{ bg: string; fg: string }>`
  background: ${(p) => p.bg};
  color: ${(p) => p.fg};
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
`;

const Moves = styled.div`
  padding: 0.25rem 0.75rem;
  flex: 1;
`;

const Move = styled.div`
  & + & {
    border-top: 1px solid #eee;
    margin-top: 0.35rem;
    padding-top: 0.35rem;
  }
`;

const MoveHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const MoveName = styled.span`
  font-weight: 700;
  font-size: 0.8rem;
`;

const MoveDamage = styled.span`
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
`;

const MoveDesc = styled.p`
  margin: 0.1rem 0 0;
  font-size: 0.65rem;
  color: #666;
  line-height: 1.25;
`;

const Footer = styled.div`
  border-top: 1px solid #eee;
  padding: 0.4rem 0.75rem 0.6rem;
`;

const WeakResist = styled.div`
  display: flex;
  gap: 0.75rem;
  font-size: 0.62rem;
  color: #444;
`;

const Flavor = styled.p`
  margin: 0.25rem 0 0;
  font-size: 0.62rem;
  font-style: italic;
  color: #777;
  line-height: 1.25;
`;

export function TogglemonCard({
  card,
  imageUrl,
  artLoading = false,
}: {
  card: TogglemonCard;
  imageUrl?: string | null;
  artLoading?: boolean;
}) {
  const bg = TYPE_COLORS[card.type] ?? '#1A1A2E';
  const fg = headerTextColor(card.type);

  return (
    <CardShell>
      <Header bg={bg} fg={fg}>
        <CardName>{card.name}</CardName>
        <CardHp>HP {card.hp}</CardHp>
      </Header>

      <ArtWrap>
        {artLoading ? (
          <>
            <ArtLabel>Generating art…</ArtLabel>
            <ArtBox>
              <Spinner />
            </ArtBox>
          </>
        ) : imageUrl ? (
          <ArtBox noPad>
            <ArtImage src={imageUrl} alt={card.name} />
          </ArtBox>
        ) : (
          <>
            <ArtLabel>Art prompt</ArtLabel>
            <ArtBox>
              <ArtPrompt>{card.imagePrompt}</ArtPrompt>
            </ArtBox>
          </>
        )}
      </ArtWrap>

      <PillRow>
        <Pill bg={bg} fg={fg}>
          {card.type}
        </Pill>
        <Pill bg="#e8e8e8" fg="#1a1a1a">
          {card.rarity}
        </Pill>
      </PillRow>

      <Moves>
        {card.moves.slice(0, 2).map((move, i) => (
          <Move key={i}>
            <MoveHead>
              <MoveName>{move.name}</MoveName>
              <MoveDamage>{move.damage} dmg</MoveDamage>
            </MoveHead>
            <MoveDesc>{move.description}</MoveDesc>
          </Move>
        ))}
      </Moves>

      <Footer>
        <WeakResist>
          <span>Weakness: {card.weakness}</span>
          <span>Resistance: {card.resistance}</span>
        </WeakResist>
        <Flavor>{card.flavorText}</Flavor>
      </Footer>
    </CardShell>
  );
}
