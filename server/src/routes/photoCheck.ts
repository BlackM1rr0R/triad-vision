import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, limiter } from '../lib/http.js';
import { analyzePhoto } from '../lib/photoCheck/index.js';

/**
 * On-demand biometric photo check — mounted at /api/photo-check (any signed-in user). "Check my photo" before the
 * upload: the image is analysed in memory and nothing is stored.
 *
 *   POST /   multipart "file" (JPEG / PNG, max 15 MB) → { photoCheck }
 */
export const photoCheckRouter = Router();
photoCheckRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 2 } });
const checkLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 60 });

photoCheckRouter.post('/', checkLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  res.json({ photoCheck: await analyzePhoto(req.file.buffer, req.file.mimetype) });
});
