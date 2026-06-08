import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useUser } from './UserContext';
import { isIdentifiedUser } from '../types/darktrainers';
import type { Product } from '../components/Products/productData';

/** Shown in cart after accepting the VIP upgrade modal; cleared when VIP is revoked or cart is cleared. */
export const VIP_MEMBERSHIP_UPGRADE_USD = 14.99;

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
  /** True after user confirms the VIP upgrade modal while VIP; cleared when tier drops or cart clears. */
  vipUpgradeLineActive: boolean;
  /** Call when the VIP upgrade modal is confirmed (visual cart line only). */
  activateVipUpgradeLineItem: () => void;
  /** Remove all line items and close the drawer. */
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [vipUpgradeLineActive, setVipUpgradeLineActive] = useState(false);
  const { isAnonymousGuest, user, registerClearCart } = useUser();

  const clearCart = useCallback(() => {
    setLines([]);
    setVipUpgradeLineActive(false);
    setIsOpen(false);
  }, []);

  useEffect(() => {
    registerClearCart(clearCart);
  }, [registerClearCart, clearCart]);

  useEffect(() => {
    const isVip = isIdentifiedUser(user) && user.memberTier === 'vip';
    if (!isVip) {
      setVipUpgradeLineActive(false);
    }
  }, [user]);

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
      mergeLine(product, size, qty);
      return { needsVipModal: false };
    },
    [isAnonymousGuest, mergeLine],
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

  const activateVipUpgradeLineItem = useCallback(() => {
    setVipUpgradeLineActive(true);
  }, []);

  const cartSubtotal = useMemo(() => {
    const products = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
    return products + (vipUpgradeLineActive ? VIP_MEMBERSHIP_UPGRADE_USD : 0);
  }, [lines, vipUpgradeLineActive]);

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
      vipUpgradeLineActive,
      activateVipUpgradeLineItem,
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
      vipUpgradeLineActive,
      activateVipUpgradeLineItem,
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
