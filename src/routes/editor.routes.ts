import { Router } from 'express';
import { uploadModel, uploadModelMiddleware } from '../controllers/editor.controller';

const router = Router();

router.post('/upload-model', uploadModelMiddleware, uploadModel);

export default router;
