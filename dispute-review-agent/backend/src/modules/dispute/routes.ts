/**
 * Dispute Review — API Routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { disputeStore } from './store';
import { reviewDispute } from './agent';
import type { CreateDisputeDTO } from './types';

export const disputeRouter: Router = Router();

// ============================================
// Zod validation schema for case creation
// ============================================
const partySchema = z.object({
  name: z.string().min(1, '姓名不能为空'),
  id: z.string().min(1, 'ID不能为空'),
  rating: z.number().min(0).max(5),
  statement: z.string().min(10, '陈述至少需要10个字符'),
});

const tripSchema = z.object({
  pickupLocation: z.string().min(1),
  dropoffLocation: z.string().min(1),
  pickupTime: z.string().min(1),
  dropoffTime: z.string().min(1),
  fare: z.number().min(0),
  distance: z.number().min(0),
  vehicleModel: z.string().min(1),
  plateNumber: z.string().min(1),
});

const evidenceSchema = z.object({
  description: z.string().min(1),
  items: z.array(z.string()).min(1, '至少需要一项证据'),
});

const createDisputeSchema = z.object({
  title: z.string().min(5, '标题至少需要5个字符'),
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
  evidence: evidenceSchema,
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
    res.json({ data: updated });
  } catch (error) {
    // Revert status on failure
    disputeStore.setStatus(id, 'pending');
    const message =
      error instanceof Error ? error.message : 'AI审查失败，请稍后重试';
    throw new AppError(500, message);
  }
});
