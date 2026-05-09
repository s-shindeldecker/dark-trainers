import styled from '@emotion/styled';
import { Link } from 'react-router-dom';

const FooterBar = styled.footer`
  width: 100%;
  background: #0d0d0d;
  border-top: 1px solid #2a2a2a;
  padding: 2rem 0 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.9rem;
  color: #a3a3a3;
`;

const FooterLinks = styled.ul`
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin: 0 0 1rem;
  padding: 0;
  justify-content: center;
`;

const FooterLink = styled.li`
  a {
    text-decoration: none;
    color: #a3a3a3;
    transition: color 0.2s;
    &:hover {
      color: #c8f000;
    }
  }
`;

const Copyright = styled.div`
  font-size: 0.8rem;
  color: #737373;
`;

const Tagline = styled.div`
  font-size: 0.85rem;
  color: #c8f000;
  margin-top: 0.5rem;
  font-weight: 500;
`;

export const Footer = () => {
  return (
    <FooterBar>
      <div className="centered-container">
        <FooterLinks>
          <FooterLink>
            <Link to="/reviews">Reviews</Link>
          </FooterLink>
          <FooterLink>
            <Link to="/about">About</Link>
          </FooterLink>
          <FooterLink>
            <Link to="/faq">FAQ</Link>
          </FooterLink>
          <FooterLink>
            <Link to="/products">Shop</Link>
          </FooterLink>
          <FooterLink>
            <a href="#">Privacy</a>
          </FooterLink>
          <FooterLink>
            <a href="#">Terms</a>
          </FooterLink>
        </FooterLinks>
        <Copyright>&copy; {new Date().getFullYear()} DarkTrainers. All rights reserved.</Copyright>
        <Tagline>Drop-Ready, just a toggle away.</Tagline>
      </div>
    </FooterBar>
  );
};
