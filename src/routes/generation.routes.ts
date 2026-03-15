import { Router } from 'express';
import { getGenerationStatus, handleWebhook, downloadPsd } from '../controllers/generation.controller';
import { auth } from '../middleware/auth';

const router = Router();

// Used by internal AI Worker
router.post('/:id/webhook', handleWebhook);

// Requires auth for polling
router.get('/:id', auth, getGenerationStatus);

// Download PSD bridge
router.get('/:id/download-psd', auth, downloadPsd);

export default router;
