import styled from '@emotion/styled';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { Modal } from '../common/Modal';
import { useUser } from '../../context/UserContext';
import { isIdentifiedUser } from '../../types/darktrainers';

const Title = styled.h2`
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
  color: #f5f5f5;
`;

const List = styled.ul`
  margin: 0 0 1.25rem;
  padding-left: 1.1rem;
  color: #d4d4d4;
  line-height: 1.5;
`;

const Cta = styled.button`
  width: 100%;
  padding: 0.85em;
  font-weight: 700;
  font-size: 1.05rem;
`;

const Cancel = styled.button`
  width: 100%;
  margin-top: 0.5rem;
  background: transparent;
  color: #a3a3a3;
  border: 1px solid #404040;
`;

const PriceNote = styled.p`
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: #c8f000;
`;

interface VIPUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** After VIP transition (e.g. complete pending cart add from PDP). */
  onConfirmed?: () => void;
}

export function VIPUpgradeModal({ open, onClose, onConfirmed }: VIPUpgradeModalProps) {
  const ldClient = useLDClient();
  const { user, transitionGuestToVip, upgradeIdentifiedToVip, isAnonymousGuest } = useUser();

  const handleConfirm = () => {
    if (ldClient) {
      ldClient.track('vip_upgrade', { value: 14.99 });
    }
    if (isAnonymousGuest) {
      transitionGuestToVip();
    } else if (isIdentifiedUser(user) && user.memberTier === 'standard') {
      upgradeIdentifiedToVip();
    }
    onConfirmed?.();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Title>Upgrade to VIP</Title>
      <List>
        <li>Early access to limited drops before the public release.</li>
        <li>Member pricing on every pair — typically 15–20% off.</li>
        <li>Priority support when release windows get hectic.</li>
      </List>
      <PriceNote>Upgrade to VIP — $14.99/month</PriceNote>
      <Cta type="button" onClick={handleConfirm}>
        Upgrade to VIP — $14.99/month
      </Cta>
      <Cancel type="button" className="secondary" onClick={onClose}>
        Not now
      </Cancel>
    </Modal>
  );
}
