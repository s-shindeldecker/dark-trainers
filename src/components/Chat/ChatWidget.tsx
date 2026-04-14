import { useState, useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { ChatMessage } from './ChatMessage';
import { useUser } from '../../context/UserContext';

const FloatingButton = styled.button`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #35524A;
  color: #FFD166;
  border: none;
  font-size: 1.6em;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(53, 82, 74, 0.35);
  z-index: 999;
  transition: background 0.2s, transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: #6A994E;
    transform: scale(1.05);
  }
`;

const Panel = styled.div`
  position: fixed;
  bottom: 90px;
  right: 24px;
  width: 380px;
  max-height: 520px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(53, 82, 74, 0.2);
  z-index: 999;
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
  background: #35524A;
  color: #fff;
  padding: 1em 1.25em;
  font-weight: 600;
  font-size: 1.05em;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #FFD166;
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
  border-top: 1px solid #eee;
  padding: 0.5em;
  gap: 0.5em;
`;

const Input = styled.input`
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.6em 0.8em;
  font-size: 0.95em;
  outline: none;
  &:focus {
    border-color: #6A994E;
  }
`;

const SendButton = styled.button`
  background: #FFD166;
  color: #35524A;
  border: none;
  border-radius: 8px;
  padding: 0.6em 1.2em;
  font-weight: bold;
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
    { role: 'assistant', content: "Hi! I'm the Gravity Farms assistant. How can I help you today?" },
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
          userContext: user,
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
            Gravity Farms Assistant
            <CloseButton onClick={() => setIsOpen(false)} aria-label="Close chat">&times;</CloseButton>
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
              placeholder="Ask about our products..."
              disabled={isLoading}
              autoFocus
            />
            <SendButton type="submit" disabled={isLoading || !input.trim()}>
              Send
            </SendButton>
          </InputRow>
        </Panel>
      )}
      <FloatingButton onClick={() => setIsOpen(!isOpen)} aria-label="Toggle chat">
        {isOpen ? '✕' : '💬'}
      </FloatingButton>
    </>
  );
};
