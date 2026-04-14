import styled from '@emotion/styled';

const Bubble = styled.div<{ isUser: boolean }>(({ isUser }) => ({
  maxWidth: '80%',
  padding: '0.75em 1em',
  borderRadius: 12,
  fontSize: '0.95em',
  lineHeight: 1.5,
  alignSelf: isUser ? 'flex-end' : 'flex-start',
  background: isUser ? '#35524A' : '#F6E7CB',
  color: isUser ? '#fff' : '#35524A',
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
