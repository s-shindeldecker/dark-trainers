import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { useLDClient } from 'launchdarkly-react-client-sdk';
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
import { pushToDataLayer } from '../lib/gtmStub';
import type { Product } from '../components/Products/productData';
import {
  TogglemonCard,
  TOGGLEMON_TYPES,
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

const TypeName = styled.span`
  color: #c8f000;
  font-weight: 600;
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

const PLACEHOLDER =
  'A shadowy electric-type with cracked glass wings and a glitch effect...';

/** Price for a custom Togglemon card added to the cart. */
const CUSTOM_CARD_PRICE = 12.99;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'togglemon';

export default function CardCreator() {
  const { value: showCardCreator, isLoading: isLoadingFlag } = useFeatureFlag(
    LD_FLAGS.showCardCreator,
    false,
  );
  const { value: trackViaGtm } = useFeatureFlag(LD_FLAGS.trackConversionsViaGtm, false);
  const { user, sessionKey } = useUser();
  const { addItem } = useCart();
  const ldClient = useLDClient();
  const cardRef = useRef<HTMLDivElement>(null);

  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<TogglemonCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [artLoading, setArtLoading] = useState(false);

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

  // Generate art from the card's imagePrompt. Fails gracefully — the card
  // just falls back to showing the prompt text if this errors out.
  const generateArt = async (prompt: string) => {
    if (!prompt) return;
    setArtLoading(true);
    try {
      const res = await fetch('/api/card-creator/art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePrompt: prompt }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { imageUrl?: string };
      if (data.imageUrl) setImageUrl(data.imageUrl);
    } catch {
      // swallow — graceful fallback to the prompt text on the card
    } finally {
      setArtLoading(false);
    }
  };

  const handleGenerate = async () => {
    const trimmed = description.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setImageUrl(null);
    setArtLoading(false);

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
      setResult(card);
      // Card text is shown immediately; art loads into the box afterward.
      void generateArt(card.imagePrompt);
    } catch {
      setError("Sorry, I'm having trouble connecting. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Route a conversion either through the GTM dataLayer (flag on — GTM's
  // Custom HTML tag forwards it to LD) or straight to LD (flag off). Either/or,
  // so conversions are never double-counted.
  const trackConversion = (eventKey: string, opts?: { value?: number; productId?: string }) => {
    if (trackViaGtm) {
      pushToDataLayer({ event: 'ld_conversion', eventKey, ...opts });
    } else {
      ldClient?.track(eventKey, null, opts?.value);
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
          Every card gets a name, HP, rarity, and two moves. Supported types:{' '}
          {TOGGLEMON_TYPES.map((type, i) => (
            <span key={type}>
              <TypeName>{type}</TypeName>
              {i < TOGGLEMON_TYPES.length - 1 ? ' · ' : ''}
            </span>
          ))}
          . We'll pick the closest match to your description.
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
        {isGenerating && <CircularProgress />}
        {!isGenerating && error && <Alert severity="error">{error}</Alert>}
        {!isGenerating && !error && result && (
          <ResultColumn>
            <CardCapture ref={cardRef}>
              <TogglemonCard card={result} imageUrl={imageUrl} artLoading={artLoading} />
            </CardCapture>
            <Actions>
              <Button variant="contained" onClick={handleAddToCart}>
                Add to Cart — ${CUSTOM_CARD_PRICE.toFixed(2)}
              </Button>
              <Button variant="outlined" onClick={handleDownload} disabled={artLoading}>
                Download card
              </Button>
            </Actions>
          </ResultColumn>
        )}
      </ResultArea>
    </PageContainer>
  );
}
