import { Router } from 'express';
import multer from 'multer';
import { 
  createJob, 
  getJobStatus, 
  getJobVideo, 
  getJobZip 
} from '../controllers/pipeline.controller';

const router = Router();
const upload = multer({ dest: 'uploads/temp/' }); // Temporarily store incoming frames

// The frontend pipelineApi.ts expects /jobs
router.post('/', upload.any(), createJob);
router.get('/:id', getJobStatus);
router.get('/:id/video', getJobVideo);
router.get('/:id/frames.zip', getJobZip);

export default router;
