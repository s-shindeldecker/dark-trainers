import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { LDContextProvider } from './context/LDContext';
import { UserProvider, useUser } from './context/UserContext';
import { CartProvider, useCart } from './context/CartContext';
import { VipModalProvider, useVipModal } from './context/VipModalContext';
import { useFeatureFlag } from './hooks/useFeatureFlag';
import { LD_FLAGS } from './lib/ldFlagKeys';
import { HeroSection } from './components/Hero/HeroSection';
import { Header } from './components/Layout/Header';
import { Footer } from './components/Layout/Footer';
import { SeasonalBanner } from './components/Layout/SeasonalBanner';
import { Account } from './pages/Account';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Collectibles from './pages/Collectibles';
import CardCreator from './pages/CardCreator';
import CollectibleDetail from './pages/CollectibleDetail';
import styled from '@emotion/styled';
import AboutUs from './pages/About';
import FAQ from './pages/FAQ';
import Reviews from './pages/Reviews';
import Signup from './pages/Signup';
import DropsPage from './pages/DropsPage';
import { ChatWidget } from './components/Chat/ChatWidget';
import { DemoControlsPanel } from './components/Demo/DemoControlsPanel';
import { PersonaSwitcher } from './components/Demo/PersonaSwitcher';
import { QRCodeModal } from './components/Demo/QRCodeModal';
import { CartDrawer } from './components/Cart/CartDrawer';
import { VIPUpgradeModal } from './components/VIP/VIPUpgradeModal';
import { getProductById } from './components/Products/productData';
import { pushToDataLayer } from './lib/gtmStub';

const MainContent = styled.main`
  flex: 1;
  width: 100%;
`;

function AppShell() {
  const navigate = useNavigate();
  const { isIdentified, logout } = useUser();
  const [personaSwitcherOpen, setPersonaSwitcherOpen] = useState(false);
  const { value: showAc26DropFeed } = useFeatureFlag(LD_FLAGS.showAc26DropFeed, false);
  const { value: showProductCatalog } = useFeatureFlag(LD_FLAGS.showProductCatalog, true);
  const { value: showChatbot } = useFeatureFlag(LD_FLAGS.showChatbot, false);
  const { value: showVipSignup } = useFeatureFlag(LD_FLAGS.showVipSignup, true);
  const { value: showCollectibles } = useFeatureFlag(LD_FLAGS.showCollectiblesCatalog, false);
  const { value: promoBannerPosition, isLoading: isLoadingPromoBannerPosition } = useFeatureFlag(
    LD_FLAGS.promoBannerPosition,
    'top',
  );
  const promoBannerAtBottom =
    !isLoadingPromoBannerPosition && promoBannerPosition === 'bottom';
  const ldClient = useLDClient();
  const vip = useVipModal();
  const { addItemAfterVipTransition, activateVipUpgradeLineItem } = useCart();

  const handleVipConfirmed = () => {
    activateVipUpgradeLineItem();
    if (vip.pendingCartAdd && ldClient) {
      const p = getProductById(vip.pendingCartAdd.productId);
      if (p) {
        addItemAfterVipTransition(p, vip.pendingCartAdd.size);
        ldClient.track('add_to_cart', null, p.price);
        pushToDataLayer({
          event: 'ld_conversion',
          eventKey: 'add_to_cart',
          productId: p.id,
          value: p.price,
        });
      }
    }
    vip.clearPendingCartAdd();
  };

  return (
    <>
      {!promoBannerAtBottom && <SeasonalBanner />}
      <Header
        isIdentified={isIdentified}
        onLogout={logout}
        onAccount={() => navigate('/account')}
        onLogin={() => setPersonaSwitcherOpen(true)}
        showFeed={showAc26DropFeed}
        showProducts={showProductCatalog}
        showSignup={showVipSignup}
        showCollectibles={showCollectibles}
        onJoinVip={() => vip.openVipModal()}
      />
      <MainContent>
        <Routes>
          <Route path="/" element={<HeroSection />} />
          <Route path="/account" element={<Account />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/collectibles" element={<Collectibles />} />
          <Route path="/collectibles/card-creator" element={<CardCreator />} />
          <Route path="/collectibles/:id" element={<CollectibleDetail />} />
          <Route path="/drops" element={<DropsPage />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/reviews" element={<Reviews />} />
        </Routes>
      </MainContent>
      {promoBannerAtBottom && <SeasonalBanner />}
      <Footer />
      {showChatbot && <ChatWidget />}
      <CartDrawer onJoinVip={() => vip.openVipModal()} />
      <DemoControlsPanel />
      <PersonaSwitcher open={personaSwitcherOpen} onOpenChange={setPersonaSwitcherOpen} />
      <VIPUpgradeModal
        open={vip.isOpen}
        onClose={() => {
          vip.closeVipModal();
          vip.clearPendingCartAdd();
        }}
        onConfirmed={handleVipConfirmed}
      />
    </>
  );
}

function AppWithLd() {
  return (
    <LDContextProvider>
      <VipModalProvider>
        <CartProvider>
          <AppShell />
        </CartProvider>
      </VipModalProvider>
    </LDContextProvider>
  );
}

function App() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [qrModalOpen, setQrModalOpen] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'd') {
        event.preventDefault();
        setQrModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop]);

  return (
    <UserProvider>
      {isDesktop && (
        <QRCodeModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} />
      )}
      <Router>
        <AppWithLd />
      </Router>
    </UserProvider>
  );
}

export default App;
