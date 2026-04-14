import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import logo from '/gravity-farms-logo.png';

const NavBar = styled.nav`
  width: 100%;
  background: transparent;
  border-bottom: none;
  display: flex;
  align-items: center;
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 100;
`;

const CenteredHeader = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  background: #F6E7CB;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  padding: 0.5em 2em;
`;

const Logo = styled.div`
  font-weight: bold;
  font-size: 1.5em;
  color: #4caf50;
  margin-right: 2em;
`;

const LogoImg = styled.img`
  height: 100px;
  margin-right: 0.5em;
  vertical-align: middle;
`;

const LogoText = styled.span`
  font-weight: bold;
  font-size: 1.5em;
  color: #35524A;
`;

const NavLinks = styled.ul`
  list-style: none;
  display: flex;
  gap: 1.5em;
  margin: 0;
  padding: 0;
`;

const NavLink = styled.li`
  a {
    text-decoration: none;
    color: #333;
    font-weight: 500;
    transition: color 0.2s;
    &:hover {
      color: #4caf50;
    }
  }
`;

const GetStartedButton = styled(Link)`
  display: inline-block;
  background: #FFD166;
  color: #35524A;
  padding: 0.5em 1.2em;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.95em;
  text-decoration: none;
  transition: background 0.2s;
  &:hover {
    background: #FFC233;
  }
`;

interface HeaderProps {
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onAccount?: () => void;
  showProducts?: boolean;
  showOurFood?: boolean;
  showSignup?: boolean;
}

export const Header = ({ isLoggedIn, onLogin, onLogout, onAccount, showProducts, showOurFood, showSignup }: HeaderProps) => {
  return (
    <NavBar>
      <CenteredHeader>
        <div className="centered-container">
          <Logo>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              <LogoImg src={logo} alt="Gravity Farms Petfood logo" />
              <LogoText>Gravity Farms Petfood</LogoText>
            </Link>
          </Logo>
          <NavLinks>
            <NavLink><Link to="/">Home</Link></NavLink>
            {showOurFood && (
              <NavLink><Link to="/our-food">Our Food</Link></NavLink>
            )}
            {showProducts && (
              <NavLink><Link to="/products">Products</Link></NavLink>
            )}
            <NavLink><Link to="/reviews">Reviews</Link></NavLink>
            <NavLink><Link to="/about">About Us</Link></NavLink>
            <NavLink><Link to="/why-gravity-farms">Why Gravity Farms?</Link></NavLink>
            <NavLink><Link to="/faq">FAQ</Link></NavLink>
            <NavLink><Link to="#">For Vet Professionals</Link></NavLink>
            {isLoggedIn && (
              <NavLink><a href="#" onClick={onAccount}>Account</a></NavLink>
            )}
            <NavLink>
              {isLoggedIn ? (
                <a href="#" onClick={onLogout}>Log Out</a>
              ) : (
                <a href="#" onClick={onLogin}>Log In</a>
              )}
            </NavLink>
            {showSignup && (
              <NavLink><GetStartedButton to="/signup">Get Started</GetStartedButton></NavLink>
            )}
          </NavLinks>
        </div>
      </CenteredHeader>
    </NavBar>
  );
};
