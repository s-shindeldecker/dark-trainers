import styled from '@emotion/styled';
import type { SearchLabResponse } from '../../lib/searchLabApi';
import { LAB } from './palette';

const Strip = styled.div`
  margin-top: 1.25rem;
  padding: 0.65rem 0.8rem;
  font-size: 0.78rem;
  color: ${LAB.inkMuted};
  background: ${LAB.surfaceMuted};
  border: 1px solid ${LAB.border};
  border-radius: 10px;
`;

const Grid = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.75rem;
  margin: 0;
`;

const Term = styled.dt`
  font-weight: 600;
`;

const Value = styled.dd`
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${LAB.ink};
  word-break: break-all;
`;

const FallbackBadge = styled.div`
  display: inline-block;
  margin-bottom: 0.5rem;
  padding: 0.2rem 0.55rem;
  font-weight: 700;
  color: ${LAB.warnInk};
  background: ${LAB.warnBg};
  border: 1px solid ${LAB.warnBorder};
  border-radius: 6px;
`;

const show = (v: string | number | null) => (v === null ? '—' : String(v));

interface DebugStripProps {
  data: SearchLabResponse;
  sessionKey: string;
}

export function DebugStrip({ data, sessionKey }: DebugStripProps) {
  return (
    <Strip aria-label="Debug info">
      {data.fallbackUsed && (
        <FallbackBadge>keyword fallback: {data.fallbackReason ?? 'unknown'}</FallbackBadge>
      )}
      <Grid>
        <Term>served</Term>
        <Value>{data.served}</Value>
        <Term>variationKey</Term>
        <Value>{show(data.variationKey)}</Value>
        <Term>modelName</Term>
        <Value>{show(data.modelName)}</Value>
        <Term>tokens</Term>
        <Value>{show(data.tokens)}</Value>
        <Term>latencyMs</Term>
        <Value>{data.latencyMs}</Value>
        <Term>sessionKey</Term>
        <Value>{sessionKey}</Value>
      </Grid>
    </Strip>
  );
}
