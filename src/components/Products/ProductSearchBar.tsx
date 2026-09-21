import styled from '@emotion/styled';
import { useState, type FormEvent } from 'react';

const Form = styled.form`
  display: flex;
  gap: 0.5rem;
  max-width: 640px;
  margin: 0 auto 1.75rem;
  width: 100%;
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  padding: 0.7em 0.9em;
  font-size: 0.95rem;
  color: #f5f5f5;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  &::placeholder {
    color: #737373;
  }
  &:focus {
    outline: none;
    border-color: #c8f000;
  }
`;

const SubmitButton = styled.button`
  padding: 0.7em 1.15em;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0d0d0d;
  background: #c8f000;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const ClearButton = styled.button`
  padding: 0.7em 0.9em;
  font-size: 0.85rem;
  color: #d4d4d4;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    border-color: #c8f000;
  }
`;

interface ProductSearchBarProps {
  /** Runs a server-side search. Called only with a non-empty, trimmed query. */
  onSearch: (query: string) => void;
  /** Drops back to the default catalog grid. */
  onClear: () => void;
  /** True while a search request is in flight. */
  isSearching: boolean;
  /** True when results (or a zero-result message) are on screen. */
  hasResults: boolean;
}

export function ProductSearchBar({
  onSearch,
  onClear,
  isSearching,
  hasResults,
}: ProductSearchBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isSearching) return;
    onSearch(trimmed);
  };

  const handleClear = () => {
    setValue('');
    onClear();
  };

  return (
    <Form onSubmit={handleSubmit} role="search">
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search the catalog — try “volt running” or “limited”"
        aria-label="Search products"
        maxLength={120}
      />
      <SubmitButton type="submit" disabled={isSearching || value.trim().length === 0}>
        {isSearching ? 'Searching…' : 'Search'}
      </SubmitButton>
      {hasResults && (
        <ClearButton type="button" onClick={handleClear}>
          Clear
        </ClearButton>
      )}
    </Form>
  );
}
