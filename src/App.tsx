import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { useLDClient } from 'launchdarkly-react-client-sdk';
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
import styled from '@emotion/styled';
import AboutUs from './pages/About';
import FAQ from './pages/FAQ';
import Reviews from './pages/Reviews';
import Signup from './pages/Signup';
import DropsPage from './pages/DropsPage';
import { ChatWidget } from './components/Chat/ChatWidget';
import { DemoControlsPanel } from './components/Demo/DemoControlsPanel';
import { CartDrawer } from './components/Cart/CartDrawer';
import { VIPUpgradeModal } from './components/VIP/VIPUpgradeModal';
import { getProductById } from './components/Products/productData';

const MainContent = styled.main`
  flex: 1;
  width: 100%;
`;

function AppShell() {
  const navigate = useNavigate();
  const { isIdentified, logout } = useUser();
  const { value: showAc26DropFeed } = useFeatureFlag(LD_FLAGS.showAc26DropFeed, false);
  const { value: showProductCatalog } = useFeatureFlag(LD_FLAGS.showProductCatalog, true);
  const { value: showChatbot } = useFeatureFlag(LD_FLAGS.showChatbot, false);
  const { value: showVipSignup } = useFeatureFlag(LD_FLAGS.showVipSignup, true);
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
      }
    }
    vip.clearPendingCartAdd();
  };

  return (
    <>
      <SeasonalBanner />
      <Header
        isIdentified={isIdentified}
        onLogout={logout}
        onAccount={() => navigate('/account')}
        showFeed={showAc26DropFeed}
        showProducts={showProductCatalog}
        showSignup={showVipSignup}
        onJoinVip={() => vip.openVipModal()}
      />
      <MainContent>
        <Routes>
          <Route path="/" element={<HeroSection />} />
          <Route path="/account" element={<Account />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/drops" element={<DropsPage />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/reviews" element={<Reviews />} />
        </Routes>
      </MainContent>
      <Footer />
      {showChatbot && <ChatWidget />}
      <CartDrawer onJoinVip={() => vip.openVipModal()} />
      <DemoControlsPanel />
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
  return (
    <UserProvider>
      <Router>
        <AppWithLd />
      </Router>
    </UserProvider>
  );
}

export default App;
