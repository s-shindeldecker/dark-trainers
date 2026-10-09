import styled from '@emotion/styled';
import { useState, type FormEvent } from 'react';
import { LAB } from './palette';

/** Matches the server's limits in server/routes/search-lab.ts. */
const MIN_QUERY = 2;
const MAX_QUERY = 200;

const Form = styled.form`
  display: flex;
  gap: 0.5rem;
  width: 100%;
`;

const Input = styled.input<{ $invalid: boolean }>`
  flex: 1;
  min-width: 0;
  padding: 0.75em 0.9em;
  font-size: 1rem;
  color: ${LAB.ink};
  background: ${LAB.surface};
  border: 1px solid ${({ $invalid }) => ($invalid ? LAB.errorBorder : LAB.border)};
  border-radius: 10px;
  &::placeholder {
    color: ${LAB.inkMuted};
  }
  &:focus {
    outline: none;
    border-color: ${LAB.accent};
    box-shadow: 0 0 0 3px ${LAB.accentSoft};
  }
`;

const Button = styled.button`
  padding: 0.75em 1.1em;
  font-size: 0.95rem;
  font-weight: 600;
  color: #ffffff;
  background: ${LAB.accent};
  border: none;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: ${LAB.accentHover};
  }
`;

const Hint = styled.p`
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: ${LAB.errorInk};
`;

interface SearchBarProps {
  onSearch: (query: string) => void;
}

/** Submit-only search: no typeahead, no debounced requests. */
export function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const query = value.trim();
    if (query.length < MIN_QUERY || query.length > MAX_QUERY) {
      setHint(`Enter ${MIN_QUERY} to ${MAX_QUERY} characters.`);
      return;
    }
    setHint(null);
    onSearch(query);
  };

  return (
    <div>
      <Form role="search" onSubmit={handleSubmit}>
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search rides, trails, dining…"
          aria-label="Search"
          aria-invalid={hint !== null}
          $invalid={hint !== null}
        />
        <Button type="submit">Search</Button>
      </Form>
      {hint && <Hint role="alert">{hint}</Hint>}
    </div>
  );
}
