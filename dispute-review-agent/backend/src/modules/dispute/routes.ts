/**
 * Dispute Review — API Routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { disputeStore } from './store';
import { reviewDispute } from './agents/orchestrator';
import { sampleDatasetSchema } from './agents/dataset';
import type { CreateDisputeDTO } from './types';

export const disputeRouter: Router = Router();

// Accept the JSON block from the sample markdown directly. This endpoint returns
// the original dispute ID, both submissions and the ruling; it does not persist a case.
disputeRouter.post('/dataset-review', async (req: Request, res: Response) => {
  const dataset = sampleDatasetSchema.parse(req.body);
  const review = await reviewDispute(dataset);
  res.json({ data: review });
});

// ============================================
// Zod validation schema for case creation
// ============================================
const partySchema = z.object({
  name: z.string(),
  id: z.string(),
  rating: z.number(),
  statement: z.string(),
});

const tripSchema = z.object({
  pickupLocation: z.string(),
  dropoffLocation: z.string(),
  pickupTime: z.string(),
  dropoffTime: z.string(),
  fare: z.number(),
  distance: z.number(),
  vehicleModel: z.string(),
  plateNumber: z.string(),
});

const evidenceInputSchema = z.object({
  party: z.enum(['driver', 'rider']),
  kind: z.enum(['text', 'chat', 'gps', 'payment', 'photo']),
  title: z.string(),
  content: z.string(),
});

const createDisputeSchema = z.object({
  title: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  type: z.enum([
    'route_deviation',
    'no_show_charge',
    'property_damage',
    'safety_accident',
  ]),
  driver: partySchema,
  passenger: partySchema,
  trip: tripSchema,
  evidence: z.array(evidenceInputSchema),
});

// ============================================
// Routes
// ============================================

/**
 * GET /api/disputes/stats — Dashboard statistics
 */
disputeRouter.get('/stats', async (_req: Request, res: Response) => {
  res.json({ data: disputeStore.getStats() });
});

/**
 * GET /api/disputes — List all disputes
 */
disputeRouter.get('/', async (_req: Request, res: Response) => {
  res.json({ data: disputeStore.getAll() });
});

/**
 * GET /api/disputes/:id — Get a single dispute
 */
disputeRouter.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const dispute = disputeStore.getById(id);
  if (!dispute) {
    throw new AppError(404, '案件不存在');
  }
  res.json({ data: dispute });
});

/**
 * POST /api/disputes — Create a new dispute
 */
disputeRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createDisputeSchema.parse(req.body);
  const newCase = disputeStore.create(parsed as CreateDisputeDTO);
  res.status(201).json({ data: newCase });
});

/**
 * POST /api/disputes/:id/evidence — Driver or rider adds evidence to a case
 */
disputeRouter.post('/:id/evidence', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const parsed = evidenceInputSchema.parse(req.body);
  const updated = disputeStore.addEvidence(id, parsed);
  if (!updated) {
    throw new AppError(404, '案件不存在');
  }
  res.status(201).json({ data: updated });
});

/**
 * POST /api/disputes/:id/review — Trigger AI review
 */
disputeRouter.post('/:id/review', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const dispute = disputeStore.getById(id);
  if (!dispute) {
    throw new AppError(404, '案件不存在');
  }

  // Mark as under review
  disputeStore.setStatus(id, 'under_review');

  try {
    const review = await reviewDispute(dispute);
    const updated = disputeStore.updateReview(id, review);
    // A failed or inconclusive review must remain open for a later retry.
    if (review.mode === 'fallback' || review.recommendation === 'inconclusive') {
      disputeStore.setStatus(id, 'pending');
    }
    res.json({ data: updated });
  } catch (error) {
    // Revert status on failure
    disputeStore.setStatus(id, 'pending');
    const message =
      error instanceof Error ? error.message : 'AI审查失败，请稍后重试';
    throw new AppError(500, message);
  }
});
