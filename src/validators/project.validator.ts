import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  sceneData: z.object({
    keyframes: z.array(z.object({
      id: z.string(),
      type: z.enum(['default', 'model', 'cube', 'sphere', 'cylinder']).optional(),
      url: z.string().optional(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      rotation: z.tuple([z.number(), z.number(), z.number()]),
      scale: z.tuple([z.number(), z.number(), z.number()]),
    })).optional(),
    sunPosition: z.tuple([z.number(), z.number(), z.number()]).optional(),
    sunIntensity: z.number().optional(),
    sunColor: z.string().optional(),
  }).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sceneData: z.object({
    keyframes: z.array(z.object({
      id: z.string(),
      type: z.enum(['default', 'model', 'cube', 'sphere', 'cylinder']).optional(),
      url: z.string().optional(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      rotation: z.tuple([z.number(), z.number(), z.number()]),
      scale: z.tuple([z.number(), z.number(), z.number()]),
    })).optional(),
    sunPosition: z.tuple([z.number(), z.number(), z.number()]).optional(),
    sunIntensity: z.number().optional(),
    sunColor: z.string().optional(),
  }).optional(),
});
