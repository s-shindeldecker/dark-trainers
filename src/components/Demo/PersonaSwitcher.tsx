import { useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import PersonIcon from '@mui/icons-material/Person';
import { useUser } from '../../context/UserContext';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { LD_FLAGS } from '../../lib/ldFlagKeys';
import { generateRandomStandardUser, generateRandomVipUser } from '../../lib/generateRandomUser';
import {
  STANDARD_DEMO_USER,
  VIP_DEMO_USER,
  type AppUser,
} from '../../types/darktrainers';
import { Modal } from '../common/Modal';

type PersonaChoice = 'guest' | 'standard' | 'vip';

export interface PersonaSwitcherProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const VOLT = '#C8F000';
const BG = '#0a0a0a';

const Trigger = styled.button<{ $liftForChat: boolean }>`
  position: fixed;
  right: 1rem;
  bottom: ${({ $liftForChat }) => ($liftForChat ? '5.75rem' : '1rem')};
  z-index: 10002;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  background: ${BG};
  color: ${VOLT};
  border: 1px solid rgba(200, 240, 0, 0.3);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  max-width: min(calc(100vw - 2rem), 220px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    border-color: rgba(200, 240, 0, 0.55);
  }

  svg {
    font-size: 1rem;
    flex-shrink: 0;
  }
`;

const ModalBody = styled.div`
  text-align: left;
  padding: 0;
`;

const Title = styled.h2`
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: #f5f5f5;
  text-align: center;
`;

const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const OptionLabel = styled.label<{ $checked: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: 1px solid ${({ $checked }) => ($checked ? 'rgba(200, 240, 0, 0.45)' : '#333')};
  background: ${({ $checked }) => ($checked ? 'rgba(200, 240, 0, 0.08)' : BG)};
  color: #e5e5e5;
  font-size: 0.9rem;
  cursor: pointer;

  input {
    accent-color: ${VOLT};
  }
`;

const SwitchBtn = styled.button`
  width: 100%;
  padding: 0.75em;
  font-weight: 700;
  font-size: 0.95rem;
  background: ${VOLT};
  color: #0a0a0a;
  border: none;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    filter: brightness(1.05);
  }
`;

function personaFromUser(user: AppUser): PersonaChoice {
  if (user.anonymous) return 'guest';
  return user.memberTier === 'vip' ? 'vip' : 'standard';
}

function triggerLabel(user: AppUser): string {
  if (user.anonymous) return 'Guest';
  if (user.key === STANDARD_DEMO_USER.key) return STANDARD_DEMO_USER.name;
  if (user.key === VIP_DEMO_USER.key) return VIP_DEMO_USER.name;
  return user.memberTier === 'vip' ? 'VIP Member' : 'Standard User';
}

export function PersonaSwitcher({ open: openProp, onOpenChange }: PersonaSwitcherProps) {
  const { value: showChatbot } = useFeatureFlag(LD_FLAGS.showChatbot, false);
  const { user, resetToGuest, setRandomStandard, setRandomVip } = useUser();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selected, setSelected] = useState<PersonaChoice>(() => personaFromUser(user));

  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const currentLabel = useMemo(() => triggerLabel(user), [user]);

  useEffect(() => {
    if (open) {
      setSelected(personaFromUser(user));
    }
  }, [open, user]);

  const openModal = () => {
    setSelected(personaFromUser(user));
    setOpen(true);
  };

  const handleSwitch = () => {
    if (selected === 'guest') {
      resetToGuest();
    } else if (selected === 'standard') {
      setRandomStandard(generateRandomStandardUser());
    } else {
      setRandomVip(generateRandomVipUser());
    }
    setOpen(false);
  };

  return (
    <>
      <Trigger type="button" $liftForChat={showChatbot} onClick={openModal} aria-label="Switch persona">
        <PersonIcon aria-hidden />
        <span>{currentLabel}</span>
      </Trigger>

      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalBody>
          <Title>Switch persona</Title>
          <OptionList role="radiogroup" aria-label="Persona">
            {(
              [
                ['guest', 'Guest'],
                ['standard', 'Standard'],
                ['vip', 'VIP'],
              ] as const
            ).map(([value, label]) => (
              <OptionLabel key={value} $checked={selected === value}>
                <input
                  type="radio"
                  name="persona"
                  value={value}
                  checked={selected === value}
                  onChange={() => setSelected(value)}
                />
                {label}
              </OptionLabel>
            ))}
          </OptionList>
          <SwitchBtn type="button" onClick={handleSwitch}>
            Switch
          </SwitchBtn>
        </ModalBody>
      </Modal>
    </>
  );
}
