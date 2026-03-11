import { z } from "zod";
import { Router, Request, Response, NextFunction } from "express";
import { createLogger } from "../_core/logger";
import { authenticateA2A } from "../_core/routers/auth-router";
import { addKnowledge } from "./knowledge";

const log = createLogger("DictationEndpoint");
const router = Router();


// C315: Structured Dictation Endpoint
// Add to server/mother/a2a-server.ts after existing /knowledge endpoint
// Base: Human-in-the-loop learning; Constitutional AI (Bai et al., arXiv:2212.08073)

// Dictation schema
const DictationBodySchema = z.object({
  diktat_id: z.string().startsWith('DK-').optional(),
  author: z.string().default('proprietario'),
  type: z.enum(['heuristic', 'fact', 'rule', 'correction', 'directive']),
  domain: z.string().default('general'),
  content: z.string().min(10),
  confidence: z.number().min(0.8).max(1.0).default(0.95),
  source: z.string().default('human-dictation'),
  priority: z.number().min(1).max(10).default(8),
  validUntil: z.string().optional(), // ISO date string
});

// POST /api/a2a/dictation — Structured knowledge injection
router.post('/dictation', authenticateA2A, async (req: Request, res: Response) => {
  const parsed = DictationBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid dictation payload', details: parsed.error.issues });
  }
  
  const diktat = parsed.data;
  const diktatId = diktat.diktat_id || `DK-${Date.now()}`;
  
  try {
    // Store in knowledge base with high priority
    const knowledgeEntry = {
      title: `Dictation ${diktatId}: ${diktat.type} — ${diktat.domain}`,
      content: diktat.content,
      category: `dictation_${diktat.type}`,
      source: `${diktat.source} (author: ${diktat.author})`,
      confidence: diktat.confidence,
      priority: diktat.priority,
      tags: ['dictation', diktat.type, diktat.domain, diktatId],
      metadata: {
        diktatId,
        author: diktat.author,
        type: diktat.type,
        domain: diktat.domain,
        validUntil: diktat.validUntil,
        injectedAt: new Date().toISOString()
      }
    };
    
    const result = await addKnowledge(knowledgeEntry.title || diktat.content.slice(0, 80), diktat.content, diktat.type, diktat.author, diktat.domain);
    
    log.info('Dictation injected successfully', { diktatId, type: diktat.type, domain: diktat.domain });
    
    return res.status(201).json({
      success: true,
      diktat_id: diktatId,
      knowledge_id: result,
      message: `Dictation ${diktatId} integrated successfully`,
      type: diktat.type,
      domain: diktat.domain,
      priority: diktat.priority
    });
  } catch (error) {
    log.error('Failed to inject dictation', { error, diktatId });
    return res.status(500).json({ error: 'Failed to process dictation', diktat_id: diktatId });
  }
});
