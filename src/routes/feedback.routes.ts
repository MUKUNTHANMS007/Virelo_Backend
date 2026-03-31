import { Router } from 'express';
import { submitFeedback } from '../controllers/feedback.controller';
import { validate } from '../middleware/validate';
import { submitFeedbackSchema } from '../validators/feedback.validator';

const router = Router();

// Publicly accessible feedback route
router.post('/', validate(submitFeedbackSchema), submitFeedback);

export default router;
