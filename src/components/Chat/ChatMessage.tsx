import styled from '@emotion/styled';

const Bubble = styled.div<{ isUser: boolean }>(({ isUser }) => ({
  maxWidth: '80%',
  padding: '0.75em 1em',
  borderRadius: 12,
  fontSize: '0.95em',
  lineHeight: 1.5,
  alignSelf: isUser ? 'flex-end' : 'flex-start',
  background: isUser ? '#2a2a2a' : '#1a1a1a',
  color: isUser ? '#f5f5f5' : '#d4d4d4',
  border: `1px solid ${isUser ? '#404040' : '#333'}`,
  borderBottomRightRadius: isUser ? 2 : 12,
  borderBottomLeftRadius: isUser ? 12 : 2,
}));

interface ChatMessageProps {
  content: string;
  isUser: boolean;
}

export const ChatMessage = ({ content, isUser }: ChatMessageProps) => (
  <Bubble isUser={isUser}>{content}</Bubble>
);
