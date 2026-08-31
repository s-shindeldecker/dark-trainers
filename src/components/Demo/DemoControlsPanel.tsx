import { useEffect, useState, type ChangeEvent } from 'react';
import styled from '@emotion/styled';
import Box from '@mui/material/Box';
import { useUser } from '../../context/UserContext';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useExposureLog } from '../../context/ExposureLog';
import { LD_FLAGS } from '../../lib/ldFlagKeys';
import { STANDARD_ROSTER, VIP_ROSTER } from '../../types/darktrainers';
import { generateRandomStandardUser, generateRandomVipUser } from '../../lib/generateRandomUser';
import { MemberBadge } from '../Member/MemberBadge';

const Panel = styled.aside<{ $liftForChat: boolean }>`
  position: fixed;
  bottom: ${({ $liftForChat }) => ($liftForChat ? '5.5rem' : '1rem')};
  left: 1rem;
  z-index: 10001;
  width: min(280px, calc(100vw - 2rem));
  background: rgba(17, 17, 17, 0.95);
  border: 1px solid #333;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  font-size: 0.8rem;
  color: #a3a3a3;
`;

const Label = styled.div`
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #737373;
  margin-bottom: 0.35rem;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
`;

const Select = styled.select`
  flex: 1;
  font-size: 0.8rem;
`;

const Hint = styled.p`
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  line-height: 1.35;
  color: #666;
`;

const RosterSection = styled.div`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
`;

const SessionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
`;

const SessionId = styled.code`
  font-size: 0.72rem;
  color: #c8f000;
`;

const NewSessionButton = styled.button`
  font-size: 0.7rem;
  padding: 0.25rem 0.55rem;
  background: #1a1a1a;
  color: #f5f5f5;
  border: 1px solid #333;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    border-color: #c8f000;
  }
`;

const ExposureSection = styled.div`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
`;

const ExposureToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.5rem;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #737373;
  &:hover {
    color: #a3a3a3;
  }
`;

const ExposureCount = styled.span`
  color: #c8f000;
  font-variant-numeric: tabular-nums;
  letter-spacing: normal;
`;

const ClearBtn = styled.button`
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  background: #1a1a1a;
  color: #a3a3a3;
  border: 1px solid #333;
  border-radius: 6px;
  cursor: pointer;
  &:hover {
    border-color: #c8f000;
  }
`;

const ExposureItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  padding: 0.15rem 0;
`;

const ExpKey = styled.code`
  color: #f5f5f5;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ExpVar = styled.span`
  color: #737373;
`;

const ExpTag = styled.span<{ $inExperiment: boolean }>`
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  color: ${({ $inExperiment }) => ($inExperiment ? '#c8f000' : '#666')};
  border: 1px solid ${({ $inExperiment }) => ($inExperiment ? '#4d5c00' : '#333')};
  background: ${({ $inExperiment }) => ($inExperiment ? 'rgba(200, 240, 0, 0.08)' : 'transparent')};
`;

// Collapsed state: a small pill in the panel's spot that re-expands on click.
const CollapsedHandle = styled.button<{ $liftForChat: boolean }>`
  position: fixed;
  bottom: ${({ $liftForChat }) => ($liftForChat ? '5.5rem' : '1rem')};
  left: 1rem;
  z-index: 10001;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.7rem;
  background: rgba(17, 17, 17, 0.95);
  border: 1px solid #333;
  border-radius: 999px;
  color: #a3a3a3;
  font-size: 0.72rem;
  cursor: pointer;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  &:hover {
    border-color: #c8f000;
    color: #f5f5f5;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const HideButton = styled.button`
  background: transparent;
  border: none;
  color: #737373;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.2rem;
  &:hover {
    color: #c8f000;
  }
`;

// Persisted show/hide (survives reloads and "New Session", which is localStorage-safe).
const PANEL_COLLAPSED_KEY = 'dt-demo-panel-collapsed';
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(PANEL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

type Persona = 'guest' | 'standard' | 'vip';

export function DemoControlsPanel() {
  const { value: showChatbot } = useFeatureFlag(LD_FLAGS.showChatbot, false);
  const {
    user,
    sessionKey,
    newSession,
    resetToGuest,
    setIdentifiedStandard,
    setIdentifiedVip,
    setRandomStandard,
    setRandomVip,
  } = useUser();
  const { exposures, clear } = useExposureLog();
  const [exposuresOpen, setExposuresOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  // Persist show/hide across reloads and "New Session".
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Shift+D toggles the panel — but never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'd') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const persona: Persona = user.anonymous ? 'guest' : user.memberTier === 'vip' ? 'vip' : 'standard';

  const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as Persona;
    if (v === 'guest') resetToGuest();
    else if (v === 'standard') setIdentifiedStandard();
    else setIdentifiedVip();
  };

  // Roster of fixed, STABLE-key users. The About layout experiment randomizes on
  // the user context, so switching between these durable keys is how you show
  // (a) different users bucketing differently and (b) the same user returning to
  // the same layout across a New Session. See STANDARD_ROSTER / VIP_ROSTER.
  const onRosterChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    const std = STANDARD_ROSTER.find((u) => u.key === key);
    if (std) return setRandomStandard(std);
    const vip = VIP_ROSTER.find((u) => u.key === key);
    if (vip) return setRandomVip(vip);
  };
  const rosterValue = user.anonymous ? '' : user.key;

  return (
    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
      {collapsed ? (
        <CollapsedHandle
          type="button"
          $liftForChat={showChatbot}
          onClick={() => setCollapsed(false)}
          aria-label="Show demo controls (Shift+D)"
          title="Show demo controls (Shift+D)"
        >
          ⚙ Demo
        </CollapsedHandle>
      ) : (
      <Panel $liftForChat={showChatbot} aria-label="Demo controls">
        <PanelHeader>
          <Label style={{ marginBottom: 0 }}>Demo controls</Label>
          <HideButton
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Hide demo controls (Shift+D)"
            title="Hide (Shift+D)"
          >
            ×
          </HideButton>
        </PanelHeader>
        <Row>
          <Select value={persona} onChange={onChange} aria-label="Demo persona">
            <option value="guest">Guest (anonymous)</option>
            <option value="standard">Standard member</option>
            <option value="vip">VIP member</option>
          </Select>
          {!user.anonymous && <MemberBadge tier={user.memberTier} />}
        </Row>
        <Hint>
          Guest: LD uses a session context only (new session key on reset). Standard/VIP: multi(session + user) with the same session key for attribution. Add to
          cart or Join VIP from Guest identifies with multi.
        </Hint>
        <RosterSection>
          <Label style={{ marginBottom: '0.35rem' }}>Experiment user (durable key)</Label>
          <Row style={{ marginBottom: '0.35rem' }}>
            <Select value={rosterValue} onChange={onRosterChange} aria-label="Experiment user">
              <option value="" disabled>
                {user.anonymous ? 'Guest — no user context' : 'Select a user…'}
              </option>
              <optgroup label="Standard">
                {STANDARD_ROSTER.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="VIP">
                {VIP_ROSTER.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Row>
          <Row style={{ marginBottom: 0 }}>
            <NewSessionButton type="button" onClick={() => setRandomStandard(generateRandomStandardUser())}>
              + Random Standard
            </NewSessionButton>
            <NewSessionButton type="button" onClick={() => setRandomVip(generateRandomVipUser())}>
              + Random VIP
            </NewSessionButton>
          </Row>
          <Hint>
            Same key → same <code>about-layout-default</code> variation, even after New session. Different users can bucket differently. Random spawns a fresh key
            (new bucket).
          </Hint>
        </RosterSection>
        <SessionRow>
          <span>
            Session: <SessionId>{sessionKey.slice(0, 8)}</SessionId>
          </span>
          <NewSessionButton type="button" onClick={newSession}>
            New session
          </NewSessionButton>
        </SessionRow>
        <ExposureSection>
          <ExposureToggle
            type="button"
            onClick={() => setExposuresOpen((open) => !open)}
            aria-expanded={exposuresOpen}
            aria-label="Toggle experiment exposures"
          >
            <span>{exposuresOpen ? '▾' : '▸'} Experiment exposures</span>
            <ExposureCount>{exposures.length}</ExposureCount>
          </ExposureToggle>
          {exposuresOpen && (
            <>
              {exposures.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0.35rem 0' }}>
                  <ClearBtn type="button" onClick={clear}>
                    Clear
                  </ClearBtn>
                </div>
              )}
              {exposures.length === 0 ? (
                <Hint style={{ marginTop: '0.35rem' }}>
                  None yet — preloaded flags don’t expose. Open the cart (VIP upsell) or view the
                  promo banner to fire one.
                </Hint>
              ) : (
                exposures.map((e, i) => (
                  <ExposureItem key={`${e.flagKey}-${e.at}-${i}`}>
                    <ExpKey title={e.flagKey}>{e.flagKey}</ExpKey>
                    <ExpVar>#{e.variationIndex ?? '?'}</ExpVar>
                    <ExpTag $inExperiment={e.inExperiment}>
                      {e.inExperiment ? 'in exp' : 'no exp'}
                    </ExpTag>
                  </ExposureItem>
                ))
              )}
            </>
          )}
        </ExposureSection>
      </Panel>
      )}
    </Box>
  );
}
