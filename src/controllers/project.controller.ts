import { Response, NextFunction } from 'express';
import { Project } from '../models/Project';
import { Generation } from '../models/Generation';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const createProject = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const project = await Project.create({
      ...req.body,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

export const listProjects = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const projects = await Project.find({ userId: req.user.id })
      .select('name sceneData createdAt updatedAt')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    next(error);
  }
};

export const getProject = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const project = await Project.findById(req.params.id);

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Ownership check
    if (project.userId.toString() !== req.user.id) {
      throw new AppError('Not authorized to access this project', 403);
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const project = await Project.findById(req.params.id);

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.userId.toString() !== req.user.id) {
      throw new AppError('Not authorized to modify this project', 403);
    }

    // Update fields
    if (req.body.name) project.name = req.body.name;
    if (req.body.sceneData) project.sceneData = req.body.sceneData;
    if (req.body.referenceSheetUrl !== undefined) project.referenceSheetUrl = req.body.referenceSheetUrl;
    if (req.body.sketchData !== undefined) project.sketchData = req.body.sketchData;

    // Mark sceneData and sketchData as modified since they are Mixed type
    project.markModified('sceneData');
    if (req.body.sketchData) project.markModified('sketchData');
    await project.save();

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const project = await Project.findById(req.params.id);

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.userId.toString() !== req.user.id) {
      throw new AppError('Not authorized to delete this project', 403);
    }

    await Project.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const generateAnimation = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const project = await Project.findById(req.params.id);
    if (!project) throw new AppError('Project not found', 404);
    if (project.userId.toString() !== req.user.id) throw new AppError('Not authorized', 403);

    if (!project.sketchData || typeof project.sketchData !== 'object' || Object.keys(project.sketchData).length === 0) {
      throw new AppError('Missing sketch data. Please pose your model and capture sketches first.', 400);
    }
    
    if (!project.referenceSheetUrl) {
      throw new AppError('Missing reference sheet URL. Please provide a reference sheet.', 400);
    }

    // Freemium logic check
    const user = await User.findById(req.user.id);
    if (!user) throw new AppError('User not found', 404);

    if (user.plan === 'free' && user.generationCount >= 5) {
      throw new AppError('Daily generation limit reached. Please upgrade to Virelo Pro for unlimited generations.', 403);
    }

    const generation = await Generation.create({
      projectId: project._id,
      userId: req.user.id,
      referenceSheetUrl: project.referenceSheetUrl,
      sketchData: project.sketchData,
      status: 'processing'
    });

    // Increment user generation count
    user.generationCount += 1;
    await user.save();

    // ── Dispatch to ToonCrafter Worker ───────────────────────────────────────
    // Falls back to the original AniDoc worker if the ToonCrafter URL is not set
    const aiWorkerUrl = process.env.TOONCRAFTER_WORKER_URL || process.env.AI_WORKER_URL || 'http://127.0.0.1:8001';
    const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:5000/api'}/generations/${generation._id}/webhook`;

    console.log(`[ToonCrafter] Dispatching generation [${generation._id}] to ${aiWorkerUrl}/generate`);
    
    fetch(`${aiWorkerUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationId: generation._id.toString(),
        referenceSheetUrl: project.referenceSheetUrl,
        sketchData: project.sketchData,
        callbackUrl: callbackUrl,
        numFrames: 16,           // ToonCrafter's canonical 16-frame output
        fps: 8,
        outputFormat: 'both',    // Returns MP4 + Layered PSD
      })
    }).catch(aiError => {
      console.error(`[ToonCrafter] dispatch failed for ${generation._id}:`, aiError);
      generation.status = 'failed';
      generation.save().catch(console.error);
    });

    // Respond immediately to the frontend
    res.status(202).json({
      success: true,
      message: 'Animation generation requested. Processing in background.',
      data: generation,
    });

  } catch (error) {
    next(error);
  }
};

export const uploadReference = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);
    if (!req.file) throw new AppError('No file uploaded', 400);

    const project = await Project.findById(req.params.id);
    if (!project) throw new AppError('Project not found', 404);
    if (project.userId.toString() !== req.user.id) throw new AppError('Not authorized', 403);

    // Save the file URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    project.referenceSheetUrl = fileUrl;
    await project.save();

    res.status(200).json({
      success: true,
      data: {
        referenceSheetUrl: fileUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const trainModel = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const project = await Project.findById(req.params.id);
    if (!project) throw new AppError('Project not found', 404);
    if (project.userId.toString() !== req.user.id) throw new AppError('Not authorized', 403);

    const aiWorkerUrl = process.env.AI_WORKER_URL || 'http://127.0.0.1:8000';
    
    // Call Python AI Worker /train endpoint
    const aiRes = await fetch(`${aiWorkerUrl}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationId: project._id,
        referenceSheetUrl: project.referenceSheetUrl
      })
    });

    if (!aiRes.ok) throw new Error('AI Worker training failed');

    res.status(200).json({
      success: true,
      message: 'Model personalization triggered successfully'
    });
  } catch (error) {
    next(error);
  }
};
