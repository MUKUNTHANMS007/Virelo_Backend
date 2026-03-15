import { Router } from 'express';
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  generateAnimation,
  uploadReference,
  trainModel,
} from '../controllers/project.controller';
import { auth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../validators/project.validator';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for reference uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// All project routes require authentication
router.use(auth);

router.post('/', validate(createProjectSchema), createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.put('/:id', validate(updateProjectSchema), updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/reference', upload.single('reference'), uploadReference);
router.post('/:id/train', trainModel);
router.post('/:id/generate', generateAnimation);

export default router;
