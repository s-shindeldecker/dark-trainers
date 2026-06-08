import { useState } from 'react';
import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import { useCart } from '../../context/CartContext';
import { MemberBadge } from '../Member/MemberBadge';
import { isIdentifiedUser } from '../../types/darktrainers';
import { useUser } from '../../context/UserContext';

const VOLT = '#C8F000';

const NavBar = styled.nav`
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 100;
  overflow: visible;
`;

const CenteredHeader = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  background: rgba(13, 13, 13, 0.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  padding: 0.5rem 1.25rem;
  overflow: visible;

  @media (max-width: 899.95px) {
    padding: 0.5rem 1rem;
    padding-right: max(1rem, env(safe-area-inset-right, 0px));
  }
`;

const Logo = styled.div`
  margin-right: auto;
`;

const LogoText = styled.span`
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.75rem;
  letter-spacing: 0.06em;
  color: #f5f5f5;
`;

const Volt = styled.span`
  color: #c8f000;
`;

const NavLinks = styled.ul`
  list-style: none;
  display: flex;
  gap: 1.25rem;
  margin: 0;
  padding: 0;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 899.95px) {
    display: none;
  }
`;

const NavLink = styled.li`
  a {
    text-decoration: none;
    color: #d4d4d4;
    font-weight: 500;
    font-size: 0.9rem;
    transition: color 0.2s;
    &:hover {
      color: #c8f000;
    }
  }
`;

const MobileActions = styled.div`
  display: none;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  flex-shrink: 0;
  overflow: visible;

  @media (max-width: 899.95px) {
    display: flex;
  }
`;

const IconBtn = styled.button`
  position: relative;
  background: transparent;
  border: 1px solid #333;
  color: #f5f5f5;
  border-radius: 8px;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  font-size: 0.85rem;
  &:hover {
    border-color: #c8f000;
    color: #c8f000;
  }
`;

const Badge = styled.span`
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 4px;
  border-radius: 999px;
  background: #c8f000;
  color: #0d0d0d;
  font-size: 0.65rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const MobileCartBtn = styled.button`
  position: relative;
  box-sizing: border-box;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid #333;
  color: #f5f5f5;
  border-radius: 8px;
  padding: 0 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;

  &:hover {
    border-color: #c8f000;
    color: #c8f000;
  }

  span[data-cart-badge] {
    position: absolute;
    top: 3px;
    right: 3px;
    min-width: 1.1rem;
    height: 1.1rem;
    padding: 0 4px;
    border-radius: 999px;
    background: #c8f000;
    color: #0d0d0d;
    font-size: 0.65rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const DrawerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.5rem 0.75rem 1rem;
  border-bottom: 1px solid #2a2a2a;
`;

const DrawerTitle = styled.span`
  font-weight: 600;
  font-size: 0.95rem;
  color: #f5f5f5;
`;

const AccountRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
`;

interface HeaderProps {
  isIdentified: boolean;
  onLogout: () => void;
  onAccount?: () => void;
  onLogin?: () => void;
  showFeed?: boolean;
  showProducts?: boolean;
  showSignup?: boolean;
  onJoinVip: () => void;
}

const drawerItemSx = {
  color: '#d4d4d4',
  '&:hover': {
    bgcolor: 'rgba(200, 240, 0, 0.08)',
    color: VOLT,
  },
};

const drawerVipSignupSx = {
  ...drawerItemSx,
  color: VOLT,
  fontWeight: 700,
};

const drawerLogoutSx = {
  color: '#737373',
  mt: 'auto',
  borderTop: '1px solid #2a2a2a',
  '&:hover': {
    bgcolor: 'rgba(255, 255, 255, 0.04)',
    color: '#a3a3a3',
  },
};

export function Header({
  isIdentified,
  onLogout,
  onAccount,
  onLogin,
  showFeed,
  showProducts,
  showSignup,
  onJoinVip,
}: HeaderProps) {
  const { lines, openCart, vipUpgradeLineActive } = useCart();
  const { user } = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const count = lines.reduce((n, l) => n + l.qty, 0) + (vipUpgradeLineActive ? 1 : 0);

  const closeDrawer = () => setDrawerOpen(false);

  const runAction = (action: () => void) => {
    closeDrawer();
    action();
  };

  return (
    <NavBar>
      <CenteredHeader>
        <Logo>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: '0.35rem' }}>
            <LogoText>
              DARK<Volt>TRAINERS</Volt>
            </LogoText>
          </Link>
        </Logo>

        <NavLinks>
          {showProducts && (
            <NavLink>
              <Link to="/products">Shop</Link>
            </NavLink>
          )}
          {showFeed && (
            <NavLink>
              <Link to="/drops">Feed</Link>
            </NavLink>
          )}
          <NavLink>
            <Link to="/reviews">Reviews</Link>
          </NavLink>
          <NavLink>
            <Link to="/about">About</Link>
          </NavLink>
          <NavLink>
            <Link to="/faq">FAQ</Link>
          </NavLink>
          {isIdentified && onAccount && (
            <NavLink>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onAccount();
                }}
              >
                Account
              </a>
            </NavLink>
          )}
          {isIdentified && isIdentifiedUser(user) && <MemberBadge tier={user.memberTier} />}
          {(!isIdentifiedUser(user) || user.memberTier !== 'vip') && (
            <NavLink>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onJoinVip();
                }}
              >
                Join VIP
              </a>
            </NavLink>
          )}
          <NavLink>
            <IconBtn type="button" onClick={openCart} aria-label="Open cart">
              Cart
              {count > 0 && <Badge>{count > 99 ? '99+' : count}</Badge>}
            </IconBtn>
          </NavLink>
          {isIdentified && (
            <NavLink>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onLogout();
                }}
              >
                Log out
              </a>
            </NavLink>
          )}
          {showSignup && (
            <NavLink>
              <Link to="/signup" style={{ color: '#c8f000', fontWeight: 700 }}>
                VIP signup
              </Link>
            </NavLink>
          )}
        </NavLinks>

        <MobileActions>
          <IconButton
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            sx={{ color: VOLT, width: 44, height: 44, flexShrink: 0, p: 0 }}
          >
            <MenuIcon />
          </IconButton>
          <MobileCartBtn type="button" onClick={openCart} aria-label="Open cart">
            Cart
            {count > 0 && <span data-cart-badge>{count > 99 ? '99+' : count}</span>}
          </MobileCartBtn>
        </MobileActions>
      </CenteredHeader>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={closeDrawer}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' } }}
        PaperProps={{
          sx: {
            width: 280,
            bgcolor: '#0a0a0a',
            color: '#d4d4d4',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <DrawerHeader>
          <DrawerTitle>Menu</DrawerTitle>
          <IconButton aria-label="Close menu" onClick={closeDrawer} sx={{ color: '#a3a3a3' }}>
            <CloseIcon />
          </IconButton>
        </DrawerHeader>

        <List sx={{ flex: 1, display: 'flex', flexDirection: 'column', py: 0 }}>
          {showProducts && (
            <ListItemButton component={Link} to="/products" onClick={closeDrawer} sx={drawerItemSx}>
              <ListItemText primary="Shop" />
            </ListItemButton>
          )}
          {showFeed && (
            <ListItemButton component={Link} to="/drops" onClick={closeDrawer} sx={drawerItemSx}>
              <ListItemText primary="Feed" />
            </ListItemButton>
          )}
          <ListItemButton component={Link} to="/reviews" onClick={closeDrawer} sx={drawerItemSx}>
            <ListItemText primary="Reviews" />
          </ListItemButton>
          <ListItemButton component={Link} to="/about" onClick={closeDrawer} sx={drawerItemSx}>
            <ListItemText primary="About" />
          </ListItemButton>
          <ListItemButton component={Link} to="/faq" onClick={closeDrawer} sx={drawerItemSx}>
            <ListItemText primary="FAQ" />
          </ListItemButton>

          {isIdentified && onAccount && (
            <ListItemButton onClick={() => runAction(onAccount)} sx={drawerItemSx}>
              <ListItemText
                primary={
                  <AccountRow>
                    <span>Account</span>
                    {isIdentifiedUser(user) && (
                      <>
                        <span style={{ color: '#737373', fontSize: '0.85rem' }}>{user.name}</span>
                        <MemberBadge tier={user.memberTier} />
                      </>
                    )}
                  </AccountRow>
                }
              />
            </ListItemButton>
          )}

          {(!isIdentifiedUser(user) || user.memberTier !== 'vip') && (
            <ListItemButton onClick={() => runAction(onJoinVip)} sx={drawerItemSx}>
              <ListItemText primary="Join VIP" />
            </ListItemButton>
          )}

          {showSignup && (
            <ListItemButton component={Link} to="/signup" onClick={closeDrawer} sx={drawerVipSignupSx}>
              <ListItemText primary="VIP signup" />
            </ListItemButton>
          )}

          {!isIdentified && onLogin && (
            <ListItemButton onClick={() => runAction(onLogin)} sx={drawerItemSx}>
              <ListItemIcon sx={{ minWidth: 36, color: VOLT }}>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Log in" />
            </ListItemButton>
          )}

          {isIdentified && (
            <ListItemButton onClick={() => runAction(onLogout)} sx={drawerLogoutSx}>
              <ListItemText primary="Log out" />
            </ListItemButton>
          )}
        </List>
      </Drawer>
    </NavBar>
  );
}
