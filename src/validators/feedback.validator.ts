import { z } from 'zod';

export const submitFeedbackSchema = z.object({
  rating: z.number().min(1).max(5).nullable().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  type: z.enum(['Feature', 'Bug', 'Design', 'Other']),
  message: z.string().min(5, 'Message must be at least 5 characters').max(5000),
});
