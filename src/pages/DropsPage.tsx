import { Button, Chip, Container, Stack, Typography } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { products, type Product } from '../components/Products/productData';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';

const DROP_IDS = [
  'volt-hi-ac26-magenta',
  'volt-hi-ac26-purple-wave',
  'volt-hi-ac26-full-campaign',
  'apex-low-ac26-monstar',
  'apex-low-ac26-albert',
] as const;

type DropAccess = 'teaser' | 'early-access' | 'full-access';

const VALID_ACCESS: readonly DropAccess[] = ['teaser', 'early-access', 'full-access'];
const TEASER_DROP_DATE = '2026-05-22T00:00:00';

const AC26_PRODUCTS = DROP_IDS.map((id) => products.find((product) => product.id === id)).filter(
  (product): product is Product => Boolean(product)
);

const PageShell = styled('div')(({ theme }) => ({
  position: 'relative',
  minHeight: '100%',
  padding: theme.spacing(3, 0, 8),
  background:
    'radial-gradient(circle at top right, rgba(200, 240, 0, 0.15), transparent 30%), linear-gradient(180deg, #030403 0%, #090a08 26%, #050505 100%)',
  overflow: 'hidden',
}));

const HeroSection = styled('section')(({ theme }) => ({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 0.8fr)',
  gap: theme.spacing(3),
  padding: theme.spacing(4, 4, 4.5),
  marginBottom: theme.spacing(3),
  borderRadius: 28,
  border: `1px solid ${alpha('#C8F000', 0.18)}`,
  background: `linear-gradient(145deg, ${alpha('#C8F000', 0.08)} 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0.01) 100%)`,
  boxShadow: `0 24px 80px ${alpha('#000000', 0.45)}`,
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
    padding: theme.spacing(3),
  },
}));

const HeroMeta = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(1.5),
}));

const HeroRail = styled('aside')(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(1.5),
  alignContent: 'start',
}));

const RailCard = styled('div')(({ theme }) => ({
  padding: theme.spacing(2),
  borderRadius: 20,
  border: `1px solid ${alpha('#FFFFFF', 0.08)}`,
  background: `linear-gradient(180deg, ${alpha('#FFFFFF', 0.03)} 0%, rgba(255,255,255,0.015) 100%)`,
  backdropFilter: 'blur(12px)',
}));

const EditorialGrid = styled('section')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  gap: theme.spacing(2),
  alignItems: 'stretch',
  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
  },
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
  },
}));

const FeedCard = styled('article', {
  shouldForwardProp: (prop) => prop !== '$slot',
})<{ $slot: number }>(({ theme, $slot }) => {
  const layout = [
    { gridColumn: 'span 7', mediaHeight: 420 },
    { gridColumn: 'span 5', mediaHeight: 360 },
    { gridColumn: 'span 5', mediaHeight: 320 },
    { gridColumn: 'span 4', mediaHeight: 300 },
    { gridColumn: 'span 8', mediaHeight: 340 },
  ][$slot] ?? { gridColumn: 'span 6', mediaHeight: 320 };

  return {
    display: 'grid',
    gridColumn: layout.gridColumn,
    gridTemplateRows: `${layout.mediaHeight}px auto`,
    borderRadius: 26,
    overflow: 'hidden',
    border: `1px solid ${alpha('#FFFFFF', 0.08)}`,
    background: `linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,1) 100%)`,
    boxShadow: `0 20px 60px ${alpha('#000000', 0.28)}`,
    [theme.breakpoints.down('lg')]: {
      gridColumn: 'span 3',
      gridTemplateRows: `${$slot === 0 ? 380 : 320}px auto`,
    },
    [theme.breakpoints.down('md')]: {
      gridColumn: '1 / -1',
      gridTemplateRows: '320px auto',
    },
    [theme.breakpoints.down('sm')]: {
      gridTemplateRows: '280px auto',
    },
  };
});

const CardMedia = styled('div')({
  position: 'relative',
  overflow: 'hidden',
});

const CardImage = styled('img', {
  shouldForwardProp: (prop) => prop !== '$blurred',
})<{ $blurred: boolean }>(({ $blurred }) => ({
  width: '100%',
  height: '100%',
  display: 'block',
  objectFit: 'cover',
  objectPosition: 'center',
  filter: $blurred ? 'blur(14px) saturate(0.82)' : 'none',
  transform: $blurred ? 'scale(1.08)' : 'scale(1)',
}));

const CardOverlay = styled('div', {
  shouldForwardProp: (prop) => prop !== '$locked',
})<{ $locked: boolean }>(({ $locked }) => ({
  position: 'absolute',
  inset: 0,
  background: $locked
    ? 'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.75) 100%)'
    : 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.24) 100%)',
}));

const CardBadges = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(1.5),
  left: theme.spacing(1.5),
  right: theme.spacing(1.5),
  display: 'flex',
  gap: theme.spacing(1),
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  pointerEvents: 'none',
}));

const CardBody = styled('div')(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(1.25),
  padding: theme.spacing(2.25),
}));

const PriceText = styled('div')({
  fontSize: '1.5rem',
  fontWeight: 800,
  color: '#C8F000',
  letterSpacing: '-0.02em',
});

const LoadingShell = styled('div')(({ theme }) => ({
  minHeight: '50vh',
  display: 'grid',
  placeItems: 'center',
  color: '#d4d4d4',
  padding: theme.spacing(4),
}));

const CountdownText = styled('div')({
  fontSize: '1.9rem',
  fontWeight: 800,
  color: '#C8F000',
  letterSpacing: '-0.04em',
  lineHeight: 1,
});

const TeaserStamp = styled('div')(({ theme }) => ({
  position: 'absolute',
  right: theme.spacing(1.5),
  bottom: theme.spacing(1.5),
  padding: theme.spacing(0.75, 1.25),
  borderRadius: 999,
  border: `1px solid ${alpha('#C8F000', 0.25)}`,
  background: alpha('#0D0D0D', 0.7),
  color: '#C8F000',
  fontSize: '0.78rem',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  backdropFilter: 'blur(8px)',
}));

const CTA_BUTTON_SX = {
  justifyContent: 'center',
  width: 'fit-content',
  minWidth: 140,
  borderRadius: 999,
  px: 2,
  textTransform: 'none',
  fontWeight: 700,
  boxShadow: 'none',
} as const;

function normalizeAccess(value: unknown): DropAccess {
  return VALID_ACCESS.includes(value as DropAccess) ? (value as DropAccess) : 'teaser';
}

function formatDropDate(date: string | undefined): string {
  if (!date) return 'Coming Soon';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export default function DropsPage() {
  const { value: showFeed, isLoading: isLoadingFeedFlag } = useFeatureFlag(LD_FLAGS.showAc26DropFeed, false);
  const { value: accessFlag, isLoading: isLoadingAccessFlag } = useFeatureFlag(LD_FLAGS.ac26DropAccess, 'teaser');
  const teaserDropMs = useMemo(() => new Date(TEASER_DROP_DATE).getTime(), []);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (isLoadingFeedFlag || isLoadingAccessFlag) {
    return (
      <PageShell>
        <LoadingShell>
          <Typography variant="body1">Loading AC26 drop feed...</Typography>
        </LoadingShell>
      </PageShell>
    );
  }

  if (!showFeed) {
    return <Navigate to="/" replace />;
  }

  const access = normalizeAccess(accessFlag);
  const isTeaser = access === 'teaser';
  const showVipBadge = access === 'early-access';
  const teaserMsLeft = Math.max(0, teaserDropMs - now);
  const heroStatus = isTeaser ? formatCountdown(teaserMsLeft) : 'Available Now';
  const accessLabel =
    access === 'teaser' ? 'Teaser Feed' : access === 'early-access' ? 'VIP Early Access' : 'Full Access';

  return (
    <PageShell>
      <Container maxWidth="xl">
        <HeroSection>
          <HeroMeta>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label="Limited Drop"
                sx={{
                  bgcolor: alpha('#C8F000', 0.12),
                  color: '#C8F000',
                  border: `1px solid ${alpha('#C8F000', 0.24)}`,
                  fontWeight: 700,
                }}
              />
              <Chip
                label={accessLabel}
                sx={{
                  bgcolor: alpha('#FFFFFF', 0.06),
                  color: '#f5f5f5',
                  border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
                  fontWeight: 600,
                }}
              />
            </Stack>
            <Typography
              variant="h1"
              className="font-display"
              sx={{
                fontSize: { xs: '4rem', md: '6rem' },
                lineHeight: 0.92,
                letterSpacing: '0.04em',
                color: '#F8F8F3',
                textTransform: 'uppercase',
              }}
            >
              AC26
            </Typography>
            <Typography variant="h5" sx={{ color: '#d4d4d4', maxWidth: 680 }}>
              AgentControl '26 — Limited Drop
            </Typography>
            <Typography variant="body1" sx={{ color: '#9ca39a', maxWidth: 720 }}>
              A premium editorial feed for the AC26 capsule. Volt accents, dark neutrals, and limited silhouettes staged
              like a live drop, not a standard catalog.
            </Typography>
          </HeroMeta>

          <HeroRail>
            <RailCard>
              <Typography variant="overline" sx={{ color: '#9ca39a', letterSpacing: '0.16em' }}>
                Drop Status
              </Typography>
              {isTeaser ? (
                <CountdownText style={{ marginTop: 4 }}>{heroStatus}</CountdownText>
              ) : (
                <Typography variant="h4" sx={{ color: '#C8F000', fontWeight: 800, mt: 0.5 }}>
                  {heroStatus}
                </Typography>
              )}
              {isTeaser && (
                <Typography variant="body2" sx={{ color: '#f5f5f5', mt: 0.75, fontWeight: 700 }}>
                  Drops {formatDropDate(TEASER_DROP_DATE)}
                </Typography>
              )}
              <Typography variant="body2" sx={{ color: '#cfcfc7', mt: 1 }}>
                {isTeaser
                  ? "Public teaser is live now. Lock in your alert and be first in when AgentControl '26 opens."
                  : 'The AC26 collection is live now with direct PDP routing from each card.'}
              </Typography>
            </RailCard>
            <RailCard>
              {isTeaser ? (
                <>
                  <Typography variant="overline" sx={{ color: '#9ca39a', letterSpacing: '0.16em' }}>
                    Notify List
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#f5f5f5', mt: 0.5 }}>
                    Get the launch ping before the feed unlocks.
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#cfcfc7', mt: 1, mb: 2 }}>
                    Public preview now. Full visuals, prices, and direct product access open on drop day.
                  </Typography>
                  <Button
                    component={Link}
                    to="/signup"
                    variant="contained"
                    sx={{
                      ...CTA_BUTTON_SX,
                      bgcolor: '#C8F000',
                      color: '#0D0D0D',
                      '&:hover': {
                        bgcolor: '#d8ff38',
                      },
                    }}
                  >
                    Notify Me
                  </Button>
                </>
              ) : (
                <>
                  <Typography variant="overline" sx={{ color: '#9ca39a', letterSpacing: '0.16em' }}>
                    Capsule
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#f5f5f5', mt: 0.5 }}>
                    {AC26_PRODUCTS.length} editorial drop cards
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#cfcfc7', mt: 1 }}>
                    VOLT-HI and APEX LOW colorways staged in a premium SNKRS-style feed.
                  </Typography>
                </>
              )}
            </RailCard>
          </HeroRail>
        </HeroSection>

        <EditorialGrid>
          {AC26_PRODUCTS.map((product, index) => {
            const lockedImage = isTeaser ? product.teaserImage ?? product.imageUrl : product.imageUrl;
            const blurImage = isTeaser && !product.teaserImage;

            return (
              <FeedCard key={product.id} $slot={index}>
                <CardMedia>
                  <CardImage $blurred={blurImage} src={lockedImage} alt={`${product.name} ${product.subtitle ?? ''}`.trim()} />
                  <CardOverlay $locked={isTeaser} />
                  {isTeaser && <TeaserStamp>Public Teaser</TeaserStamp>}
                  <CardBadges>
                    <Chip
                      label={product.collab ?? "AgentControl '26"}
                      size="small"
                      sx={{
                        bgcolor: alpha('#0D0D0D', 0.72),
                        color: '#f5f5f5',
                        border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
                        backdropFilter: 'blur(10px)',
                      }}
                    />
                    {showVipBadge ? (
                      <Chip
                        label="VIP Early Access"
                        size="small"
                        sx={{
                          bgcolor: alpha('#C8F000', 0.16),
                          color: '#C8F000',
                          border: `1px solid ${alpha('#C8F000', 0.28)}`,
                          fontWeight: 700,
                        }}
                      />
                    ) : null}
                  </CardBadges>
                </CardMedia>

                <CardBody>
                  <div>
                    <Typography variant="h4" className="font-display" sx={{ color: '#f5f5f5', lineHeight: 1, mb: 0.5 }}>
                      {product.name}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ color: '#C8F000', fontWeight: 700, mb: 0.75 }}>
                      {product.subtitle}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#a8aca3', maxWidth: 520 }}>
                      {product.colorway}
                    </Typography>
                  </div>

                  {!isTeaser ? (
                    <PriceText>${product.price}</PriceText>
                  ) : (
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ color: '#d4d4d4', fontWeight: 600 }}>
                        Pricing stays under wraps until launch.
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#9ca39a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Drops {formatDropDate(TEASER_DROP_DATE)}
                      </Typography>
                    </Stack>
                  )}

                  {isTeaser ? (
                    <Button
                      component={Link}
                      to="/signup"
                      variant="outlined"
                      sx={{
                        ...CTA_BUTTON_SX,
                        color: '#f5f5f5',
                        borderColor: alpha('#FFFFFF', 0.18),
                        '&:hover': {
                          borderColor: '#C8F000',
                          color: '#C8F000',
                          backgroundColor: alpha('#C8F000', 0.06),
                        },
                      }}
                    >
                      Notify Me
                    </Button>
                  ) : (
                    <Button
                      component={Link}
                      to={`/products/${product.id}`}
                      variant="contained"
                      sx={{
                        ...CTA_BUTTON_SX,
                        bgcolor: '#C8F000',
                        color: '#0D0D0D',
                        '&:hover': {
                          bgcolor: '#d8ff38',
                        },
                      }}
                    >
                      Shop Now
                    </Button>
                  )}
                </CardBody>
              </FeedCard>
            );
          })}
        </EditorialGrid>
      </Container>
    </PageShell>
  );
}
