import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import type { Product } from '../components/Products/productData';

export type PendingCartAdd = { productId: string; size: number } | null;

interface VipModalContextValue {
  isOpen: boolean;
  pendingCartAdd: PendingCartAdd;
  openVipModal: (pending?: { product: Product; size: number }) => void;
  closeVipModal: () => void;
  clearPendingCartAdd: () => void;
}

const VipModalContext = createContext<VipModalContextValue | undefined>(undefined);

export function VipModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCartAdd, setPendingCartAdd] = useState<PendingCartAdd>(null);
  const ldClient = useLDClient();

  const openVipModal = useCallback(
    (pending?: { product: Product; size: number }) => {
      if (ldClient) {
        ldClient.track('vip_upgrade_modal_shown');
      }
      if (pending) {
        setPendingCartAdd({ productId: pending.product.id, size: pending.size });
      } else {
        setPendingCartAdd(null);
      }
      setIsOpen(true);
    },
    [ldClient],
  );

  const closeVipModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const clearPendingCartAdd = useCallback(() => setPendingCartAdd(null), []);

  return (
    <VipModalContext.Provider
      value={{ isOpen, pendingCartAdd, openVipModal, closeVipModal, clearPendingCartAdd }}
    >
      {children}
    </VipModalContext.Provider>
  );
}

export function useVipModal() {
  const ctx = useContext(VipModalContext);
  if (!ctx) throw new Error('useVipModal must be used within VipModalProvider');
  return ctx;
}
