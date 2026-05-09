import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { MemberBadge } from '../Member/MemberBadge';
import { isIdentifiedUser } from '../../types/darktrainers';
import { useUser } from '../../context/UserContext';

const NavBar = styled.nav`
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 100;
`;

const CenteredHeader = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  background: rgba(13, 13, 13, 0.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  padding: 0.5rem 1.25rem;
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

interface HeaderProps {
  isIdentified: boolean;
  onLogout: () => void;
  onAccount?: () => void;
  showProducts?: boolean;
  showSignup?: boolean;
  onJoinVip: () => void;
}

export function Header({ isIdentified, onLogout, onAccount, showProducts, showSignup, onJoinVip }: HeaderProps) {
  const { lines, openCart } = useCart();
  const { user } = useUser();
  const count = lines.reduce((n, l) => n + l.qty, 0);

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
      </CenteredHeader>
    </NavBar>
  );
}
