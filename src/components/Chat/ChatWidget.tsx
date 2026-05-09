import { useState, useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { ChatMessage } from './ChatMessage';
import { useUser } from '../../context/UserContext';
import { userToApiContext } from '../../context/LDContext';

const FloatingButton = styled.button`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #111;
  color: #c8f000;
  border: 1px solid #333;
  font-size: 1.5em;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 10020;
  transition: transform 0.2s, border-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    border-color: #c8f000;
    transform: scale(1.05);
  }
`;

const Panel = styled.div`
  position: fixed;
  bottom: 90px;
  right: 24px;
  width: 380px;
  max-height: 520px;
  background: #111;
  border-radius: 16px;
  border: 1px solid #2a2a2a;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  z-index: 10020;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  @media (max-width: 480px) {
    width: calc(100vw - 32px);
    right: 16px;
    bottom: 80px;
  }
`;

const PanelHeader = styled.div`
  background: #0d0d0d;
  color: #f5f5f5;
  padding: 0.85rem 1.1rem;
  font-weight: 600;
  font-size: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #2a2a2a;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #c8f000;
  font-size: 1.2em;
  cursor: pointer;
  padding: 0;
  line-height: 1;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1em;
  display: flex;
  flex-direction: column;
  gap: 0.75em;
  min-height: 200px;
  max-height: 360px;
`;

const InputRow = styled.form`
  display: flex;
  border-top: 1px solid #2a2a2a;
  padding: 0.5em;
  gap: 0.5em;
`;

const Input = styled.input`
  flex: 1;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 0.6em 0.8em;
  font-size: 0.95em;
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
  border-radius: 8px;
  padding: 0.6em 1.2em;
  font-weight: 700;
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
  font-size: 0.9em;
  padding: 0.5em 0;
`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi — I'm the DarkTrainers assistant. Ask about drops, sizing, or VIP.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
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
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, I'm having trouble connecting. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {isOpen && (
        <Panel>
          <PanelHeader>
            DarkTrainers assistant
            <CloseButton type="button" onClick={() => setIsOpen(false)} aria-label="Close chat">
              &times;
            </CloseButton>
          </PanelHeader>
          <MessageList ref={listRef}>
            {messages.map((m, i) => (
              <ChatMessage key={i} content={m.content} isUser={m.role === 'user'} />
            ))}
            {isLoading && <TypingIndicator>Thinking...</TypingIndicator>}
          </MessageList>
          <InputRow onSubmit={handleSubmit}>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about drops or VIP..."
              disabled={isLoading}
              autoFocus
            />
            <SendButton type="submit" disabled={isLoading || !input.trim()}>
              Send
            </SendButton>
          </InputRow>
        </Panel>
      )}
      <FloatingButton type="button" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle chat">
        {isOpen ? '✕' : '💬'}
      </FloatingButton>
    </>
  );
};
