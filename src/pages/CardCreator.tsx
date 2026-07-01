import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import styled from '@emotion/styled';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { useUser } from '../context/UserContext';
import { userToApiContext } from '../context/LDContext';
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

const PLACEHOLDER =
  'A shadowy electric-type with cracked glass wings and a glitch effect...';

export default function CardCreator() {
  const { value: showCardCreator, isLoading: isLoadingFlag } = useFeatureFlag(
    LD_FLAGS.showCardCreator,
    false,
  );
  const { user } = useUser();

  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<TogglemonCardData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleGenerate = async () => {
    const trimmed = description.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/card-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: trimmed,
          userContext: userToApiContext(user),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong generating your card. Please try again.');
        return;
      }

      const card = (await res.json()) as TogglemonCardData;
      setResult(card);
    } catch {
      setError("Sorry, I'm having trouble connecting. Please try again.");
    } finally {
      setIsGenerating(false);
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
        {!isGenerating && !error && result && <TogglemonCard card={result} />}
      </ResultArea>
    </PageContainer>
  );
}
