import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { isIdentifiedUser } from '../types/darktrainers';

const Card = styled.div`
  max-width: 480px;
  margin: 2rem auto;
  padding: 2rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  text-align: left;
`;

const Title = styled.h2`
  margin: 0 0 1rem;
  font-size: 1.5rem;
`;

const InfoRow = styled.div`
  margin-bottom: 0.65rem;
  font-size: 0.95rem;
  color: #d4d4d4;
`;

export const Account = () => {
  const { user, isIdentified } = useUser();

  if (!isIdentified || !isIdentifiedUser(user)) {
    return (
      <Card>
        <Title>Account</Title>
        <p style={{ color: '#a3a3a3' }}>Sign in as a member from Demo Controls, or add to cart as a guest to become Standard.</p>
        <Link to="/" style={{ color: '#c8f000' }}>
          Home
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <Title>Member profile</Title>
      <InfoRow>
        <strong>Name:</strong> {user.name}
      </InfoRow>
      <InfoRow>
        <strong>Email:</strong> {user.email}
      </InfoRow>
      <InfoRow>
        <strong>Tier:</strong> {user.memberTier.toUpperCase()}
      </InfoRow>
      <InfoRow>
        <strong>Member since:</strong> {user.memberSince}
      </InfoRow>
      <InfoRow>
        <strong>Lifetime spend:</strong> ${user.lifetimeSpend.toLocaleString()}
      </InfoRow>
      <InfoRow>
        <strong>Preferred category:</strong> {user.preferredCategory}
      </InfoRow>
      <InfoRow>
        <strong>Early access:</strong> {user.earlyAccessEnabled ? 'Yes' : 'No'}
      </InfoRow>
      <InfoRow>
        <strong>User key:</strong> {user.key}
      </InfoRow>
    </Card>
  );
};
