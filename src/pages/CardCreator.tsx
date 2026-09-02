import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { toPng } from 'html-to-image';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { useUser } from '../context/UserContext';
import { useCart } from '../context/CartContext';
import { userToApiContext } from '../context/LDContext';
import { useTrackConversion } from '../hooks/useTrackConversion';
import type { Product } from '../components/Products/productData';
import {
  TogglemonCard,
  TOGGLEMON_TYPES,
  TYPE_COLORS,
  type TogglemonCard as TogglemonCardData,
} from '../components/Collectibles/TogglemonCard';

const PageContainer = styled.div`
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  box-sizing: border-box;
`;

const Title = styled.h1`
  font-size: clamp(2rem, 5vw, 3.25rem);
  margin: 0 0 0.35rem;
  text-align: center;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #a3a3a3;
  max-width: 520px;
  margin: 0 auto 2rem;
`;

const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const ResultArea = styled.div`
  min-height: 200px;
  display: grid;
  place-items: center;
`;

const TypeHint = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #a3a3a3;
  line-height: 1.5;
`;

const ResultColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

// Padding so html-to-image captures the card's drop shadow, not a clipped edge.
const CardCapture = styled.div`
  padding: 12px;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-wrap: wrap;
  justify-content: center;
`;

const Layout = styled.div`
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  margin-bottom: 2rem;
  @media (max-width: 760px) {
    flex-direction: column;
  }
`;

const FormColumn = styled.div`
  flex: 1.5;
  min-width: 0;
`;

const Guide = styled.aside`
  flex: 1;
  min-width: 240px;
  box-sizing: border-box;
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 1rem 1.1rem;
  @media (max-width: 760px) {
    width: 100%;
  }
`;

const GuideSection = styled.div`
  & + & {
    margin-top: 1.1rem;
    padding-top: 1.1rem;
    border-top: 1px solid #2a2a2a;
  }
`;

const GuideHeading = styled.h3`
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #737373;
  margin: 0 0 0.6rem;
`;

const TypeItem = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  font-size: 0.78rem;
  color: #a3a3a3;
`;

const Dot = styled.span<{ c: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => p.c};
  flex: 0 0 auto;
  position: relative;
  top: 1px;
`;

const TypeLabel = styled.span`
  font-weight: 700;
  color: #f5f5f5;
`;

const TipList = styled.ul`
  margin: 0;
  padding-left: 1.05rem;
  font-size: 0.78rem;
  color: #c4c4c4;
  line-height: 1.55;
`;

const ExampleButton = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  background: #1a1a1a;
  border: 1px dashed #3a3a3a;
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
  color: #a3a3a3;
  font-size: 0.76rem;
  font-style: italic;
  line-height: 1.45;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  &:hover:not(:disabled) {
    border-color: #c8f000;
    color: #e4e4e4;
  }
`;

const ExampleHint = styled.span`
  display: block;
  font-style: normal;
  font-size: 0.68rem;
  color: #737373;
  margin-top: 0.35rem;
`;

const EmptyCard = styled.div`
  width: 260px;
  min-height: 300px;
  border: 2px dashed #333;
  border-radius: 12px;
  display: grid;
  place-items: center;
  text-align: center;
  color: #666;
  font-size: 0.85rem;
  padding: 1.5rem;
  box-sizing: border-box;
`;

const PLACEHOLDER =
  'A shadowy electric-type with cracked glass wings and a glitch effect...';

/** One-line vibe for each supported type, shown in the guidance panel. */
const TYPE_BLURBS: Record<TogglemonCardData['type'], string> = {
  Fire: 'Blazing & aggressive — big damage',
  Water: 'Aquatic & steady — defensive',
  Electric: 'Fast & shocking — high energy',
  Shadow: 'Dark & stealthy — mysterious',
  Glitch: 'Digital & chaotic — unpredictable',
  Void: 'Cosmic & eerie — reality-bending',
};

const TIPS = [
  'Give it a name — or let us invent one.',
  'Hint at a type or vibe (fiery, aquatic, glitchy…).',
  'Describe 1–2 signature moves or powers.',
  'Add a touch of personality or backstory.',
  'Keep it friendly — spicy prompts get blocked. 😊',
];

const EXAMPLE_PROMPT =
  'A blue and green striped bumblebee doing an "I see what you did there" smirk. Its name is AaaBee, and it attacks with Painful Pun and Sarcastic Sting.';

/** Price for a custom Togglemon card added to the cart. */
const CUSTOM_CARD_PRICE = 12.99;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'togglemon';

// Rotating captions shown while a card is being generated (text + art).
const GEN_MESSAGES = [
  'Summoning your Togglemon…',
  'Rolling for rarity…',
  'Mixing the holo foil…',
  'Sharpening the signature moves…',
  'Balancing HP and weaknesses…',
  'Developing the artwork…',
  'Almost there — adding a little sparkle…',
];

const shimmer = keyframes`
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
`;

const GenWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
`;

// Card-shaped shimmering silhouette (roughly the TogglemonCard footprint) so the
// layout doesn't jump when the real card reveals.
const GenCard = styled.div`
  width: 240px;
  max-width: 100%;
  aspect-ratio: 5 / 7;
  border-radius: 14px;
  border: 1px solid #333;
  background: linear-gradient(
    110deg,
    #161616 25%,
    #232323 42%,
    #2f3312 50%,
    #232323 58%,
    #161616 75%
  );
  background-size: 220% 100%;
  animation: ${shimmer} 1.5s linear infinite;
  box-shadow: 0 0 28px rgba(200, 240, 0, 0.08);
`;

const GenCaption = styled.p`
  margin: 0;
  font-weight: 700;
  color: #c8f000;
  text-align: center;
  animation: ${pulse} 1.8s ease-in-out infinite;
`;

const GenSub = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: #737373;
  text-align: center;
`;

function GeneratingPlaceholder() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % GEN_MESSAGES.length), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <GenWrap>
      <GenCard aria-hidden />
      <GenCaption role="status" aria-live="polite">
        {GEN_MESSAGES[i]}
      </GenCaption>
      <GenSub>Generating your one-of-a-kind card — this can take a few seconds.</GenSub>
    </GenWrap>
  );
}

export default function CardCreator() {
  const { value: showCardCreator, isLoading: isLoadingFlag } = useFeatureFlag(
    LD_FLAGS.showCardCreator,
    false,
  );
  const { user, sessionKey } = useUser();
  const { addItem } = useCart();
  const { trackConversion } = useTrackConversion();
  const cardRef = useRef<HTMLDivElement>(null);

  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<TogglemonCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  if (isLoadingFlag) {
    return (
      <PageContainer>
        <ResultArea>
          <CircularProgress />
        </ResultArea>
      </PageContainer>
    );
  }

  if (!showCardCreator) {
    return <Navigate to="/collectibles" replace />;
  }

  // Generate art from the card's imagePrompt. Fails gracefully — returns null so
  // the card can still reveal, falling back to the prompt text. A client-side
  // timeout guarantees a stalled request can never block the reveal forever.
  const generateArt = async (prompt: string): Promise<string | null> => {
    if (!prompt) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const res = await fetch('/api/card-creator/art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePrompt: prompt }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Surface WHY art failed (status + server detail) so sporadic
        // fallbacks are diagnosable from the browser console.
        const data = await res.json().catch(() => ({}));
        console.warn(
          `[card art] failed (${res.status}):`,
          (data as { detail?: string; error?: string }).detail ??
            (data as { error?: string }).error ??
            '(no detail)',
        );
        return null;
      }
      const data = (await res.json()) as { imageUrl?: string };
      if (data.imageUrl) return data.imageUrl;
      console.warn('[card art] response had no imageUrl');
      return null;
    } catch (e) {
      console.warn('[card art] request error:', e);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleGenerate = async () => {
    const trimmed = description.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setImageUrl(null);

    try {
      const res = await fetch('/api/card-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: trimmed,
          userContext: userToApiContext(user),
          sessionKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong generating your card. Please try again.');
        return;
      }

      const card = (await res.json()) as TogglemonCardData;
      // Wait for the art (or its failure/timeout) BEFORE revealing, so the whole
      // card — name, moves, art, all of it — appears at once as a surprise. On art
      // failure the card still reveals, falling back to the prompt-text art box.
      const art = await generateArt(card.imagePrompt);
      setImageUrl(art);
      setResult(card);
    } catch {
      setError("Sorry, I'm having trouble connecting. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Add the generated card to the cart as a custom collectible, firing the
  // same add_to_cart conversion as the rest of the shop.
  const handleAddToCart = () => {
    if (!result) return;
    const id = `togglemon-${slugify(result.name)}-${Date.now()}`;
    const cardProduct: Product = {
      id,
      name: `Custom Togglemon: ${result.name}`,
      brand: 'DarkTrainers',
      category: 'collectibles',
      colorway: result.type,
      price: CUSTOM_CARD_PRICE,
      memberPrice: CUSTOM_CARD_PRICE,
      isDropExclusive: false,
      releaseDate: '',
      sizes: [],
      imageUrl: imageUrl ?? '',
      description: result.flavorText,
      tags: ['custom', 'togglemon'],
    };
    addItem(cardProduct, 0);
    trackConversion('add_to_cart', { value: CUSTOM_CARD_PRICE, productId: id });
  };

  // Snapshot the rendered card to a PNG the user can download and share.
  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        // Drop the holo foil overlays: html-to-image can't reproduce their
        // mix-blend-mode, so they'd export flat/washed out. The exported card
        // stays clean and readable (still shows the Holo Rare badge + art).
        filter: (node) =>
          !(node instanceof HTMLElement && node.classList.contains('holo-foil')),
      });
      const link = document.createElement('a');
      link.download = `${slugify(result?.name ?? 'togglemon')}-card.png`;
      link.href = dataUrl;
      link.click();

      // Conversion signal for experiments (alongside add_to_cart).
      trackConversion('card_downloaded');
    } catch (e) {
      console.error('[CardCreator] Download failed:', e);
    }
  };

  return (
    <PageContainer>
      <Title className="font-display">Togglemon Card Creator</Title>
      <Subtitle>Describe your Togglemon and watch it come to life</Subtitle>

      <Layout>
        <FormColumn>
          <Form>
            <TextField
              label="Describe your Togglemon"
              placeholder={PLACEHOLDER}
              multiline
              rows={3}
              fullWidth
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isGenerating}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#f5f5f5',
                  backgroundColor: '#1a1a1a',
                  '& fieldset': { borderColor: '#333' },
                  '&:hover fieldset': { borderColor: '#555' },
                  '&.Mui-focused fieldset': { borderColor: '#c8f000' },
                },
                '& .MuiInputLabel-root': { color: '#a3a3a3' },
                '& .MuiInputLabel-root.Mui-focused': { color: '#c8f000' },
                '& .MuiInputBase-input::placeholder': { color: '#777', opacity: 1 },
              }}
            />
            <TypeHint>
              Every card gets a name, HP, rarity, and two moves — we'll pick the closest type to
              your description.
            </TypeHint>
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={isGenerating || !description.trim()}
            >
              Generate Card
            </Button>
          </Form>

          <ResultArea>
            {isGenerating && <GeneratingPlaceholder />}
            {!isGenerating && error && <Alert severity="error">{error}</Alert>}
            {!isGenerating && !error && result && (
              <ResultColumn>
                <CardCapture ref={cardRef}>
                  <TogglemonCard card={result} imageUrl={imageUrl} />
                </CardCapture>
                <Actions>
                  <Button variant="contained" onClick={handleAddToCart}>
                    Add to Cart — ${CUSTOM_CARD_PRICE.toFixed(2)}
                  </Button>
                  <Button variant="outlined" onClick={handleDownload}>
                    Download card
                  </Button>
                </Actions>
              </ResultColumn>
            )}
            {!isGenerating && !error && !result && (
              <EmptyCard>✨ Your Togglemon card will appear here — describe a creature and hit Generate.</EmptyCard>
            )}
          </ResultArea>
        </FormColumn>

        <Guide>
          <GuideSection>
            <GuideHeading>Types</GuideHeading>
            {TOGGLEMON_TYPES.map((t) => (
              <TypeItem key={t}>
                <Dot c={TYPE_COLORS[t]} />
                <span>
                  <TypeLabel>{t}</TypeLabel> — {TYPE_BLURBS[t]}
                </span>
              </TypeItem>
            ))}
          </GuideSection>

          <GuideSection>
            <GuideHeading>Tips for a great card</GuideHeading>
            <TipList>
              {TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </TipList>
          </GuideSection>

          <GuideSection>
            <GuideHeading>Try an example</GuideHeading>
            <ExampleButton
              type="button"
              onClick={() => setDescription(EXAMPLE_PROMPT)}
              disabled={isGenerating}
            >
              “{EXAMPLE_PROMPT}”
              <ExampleHint>Click to use this description →</ExampleHint>
            </ExampleButton>
          </GuideSection>
        </Guide>
      </Layout>
    </PageContainer>
  );
}
