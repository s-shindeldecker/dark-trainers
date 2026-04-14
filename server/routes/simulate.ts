import { Router } from 'express';
import type { LDClient } from '@launchdarkly/node-server-sdk';
import { runSimulation } from '../simulation/engine.js';
import type { SimulationParams, RunningTotals, VariationName } from '../simulation/engine.js';

const VALID_VARIATIONS: VariationName[] = ['Control', 'Variant 1', 'Next Generation'];

function validateParams(body: unknown): SimulationParams | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const totalUsers = Number(b.totalUsers);
  const usersPerSecond = Number(b.usersPerSecond);
  const effectSize = Number(b.effectSize);
  const noiseLevel = Number(b.noiseLevel);
  const winningVariation = b.winningVariation as VariationName;

  if (!Number.isFinite(totalUsers) || totalUsers < 1 || totalUsers > 2000) return null;
  if (!Number.isFinite(usersPerSecond) || usersPerSecond < 0.1 || usersPerSecond > 50) return null;
  if (!Number.isFinite(effectSize) || effectSize < 0 || effectSize > 1) return null;
  if (!Number.isFinite(noiseLevel) || noiseLevel < 0 || noiseLevel > 1) return null;
  if (!VALID_VARIATIONS.includes(winningVariation)) return null;

  return { totalUsers, usersPerSecond, effectSize, noiseLevel, winningVariation };
}

function emptyRunning(): RunningTotals {
  return { totalUsers: 0, experimentUsers: 0, byVariation: {} };
}

export function createSimulateRouter(ldClient: LDClient) {
  const router = Router();

  /**
   * POST /api/simulate/start
   *
   * Accepts SimulationParams as JSON body.
   * Returns a Server-Sent Events stream of SimulationEvent objects.
   * Each event is: `data: {...}\n\n`
   *
   * Event types: 'user' | 'progress' | 'complete' | 'error'
   */
  router.post('/start', async (req, res) => {
    const params = validateParams(req.body);

    if (!params) {
      res.status(400).json({ error: 'Invalid simulation parameters' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
    res.flushHeaders();

    const controller = new AbortController();

    // Abort the simulation if the client disconnects
    req.on('close', () => {
      if (!controller.signal.aborted) {
        controller.abort();
        console.log('[Simulator] Client disconnected — simulation aborted.');
      }
    });

    const sendEvent = (data: unknown) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    console.log('[Simulator] Simulation started:', params);

    try {
      await runSimulation(params, ldClient, sendEvent, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('[Simulator] Unexpected error:', err);
        sendEvent({
          type: 'error',
          running: emptyRunning(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!res.writableEnded) {
      res.end();
    }

    console.log('[Simulator] Simulation complete. Users:', params.totalUsers);
  });

  return router;
}
