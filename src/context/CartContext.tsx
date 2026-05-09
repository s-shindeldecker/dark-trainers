import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useUser } from './UserContext';
import type { Product } from '../components/Products/productData';

export type CartLine = {
  productId: string;
  name: string;
  size: number;
  qty: number;
  /** Price at add time for metrics (standard price). */
  unitPrice: number;
};

interface CartContextValue {
  lines: CartLine[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  /** Anonymous + drop-exclusive → `{ needsVipModal: true }` (no add). Else adds; anonymous non-drop triggers Standard transition first. */
  addItem: (product: Product, size: number, qty?: number) => { needsVipModal: boolean };
  /** Call after anonymous→VIP transition for drop-exclusive PDP. */
  addItemAfterVipTransition: (product: Product, size: number, qty?: number) => void;
  updateQty: (productId: string, size: number, qty: number) => void;
  removeLine: (productId: string, size: number) => void;
  cartSubtotal: number;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { transitionGuestToStandard, isAnonymousGuest } = useUser();

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const mergeLine = useCallback((product: Product, size: number, qty: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === product.id && l.size === size);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          size,
          qty,
          unitPrice: product.price,
        },
      ];
    });
    setIsOpen(true);
  }, []);

  const addItem = useCallback(
    (product: Product, size: number, qty = 1) => {
      if (isAnonymousGuest && product.isDropExclusive) {
        return { needsVipModal: true };
      }
      if (isAnonymousGuest && !product.isDropExclusive) {
        transitionGuestToStandard();
      }
      mergeLine(product, size, qty);
      return { needsVipModal: false };
    },
    [isAnonymousGuest, mergeLine, transitionGuestToStandard],
  );

  const addItemAfterVipTransition = useCallback(
    (product: Product, size: number, qty = 1) => {
      mergeLine(product, size, qty);
    },
    [mergeLine],
  );

  const updateQty = useCallback((productId: string, size: number, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId && l.size === size ? { ...l, qty: Math.max(1, qty) } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const removeLine = useCallback((productId: string, size: number) => {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.size === size)));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const cartSubtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
    [lines],
  );

  const value = useMemo(
    () => ({
      lines,
      isOpen,
      openCart,
      closeCart,
      addItem,
      addItemAfterVipTransition,
      updateQty,
      removeLine,
      cartSubtotal,
      clearCart,
    }),
    [
      lines,
      isOpen,
      openCart,
      closeCart,
      addItem,
      addItemAfterVipTransition,
      updateQty,
      removeLine,
      cartSubtotal,
      clearCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
