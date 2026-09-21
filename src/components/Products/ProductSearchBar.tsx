import styled from '@emotion/styled';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Product } from './productData';

/** A suggestion row: the catalog shape plus the server's entitlement verdict. */
export type Suggestion = Product & { _purchasable?: boolean };

/** How many suggestions the dropdown shows, regardless of how many came back. */
const MAX_SUGGESTIONS = 7;

const Shell = styled.div`
  position: relative;
  max-width: 660px;
  width: 100%;
  margin: 0 auto 1.75rem;
`;

const Form = styled.form`
  display: flex;
  gap: 0.5rem;
  width: 100%;
`;

/* Wraps the input so the search icon can sit inside the field. */
const Field = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
`;

const Icon = styled.svg`
  position: absolute;
  left: 0.85rem;
  width: 1.05rem;
  height: 1.05rem;
  color: #737373;
  pointer-events: none;
`;

const Input = styled.input`
  width: 100%;
  min-width: 0;
  padding: 0.8em 0.9em 0.8em 2.5rem;
  font-size: 1rem;
  color: #f5f5f5;
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  &::placeholder {
    color: #6b6b6b;
  }
  &:hover {
    border-color: #3a3a3a;
  }
  &:focus {
    outline: none;
    background: #131313;
    border-color: #c8f000;
    box-shadow: 0 0 0 3px rgba(200, 240, 0, 0.12);
  }
  /* The native clear affordance fights our own Clear button. */
  &::-webkit-search-cancel-button {
    display: none;
  }
`;

const SubmitButton = styled.button`
  padding: 0.8em 1.25em;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0d0d0d;
  background: #c8f000;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: filter 0.15s, opacity 0.15s;
  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

const ClearButton = styled.button`
  padding: 0.8em 0.95em;
  font-size: 0.85rem;
  color: #d4d4d4;
  background: #171717;
  border: 1px solid #333;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
  &:hover {
    border-color: #c8f000;
    color: #f5f5f5;
  }
`;

const Panel = styled.div`
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  right: 0;
  z-index: 40;
  background: #0f0f0f;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6);
  overflow: hidden;
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #1f1f1f;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #6b6b6b;
`;

const ArmChip = styled.code`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  color: #c8f000;
  background: rgba(200, 240, 0, 0.08);
  border: 1px solid #4d5c00;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
`;

const Row = styled(Link)<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.75rem;
  text-decoration: none;
  color: inherit;
  border-left: 3px solid ${({ $active }) => ($active ? '#c8f000' : 'transparent')};
  background: ${({ $active }) => ($active ? 'rgba(200, 240, 0, 0.06)' : 'transparent')};
  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }
`;

const Thumb = styled.img`
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 8px;
  object-fit: cover;
  background: #1a1a1a;
`;

const RowText = styled.div`
  min-width: 0;
  flex: 1;
`;

const RowName = styled.div`
  font-size: 0.9rem;
  font-weight: 600;
  color: #f5f5f5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RowMeta = styled.div`
  font-size: 0.75rem;
  color: #8a8a8a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RowPrice = styled.div`
  font-size: 0.88rem;
  font-weight: 700;
  color: #f5f5f5;
  white-space: nowrap;
`;

const RowLocked = styled.div`
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #a3a3a3;
  border: 1px dashed #444;
  border-radius: 6px;
  padding: 0.15rem 0.4rem;
  white-space: nowrap;
`;

const PanelFoot = styled.button`
  display: block;
  width: 100%;
  padding: 0.55rem 0.75rem;
  text-align: center;
  font-size: 0.78rem;
  color: #a3a3a3;
  background: #131313;
  border: none;
  border-top: 1px solid #1f1f1f;
  cursor: pointer;
  &:hover {
    color: #c8f000;
  }
`;

const PanelEmpty = styled.div`
  padding: 0.9rem 0.75rem;
  text-align: center;
  font-size: 0.82rem;
  color: #8a8a8a;
`;

interface ProductSearchBarProps {
  /** Submit — runs the full search and renders the grid. */
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching: boolean;
  /** True when results (or a zero-result message) are on screen. */
  hasResults: boolean;
  /**
   * Fires on every keystroke. The parent debounces and decides whether to
   * request suggestions — this component never fetches, so all eventing stays
   * in one place.
   */
  onQueryChange: (query: string) => void;
  /**
   * Presentation for the served arm, as reported by the server. `undefined`
   * until the first response: the dropdown stays closed until the backend has
   * told us this visitor gets typeahead, so the control arm never flashes one.
   */
  mode: 'submit' | 'typeahead' | undefined;
  suggestions: Suggestion[];
  /** The query `suggestions` belong to — stale results are not rendered. */
  suggestionsQuery: string;
  totalSuggestionCount: number;
  /** Fires `search_result_clicked` for the chosen suggestion. */
  onSuggestionSelect: (product: Product) => void;
  /** Served arm, shown in the panel head when the demo toggle is on. */
  servedArm?: string;
  showServedBadge: boolean;
}

export function ProductSearchBar({
  onSearch,
  onClear,
  isSearching,
  hasResults,
  onQueryChange,
  mode,
  suggestions,
  suggestionsQuery,
  totalSuggestionCount,
  onSuggestionSelect,
  servedArm,
  showServedBadge,
}: ProductSearchBarProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shellRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const trimmed = value.trim();
  const rows = suggestions.slice(0, MAX_SUGGESTIONS);
  // Only show the panel for the query currently in the box. Without this a
  // slower response for "vol" can briefly render under "volt running".
  const fresh = suggestionsQuery === trimmed && trimmed.length > 0;
  const showPanel = open && mode === 'typeahead' && fresh;

  // Close on click outside. mousedown rather than click so the panel is gone
  // before a click on the page behind it resolves.
  useEffect(() => {
    if (!showPanel) return;
    const onDown = (e: MouseEvent) => {
      if (!shellRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showPanel]);

  // A changed suggestion set invalidates the highlight — index 2 of the old
  // list is not index 2 of the new one.
  useEffect(() => {
    setActive(-1);
  }, [suggestionsQuery]);

  const change = (next: string) => {
    setValue(next);
    setOpen(true);
    onQueryChange(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || isSearching) return;
    setOpen(false);
    onSearch(trimmed);
  };

  const choose = (product: Suggestion) => {
    setOpen(false);
    onSuggestionSelect(product);
    navigate(`/products/${product.id}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showPanel || rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      // Enter on a highlighted row opens it; Enter with nothing highlighted
      // falls through to the form's submit and shows the full grid.
      e.preventDefault();
      choose(rows[active]);
    }
  };

  const clear = () => {
    setValue('');
    setOpen(false);
    setActive(-1);
    onQueryChange('');
    onClear();
  };

  return (
    <Shell ref={shellRef}>
      <Form onSubmit={submit} role="search">
        <Field>
          <Icon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </Icon>
          <Input
            type="search"
            value={value}
            onChange={(e) => change(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search the catalog — try “volt running” or “limited”"
            aria-label="Search products"
            autoComplete="off"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="plp-search-suggestions"
            maxLength={120}
          />
        </Field>
        <SubmitButton type="submit" disabled={isSearching || trimmed.length === 0}>
          {isSearching ? 'Searching…' : 'Search'}
        </SubmitButton>
        {hasResults && (
          <ClearButton type="button" onClick={clear}>
            Clear
          </ClearButton>
        )}
      </Form>

      {showPanel && (
        <Panel id="plp-search-suggestions" role="listbox">
          <PanelHead>
            <span>Suggestions</span>
            {showServedBadge && servedArm && <ArmChip>{servedArm}</ArmChip>}
          </PanelHead>
          {rows.length === 0 ? (
            <PanelEmpty>No matches for “{suggestionsQuery}”.</PanelEmpty>
          ) : (
            <>
              {rows.map((p, i) => (
                <Row
                  key={p.id}
                  to={`/products/${p.id}`}
                  $active={i === active}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                >
                  <Thumb src={p.imageUrl} alt="" loading="lazy" />
                  <RowText>
                    <RowName>
                      {p.name}
                      {p.subtitle ? ` — ${p.subtitle}` : ''}
                    </RowName>
                    <RowMeta>
                      {p.category} · {p.colorway}
                    </RowMeta>
                  </RowText>
                  {p._purchasable === false ? (
                    <RowLocked>VIP only</RowLocked>
                  ) : (
                    <RowPrice>${p.price}</RowPrice>
                  )}
                </Row>
              ))}
              <PanelFoot type="button" onClick={() => submit({ preventDefault() {} } as FormEvent)}>
                {totalSuggestionCount > rows.length
                  ? `See all ${totalSuggestionCount} results`
                  : 'See results'}
              </PanelFoot>
            </>
          )}
        </Panel>
      )}
    </Shell>
  );
}
