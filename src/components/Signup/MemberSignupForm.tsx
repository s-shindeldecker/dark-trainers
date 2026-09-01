import { useState } from 'react';
import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { useTrackConversion } from '../../hooks/useTrackConversion';
import { isIdentifiedUser } from '../../types/darktrainers';

const VOLT = '#c8f000';

const Card = styled.div`
  width: 100%;
  background: #161616;
  border: 1px solid #2e2e2e;
  border-radius: 14px;
  padding: 1.75rem 1.5rem;
`;

const FormHeading = styled.h2`
  margin: 0 0 1.25rem;
  font-size: 1.25rem;
  color: #f5f5f5;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #a3a3a3;
`;

const Input = styled.input`
  border: 1px solid #333;
  border-radius: 10px;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  outline: none;
  background: #111;
  color: #f5f5f5;
  &:focus {
    border-color: ${VOLT};
  }
`;

const Submit = styled.button`
  margin-top: 0.35rem;
  background: ${VOLT};
  color: #0d0d0d;
  border: none;
  border-radius: 10px;
  padding: 0.9rem 1.35rem;
  font-weight: 800;
  font-size: 1.05rem;
  cursor: pointer;
  &:hover {
    filter: brightness(1.05);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FinePrint = styled.p`
  margin: 0.85rem 0 0;
  font-size: 0.8rem;
  color: #737373;
  text-align: center;
`;

const ErrorText = styled.span`
  color: #ff6b6b;
  font-size: 0.85rem;
`;

const SuccessTitle = styled.h2`
  margin: 0 0 0.5rem;
  font-size: 1.6rem;
  color: #f5f5f5;
`;

const SuccessBody = styled.p`
  margin: 0 0 1.5rem;
  color: #d4d4d4;
  line-height: 1.55;
`;

const ShopCta = styled(Link)`
  display: inline-block;
  background: ${VOLT};
  color: #0d0d0d;
  border-radius: 10px;
  padding: 0.85rem 1.75rem;
  font-weight: 800;
  text-decoration: none;
  &:hover {
    filter: brightness(1.05);
  }
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lightweight DarkTrainers membership signup. Turns an anonymous guest into a
 * known Standard member (the "unknown → known" transition) and fires the
 * `member_signup` conversion. VIP is a separate paid tier handled by the
 * "Join VIP" upgrade modal — this flow never grants VIP.
 */
export const MemberSignupForm = () => {
  const { user, isAnonymousGuest, transitionGuestToStandard } = useUser();
  const { trackConversion } = useTrackConversion();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Already a known user (standard or vip) — signup is a confirmation, no tier change.
  const alreadyMember = isIdentifiedUser(user);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');

    // Only a guest becoming a member is a real conversion: fire the event (routed
    // through the shared hook so it honors track-conversions-via-gtm) and do the
    // unknown → known transition. An already-identified user (who can still reach
    // /signup via the hero CTA or other links) just gets a confirmation — no event,
    // no tier change — so the member_signup experiment metric isn't inflated.
    if (isAnonymousGuest) {
      trackConversion('member_signup');
      transitionGuestToStandard();
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card>
        <SuccessTitle className="font-display">You're a member. 🎉</SuccessTitle>
        <SuccessBody>
          Welcome to DarkTrainers{name.trim() ? `, ${name.trim()}` : ''}. You'll get early access to
          new drops and member-only offers. Want member pricing on every pair? Upgrade to VIP anytime.
        </SuccessBody>
        <ShopCta to="/products">Shop current drops</ShopCta>
      </Card>
    );
  }

  return (
    <Card>
      <FormHeading>Create your free account</FormHeading>
      <Form onSubmit={handleSubmit} noValidate>
        <Field>
          Email
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={!!error}
            autoFocus
            required
          />
        </Field>
        <Field>
          Name (optional)
          <Input
            type="text"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
          />
        </Field>
        {error && <ErrorText role="alert">{error}</ErrorText>}
        <Submit type="submit" disabled={!email.trim()}>
          {alreadyMember ? 'Confirm membership' : 'Become a member'}
        </Submit>
      </Form>
      <FinePrint>Free — no card required. VIP is an optional paid upgrade.</FinePrint>
    </Card>
  );
};
