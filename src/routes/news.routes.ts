import { Router } from 'express';
import { listArticles, getArticleBySlug, createArticle } from '../controllers/news.controller';
import { auth } from '../middleware/auth';
import { adminOnly } from '../middleware/adminOnly';
import { validate } from '../middleware/validate';
import { createArticleSchema } from '../validators/news.validator';

const router = Router();

// Public routes
router.get('/', listArticles);
router.get('/:slug', getArticleBySlug);

// Admin-only route
router.post('/', auth, adminOnly, validate(createArticleSchema), createArticle);

export default router;
