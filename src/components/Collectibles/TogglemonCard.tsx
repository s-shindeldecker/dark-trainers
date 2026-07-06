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
  /** Optional label shown as a ribbon for special-edition cards. */
  edition?: string;
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

export const TYPE_COLORS: Record<TogglemonCard['type'], string> = {
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

const CardShell = styled.div<{ holo?: boolean }>`
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
  position: relative;
  ${(p) =>
    p.holo &&
    `
    border-color: transparent;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35),
      0 0 0 2px rgba(255, 255, 255, 0.55),
      0 0 22px rgba(130, 80, 255, 0.45);
  `}
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

const EditionBanner = styled.div`
  background: linear-gradient(90deg, #ff8a3c, #ffcc33, #ff9a3c);
  color: #5a3200;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: center;
  padding: 3px 6px;
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

// --- Holographic (foil) treatment for Holo Rare / Ultra Rare cards ---

const holoShift = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`;

const glareSweep = keyframes`
  0% { transform: translateX(-60%) rotate(12deg); opacity: 0; }
  12% { opacity: 0.9; }
  55% { transform: translateX(360%) rotate(12deg); opacity: 0; }
  100% { transform: translateX(360%) rotate(12deg); opacity: 0; }
`;

/** Animated prismatic rainbow foil covering the whole card. */
const HoloSheen = styled.div`
  position: absolute;
  inset: 0;
  border-radius: 8px;
  pointer-events: none;
  z-index: 3;
  background: linear-gradient(
    115deg,
    rgba(255, 0, 153, 0.5),
    rgba(255, 153, 0, 0.5),
    rgba(230, 255, 0, 0.5),
    rgba(0, 255, 140, 0.5),
    rgba(0, 200, 255, 0.5),
    rgba(150, 0, 255, 0.5),
    rgba(255, 0, 153, 0.5)
  );
  background-size: 200% 200%;
  mix-blend-mode: color-dodge;
  opacity: 0.55;
  animation: ${holoShift} 5s linear infinite;
`;

/** A bright shine bar that sweeps diagonally across the card. */
const HoloGlare = styled.div`
  position: absolute;
  top: -25%;
  left: -20%;
  width: 30%;
  height: 150%;
  pointer-events: none;
  z-index: 4;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.85),
    transparent
  );
  filter: blur(3px);
  mix-blend-mode: soft-light;
  animation: ${glareSweep} 4.5s ease-in-out infinite;
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
  const holo = card.rarity === 'Holo Rare' || card.rarity === 'Ultra Rare';

  return (
    <CardShell holo={holo}>
      <Header bg={bg} fg={fg}>
        <CardName>{card.name}</CardName>
        <CardHp>HP {card.hp}</CardHp>
      </Header>

      {card.edition && <EditionBanner>{card.edition}</EditionBanner>}

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

      {holo && (
        <>
          {/* className lets the PNG export drop these — html-to-image can't
              reproduce mix-blend-mode, so they'd render flat/washed out. */}
          <HoloSheen className="holo-foil" />
          <HoloGlare className="holo-foil" />
        </>
      )}
    </CardShell>
  );
}
