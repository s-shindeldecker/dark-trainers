import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { LDContextProvider } from './context/LDContext';
import { UserProvider, useUser } from './context/UserContext';
import type { UserProfile } from './context/UserContext';
import { HeroSection } from './components/Hero/HeroSection';
import { Header } from './components/Layout/Header';
import { Footer } from './components/Layout/Footer';
import { SeasonalBanner } from './components/Layout/SeasonalBanner';
import { Account } from './pages/Account';
import styled from '@emotion/styled';
import { useState } from 'react';
import { Modal } from './components/common/Modal';
import AboutUs from './pages/About';
import WhyGravityFarms from './pages/WhyGravityFarms';
import FAQ from './pages/FAQ';
import Reviews from './pages/Reviews';

const MainContent = styled.main`
  flex: 1;
`;

// Updated personas for demo/testing, cleaned up by AI on 2025-06-18.
const personas = [
  {
    label: 'Kat Purrstein (Cat, UK, Basic, PayPal)',
    getProfile: () => ({
      key: 'cat-uk-basic-katpurr',
      anonymous: false,
      name: 'Kat Purrstein',
      country: 'UK',
      state: 'Greater London',
      petType: 'cat',
      planType: 'basic',
      paymentType: 'paypal',
    }),
  },
  {
    label: 'Bark Twain (Dog, US, Premium, Credit Card)',
    getProfile: () => ({
      key: 'dog-us-premium-barktwain',
      anonymous: false,
      name: 'Bark Twain',
      country: 'US',
      state: 'California',
      petType: 'dog',
      planType: 'premium',
      paymentType: 'credit_card',
    }),
  },
  {
    label: 'Fur-gus McFluff (Dog, CA, Basic, Apple Pay)',
    getProfile: () => ({
      key: 'dog-ca-basic-furgus',
      anonymous: false,
      name: 'Fur-gus McFluff',
      country: 'CA',
      state: 'Ontario',
      petType: 'dog',
      planType: 'basic',
      paymentType: 'apple_pay',
    }),
  },
  {
    label: 'Whiskers LeChat (Cat, FR, Premium, Bank)',
    getProfile: () => ({
      key: 'cat-fr-premium-lechat',
      anonymous: false,
      name: 'Whiskers LeChat',
      country: 'FR',
      state: 'Paris',
      petType: 'cat',
      planType: 'premium',
      paymentType: 'bank',
    }),
  },
  {
    label: 'Sam Bothington (Both, DE, Both, Google Pay)',
    getProfile: () => ({
      key: 'both-de-both-samboth',
      anonymous: false,
      name: 'Sam Bothington',
      country: 'DE',
      state: 'Berlin',
      petType: 'both',
      planType: 'both',
      paymentType: 'google_pay',
    }),
  },
  {
    label: 'Pawsley Barkley (Dog, US, Trial, Credit Card)',
    getProfile: () => ({
      key: 'dog-us-trial-pawsley',
      anonymous: false,
      name: 'Pawsley Barkley',
      country: 'US',
      state: 'Texas',
      petType: 'dog',
      planType: 'trial',
      paymentType: 'credit_card',
    }),
  },
];

function PersonaModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (profile: any) => void }) {
  const [selected, setSelected] = useState(0);
  const persona = personas[selected];
  const profile = persona.getProfile();

  return (
    <Modal open={open} onClose={onClose}>
      <h2>Select a Demo Persona</h2>
      <select
        value={selected}
        onChange={e => setSelected(Number(e.target.value))}
        style={{ width: '100%', padding: '0.5em', marginBottom: '1em' }}
      >
        {personas.map((p, i) => (
          <option value={i} key={p.label}>{p.label}</option>
        ))}
      </select>
      <div style={{ textAlign: 'left', marginBottom: '1em', fontSize: '0.95em', background: '#f8f8f8', borderRadius: 8, padding: '1em' }}>
        {Object.entries(profile).map(([k, v]) => (
          <div key={k}><strong>{k}:</strong> {String(v)}</div>
        ))}
      </div>
      <button style={{ width: '100%' }} onClick={() => onSelect(profile)}>Continue as {persona.label}</button>
    </Modal>
  );
}

function AppContent() {
  const { isLoggedIn, login, logout } = useUser();
  const navigate = useNavigate();
  const [showPersonaModal, setShowPersonaModal] = useState(false);

  const handlePersonaSelect = (profile: UserProfile) => {
    login(profile);
    setShowPersonaModal(false);
  };

  return (
    <LDContextProvider>
      <SeasonalBanner />
      <Header
        isLoggedIn={isLoggedIn}
        onLogin={() => setShowPersonaModal(true)}
        onLogout={logout}
        onAccount={() => navigate('/account')}
      />
      <MainContent>
        <Routes>
          <Route path="/" element={<HeroSection />} />
          <Route path="/account" element={<Account />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/why-gravity-farms" element={<WhyGravityFarms />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/reviews" element={<Reviews />} />
        </Routes>
      </MainContent>
      <Footer />
      <PersonaModal 
        open={showPersonaModal} 
        onClose={() => setShowPersonaModal(false)}
        onSelect={handlePersonaSelect} 
      />
    </LDContextProvider>
  );
}

function App() {
  return (
    <UserProvider>
      <Router>
        <AppContent />
      </Router>
    </UserProvider>
  );
}

export default App;
