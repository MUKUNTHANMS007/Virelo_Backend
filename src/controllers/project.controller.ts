import { Response, NextFunction } from 'express';
import { astraDb } from '../lib/astra';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

// Collection helpers
const getProjectsCollection = () => astraDb.collection('projects');
const getGenerationsCollection = () => astraDb.collection('generations');
const getUsersCollection = () => astraDb.collection('users');

export const createProject = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const projectData = {
      ...req.body,
      userId: req.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const collection = getProjectsCollection();
    const result = await collection.insertOne(projectData);

    res.status(201).json({
      success: true,
      data: { _id: result.insertedId as string, ...projectData },
    });
  } catch (error) {
    next(error);
  }
};

export const listProjects = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const collection = getProjectsCollection();
    const cursor = collection.find({ userId: req.user.id }, {
      sort: { updatedAt: -1 },
      projection: { name: 1, sceneData: 1, createdAt: 1, updatedAt: 1 }
    });
    
    const projects = await cursor.toArray();

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

    const collection = getProjectsCollection();
    const project = await collection.findOne({ _id: req.params.id });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Ownership check
    if (project.userId !== req.user.id) {
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

    const collection = getProjectsCollection();
    const project = await collection.findOne({ _id: req.params.id });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.userId !== req.user.id) {
      throw new AppError('Not authorized to modify this project', 403);
    }

    // Update fields
    const updateData: any = {
      updatedAt: new Date().toISOString()
    };
    if (req.body.name) updateData.name = req.body.name;
    if (req.body.sceneData) updateData.sceneData = req.body.sceneData;
    if (req.body.referenceSheetUrl !== undefined) updateData.referenceSheetUrl = req.body.referenceSheetUrl;
    if (req.body.sketchData !== undefined) updateData.sketchData = req.body.sketchData;

    await collection.updateOne(
      { _id: req.params.id },
      { $set: updateData }
    );

    res.status(200).json({
      success: true,
      data: { ...project, ...updateData },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const collection = getProjectsCollection();
    const project = await collection.findOne({ _id: req.params.id });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.userId !== req.user.id) {
      throw new AppError('Not authorized to delete this project', 403);
    }

    await collection.deleteOne({ _id: req.params.id });

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

    const projectCol = getProjectsCollection();
    const project = await projectCol.findOne({ _id: req.params.id });
    
    if (!project) throw new AppError('Project not found', 404);
    if (project.userId !== req.user.id) throw new AppError('Not authorized', 403);

    if (!project.sketchData || typeof project.sketchData !== 'object' || Object.keys(project.sketchData).length === 0) {
      throw new AppError('Missing sketch data. Please pose your model and capture sketches first.', 400);
    }
    
    if (!project.referenceSheetUrl) {
      throw new AppError('Missing reference sheet URL. Please provide a reference sheet.', 400);
    }

    // Freemium logic check
    const userCol = getUsersCollection();
    const user = await userCol.findOne({ _id: req.user.id });
    if (!user) throw new AppError('User not found', 404);

    const plan = user.plan as string;
    const generationCount = (user.generationCount as number) || 0;

    if (plan === 'free' && generationCount >= 5) {
      throw new AppError('Daily generation limit reached. Please upgrade to Virelo Pro for unlimited generations.', 403);
    }

    const genCol = getGenerationsCollection();
    const generationData = {
      projectId: project._id as string,
      userId: req.user.id,
      referenceSheetUrl: project.referenceSheetUrl as string,
      sketchData: project.sketchData,
      status: 'processing',
      createdAt: new Date().toISOString()
    };
    
    const genResult = await genCol.insertOne(generationData);
    const generationId = genResult.insertedId as string;

    // Increment user generation count
    await userCol.updateOne(
      { _id: req.user.id },
      { $inc: { generationCount: 1 } }
    );

    // ── Dispatch to ToonCrafter Worker ───────────────────────────────────────
    const aiWorkerUrl = process.env.TOONCRAFTER_WORKER_URL || process.env.AI_WORKER_URL || 'http://127.0.0.1:8001';
    const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:5000/api'}/generations/${generationId}/webhook`;

    console.log(`[ToonCrafter] Dispatching generation [${generationId}] to ${aiWorkerUrl}/generate`);
    
    fetch(`${aiWorkerUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationId: generationId,
        referenceSheetUrl: project.referenceSheetUrl,
        sketchData: project.sketchData,
        callbackUrl: callbackUrl,
        numFrames: 16,
        fps: 8,
        outputFormat: 'both',
      })
    }).catch(aiError => {
      console.error(`[ToonCrafter] dispatch failed for ${generationId}:`, aiError);
      genCol.updateOne({ _id: generationId }, { $set: { status: 'failed' } }).catch(console.error);
    });

    res.status(202).json({
      success: true,
      message: 'Animation generation requested. Processing in background.',
      data: { _id: generationId, ...generationData },
    });

  } catch (error) {
    next(error);
  }
};

export const uploadReference = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);
    if (!req.file) throw new AppError('No file uploaded', 400);

    const projectCol = getProjectsCollection();
    const project = await projectCol.findOne({ _id: req.params.id });
    
    if (!project) throw new AppError('Project not found', 404);
    if (project.userId !== req.user.id) throw new AppError('Not authorized', 403);

    // Save the file URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    await projectCol.updateOne(
      { _id: req.params.id },
      { $set: { referenceSheetUrl: fileUrl } }
    );

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

    const projectCol = getProjectsCollection();
    const project = await projectCol.findOne({ _id: req.params.id });
    
    if (!project) throw new AppError('Project not found', 404);
    if (project.userId !== req.user.id) throw new AppError('Not authorized', 403);

    const aiWorkerUrl = process.env.AI_WORKER_URL || 'http://127.0.0.1:8000';
    
    const aiRes = await fetch(`${aiWorkerUrl}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationId: project._id as string,
        referenceSheetUrl: project.referenceSheetUrl as string
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
