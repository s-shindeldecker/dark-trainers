import { useState, useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { ChatMessage } from '../Chat/ChatMessage';
import { useUser } from '../../context/UserContext';
import { products } from '../Products/productData';

const ConversationPanel = styled.div`
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 500px;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5em 0;
  display: flex;
  flex-direction: column;
  gap: 1em;
  max-height: 60vh;
`;

const InputRow = styled.form`
  display: flex;
  gap: 0.75em;
  padding: 1em 0;
  border-top: 1px solid #eee;
`;

const Input = styled.input`
  flex: 1;
  border: 2px solid #ddd;
  border-radius: 10px;
  padding: 0.8em 1em;
  font-size: 1em;
  outline: none;
  &:focus {
    border-color: #6A994E;
  }
`;

const SendButton = styled.button`
  background: #FFD166;
  color: #35524A;
  border: none;
  border-radius: 10px;
  padding: 0.8em 1.5em;
  font-weight: bold;
  font-size: 1em;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #FFC233;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TypingIndicator = styled.div`
  align-self: flex-start;
  color: #999;
  font-style: italic;
  font-size: 0.95em;
  padding: 0.5em 0;
`;

const RecommendationCard = styled.div`
  background: #35524A;
  color: #fff;
  border-radius: 16px;
  padding: 2em;
  margin: 1em 0;
  text-align: center;
  box-shadow: 0 8px 32px rgba(53, 82, 74, 0.25);
`;

const RecPlanName = styled.h3`
  font-size: 1.6em;
  margin: 0 0 0.2em;
`;

const RecTagline = styled.p`
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 0.8em;
`;

const RecPrice = styled.div`
  font-size: 2.2em;
  font-weight: bold;
  margin-bottom: 0.1em;
`;

const RecInterval = styled.div`
  font-size: 0.85em;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 1.5em;
`;

const RecFeatures = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 1.5em;
  text-align: left;
`;

const RecFeature = styled.li`
  padding: 0.4em 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.95em;
  &::before {
    content: "✓ ";
    color: #FFD166;
    font-weight: bold;
  }
`;

const RecSignupButton = styled.button`
  background: #FFD166;
  color: #35524A;
  border: none;
  border-radius: 8px;
  padding: 0.9em 2.5em;
  font-weight: bold;
  font-size: 1.1em;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #FFC233;
  }
`;

const StartOverLink = styled.button`
  background: none;
  border: none;
  color: #6A994E;
  font-size: 0.95em;
  cursor: pointer;
  margin-top: 1em;
  text-decoration: underline;
  &:hover {
    color: #35524A;
  }
`;

const BrowsePlansLink = styled(Link)`
  display: inline-block;
  margin-top: 0.75em;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9em;
  text-decoration: underline;
  &:hover {
    color: #fff;
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
  content: "Hi! I'm here to help find the perfect Gravity Farms plan for your pet. Let's start — what's your pet's name?",
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
          userContext: user,
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

  const recProduct = recommendation ? products.find((p) => p.id === recommendation.planId) : null;

  return (
    <ConversationPanel>
      <MessageList ref={listRef}>
        {messages.map((m, i) => (
          <ChatMessage key={i} content={m.content} isUser={m.role === 'user'} />
        ))}
        {isLoading && <TypingIndicator>Thinking...</TypingIndicator>}
        {recProduct && (
          <RecommendationCard>
            <RecPlanName>{recProduct.name}</RecPlanName>
            <RecTagline>{recProduct.tagline}</RecTagline>
            <RecPrice>{recProduct.price}</RecPrice>
            <RecInterval>{recProduct.interval}</RecInterval>
            <RecFeatures>
              {recProduct.features.map((f) => (
                <RecFeature key={f}>{f}</RecFeature>
              ))}
            </RecFeatures>
            <RecSignupButton onClick={() => alert('Thank you for your interest! This is a demo site.')}>
              Sign Up for {recProduct.name}
            </RecSignupButton>
            <br />
            <BrowsePlansLink to="/products">Or browse all plans</BrowsePlansLink>
          </RecommendationCard>
        )}
      </MessageList>
      <InputRow onSubmit={handleSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell me about your pet..."
          disabled={isLoading}
          autoFocus
        />
        <SendButton type="submit" disabled={isLoading || !input.trim()}>
          Send
        </SendButton>
      </InputRow>
      <StartOverLink onClick={handleStartOver}>Start over</StartOverLink>
    </ConversationPanel>
  );
};
