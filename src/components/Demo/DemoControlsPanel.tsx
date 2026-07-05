import type { ChangeEvent } from 'react';
import styled from '@emotion/styled';
import Box from '@mui/material/Box';
import { useUser } from '../../context/UserContext';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { LD_FLAGS } from '../../lib/ldFlagKeys';
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

type Persona = 'guest' | 'standard' | 'vip';

export function DemoControlsPanel() {
  const { value: showChatbot } = useFeatureFlag(LD_FLAGS.showChatbot, false);
  const { user, sessionKey, newSession, resetToGuest, setIdentifiedStandard, setIdentifiedVip } =
    useUser();

  const persona: Persona = user.anonymous ? 'guest' : user.memberTier === 'vip' ? 'vip' : 'standard';

  const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as Persona;
    if (v === 'guest') resetToGuest();
    else if (v === 'standard') setIdentifiedStandard();
    else setIdentifiedVip();
  };

  return (
    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
      <Panel $liftForChat={showChatbot} aria-label="Demo controls">
        <Label>Demo controls</Label>
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
        <SessionRow>
          <span>
            Session: <SessionId>{sessionKey.slice(0, 8)}</SessionId>
          </span>
          <NewSessionButton type="button" onClick={newSession}>
            New session
          </NewSessionButton>
        </SessionRow>
      </Panel>
    </Box>
  );
}
