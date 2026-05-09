import { useState, useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { ChatMessage } from '../Chat/ChatMessage';
import { useUser } from '../../context/UserContext';
import { userToApiContext } from '../../context/LDContext';
import { products } from '../Products/productData';

const ConversationPanel = styled.div`
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 480px;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 58vh;
`;

const InputRow = styled.form`
  display: flex;
  gap: 0.75rem;
  padding: 1rem 0;
  border-top: 1px solid #2a2a2a;
`;

const Input = styled.input`
  flex: 1;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  outline: none;
  background: #1a1a1a;
  color: #f5f5f5;
  &:focus {
    border-color: #c8f000;
  }
`;

const SendButton = styled.button`
  background: #c8f000;
  color: #0d0d0d;
  border: none;
  border-radius: 10px;
  padding: 0.75rem 1.35rem;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  &:hover {
    filter: brightness(1.05);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TypingIndicator = styled.div`
  align-self: flex-start;
  color: #737373;
  font-style: italic;
  font-size: 0.95em;
  padding: 0.5em 0;
`;

const RecommendationCard = styled.div`
  background: #1a1a1a;
  color: #f5f5f5;
  border-radius: 16px;
  padding: 1.75rem;
  margin: 0.5rem 0;
  text-align: center;
  border: 1px solid #333;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
`;

const RecPlanName = styled.h3`
  font-size: 1.5rem;
  margin: 0 0 0.35rem;
`;

const RecTagline = styled.p`
  color: #a3a3a3;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
`;

const RecPrice = styled.div`
  font-size: 2rem;
  font-weight: 800;
  color: #c8f000;
  margin-bottom: 0.25rem;
`;

const RecInterval = styled.div`
  font-size: 0.85rem;
  color: #737373;
  margin-bottom: 1.25rem;
`;

const RecFeatures = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  text-align: left;
`;

const RecFeature = styled.li`
  padding: 0.4rem 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 0.9rem;
  color: #d4d4d4;
  &::before {
    content: '✓ ';
    color: #c8f000;
    font-weight: bold;
  }
`;

const RecSignupButton = styled.button`
  background: #c8f000;
  color: #0d0d0d;
  border: none;
  border-radius: 8px;
  padding: 0.85rem 2rem;
  font-weight: 800;
  font-size: 1rem;
  cursor: pointer;
  &:hover {
    filter: brightness(1.06);
  }
`;

const StartOverLink = styled.button`
  background: none;
  border: none;
  color: #c8f000;
  font-size: 0.9rem;
  cursor: pointer;
  margin-top: 1rem;
  text-decoration: underline;
`;

const BrowsePlansLink = styled(Link)`
  display: inline-block;
  margin-top: 0.75rem;
  color: #a3a3a3;
  font-size: 0.9rem;
  text-decoration: underline;
  &:hover {
    color: #f5f5f5;
  }
`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface RecommendedPlan {
  planId: string;
  planName: string;
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    "Hey — I'm here to help you decide if DarkTrainers VIP is worth it. What do you usually wear sneakers for: running, hoops, lifestyle, or training?",
};

export const SignupAgent = () => {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<RecommendedPlan | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isLoading, recommendation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/signup-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
          userContext: userToApiContext(user),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.recommendedPlan) {
        setRecommendation(data.recommendedPlan);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, I'm having trouble connecting. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    setMessages([INITIAL_MESSAGE]);
    setRecommendation(null);
    setInput('');
  };

  const sneakerRec = recommendation ? products.find((p) => p.id === recommendation.planId) : null;
  const isVipRec = recommendation?.planId === 'vip-monthly';

  return (
    <ConversationPanel>
      <MessageList ref={listRef}>
        {messages.map((m, i) => (
          <ChatMessage key={i} content={m.content} isUser={m.role === 'user'} />
        ))}
        {isLoading && <TypingIndicator>Thinking...</TypingIndicator>}
        {isVipRec && (
          <RecommendationCard>
            <RecPlanName>DarkTrainers VIP</RecPlanName>
            <RecTagline>Early access + member pricing on limited drops</RecTagline>
            <RecPrice>$14.99</RecPrice>
            <RecInterval>per month · cancel anytime (demo)</RecInterval>
            <RecFeatures>
              <RecFeature>Early access windows before public drops</RecFeature>
              <RecFeature>Member pricing — typically 15–20% off</RecFeature>
              <RecFeature>Priority support on release days</RecFeature>
            </RecFeatures>
            <RecSignupButton type="button" onClick={() => alert('Demo only — no charge processed.')}>
              Upgrade to VIP — $14.99/month
            </RecSignupButton>
            <br />
            <BrowsePlansLink to="/products">Shop current drops</BrowsePlansLink>
          </RecommendationCard>
        )}
        {sneakerRec && !isVipRec && (
          <RecommendationCard>
            <RecPlanName>{sneakerRec.name}</RecPlanName>
            <RecTagline>{sneakerRec.colorway}</RecTagline>
            <RecPrice>${sneakerRec.price}</RecPrice>
            <RecInterval>Member ${sneakerRec.memberPrice} with VIP</RecInterval>
            <RecSignupButton type="button" onClick={() => alert('Demo only.')}>
              View product
            </RecSignupButton>
            <BrowsePlansLink to={`/products/${sneakerRec.id}`}>Open PDP</BrowsePlansLink>
          </RecommendationCard>
        )}
      </MessageList>
      <InputRow onSubmit={handleSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell us how you buy sneakers..."
          disabled={isLoading}
          autoFocus
        />
        <SendButton type="submit" disabled={isLoading || !input.trim()}>
          Send
        </SendButton>
      </InputRow>
      <StartOverLink type="button" onClick={handleStartOver}>
        Start over
      </StartOverLink>
    </ConversationPanel>
  );
};
