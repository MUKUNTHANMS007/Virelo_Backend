import { z } from 'zod';

export const createArticleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  excerpt: z.string().min(1, 'Excerpt is required').max(500),
  content: z.string().min(1, 'Content is required'),
  category: z.enum(['Product', 'Engineering', 'Community', 'Announcements']),
  author: z.string().min(1, 'Author is required'),
  image: z.string().optional(),
  featured: z.boolean().optional(),
  date: z.string().optional(),
});

export const newsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  category: z.string().optional(),
});
