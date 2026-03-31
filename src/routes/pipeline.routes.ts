import { Router } from 'express';
import { generateVideo } from '../controllers/pipeline.controller';

const router = Router();

router.post('/generate', generateVideo);

export default router;
