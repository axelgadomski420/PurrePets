import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/errors.js";
import { answerQuestion, moderateText } from "../lib/ai.js";
import { ollamaHealth } from "../lib/ollama.js";

export const assistantRouter = Router();

const askSchema = z.object({ question: z.string().min(2).max(600) });
const modSchema = z.object({ text: z.string().min(1).max(8000) });

// POST /api/assistant/ask — Ollama → external LLM → rules
assistantRouter.post(
  "/ask",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { question } = askSchema.parse(req.body);
    const result = await answerQuestion(question);
    res.json(result);
  })
);

// POST /api/assistant/moderate — risk score for text (listings, posts, chat)
assistantRouter.post(
  "/moderate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { text } = modSchema.parse(req.body);
    res.json(moderateText(text));
  })
);

// GET /api/assistant/health — whether Ollama is reachable
assistantRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const health = await ollamaHealth();

    res.json({
      ollama: health.online && health.modelAvailable,
      ollamaServer: health.online,
      modelAvailable: health.modelAvailable,
      model: health.model,
      models: health.models,
      externalLlm: Boolean(
        process.env.ASSISTANT_LLM_URL &&
        process.env.ASSISTANT_LLM_KEY
      ),
    });
  })
);
