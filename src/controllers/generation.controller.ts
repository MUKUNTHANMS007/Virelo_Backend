import { Response, NextFunction } from 'express';
import { Generation } from '../models/Generation';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Request } from 'express';

// Used for frontend polling
export const getGenerationStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const generation = await Generation.findById(req.params.id);
    
    if (!generation) {
      throw new AppError('Generation not found', 404);
    }

    if (generation.userId.toString() !== req.user.id) {
      throw new AppError('Not authorized to access this generation', 403);
    }

    res.status(200).json({
      success: true,
      data: generation,
    });
  } catch (error) {
    next(error);
  }
};

// Webhook for Python AI Worker (Unauthenticated/API Key secured in prod)
export const handleWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, resultUrl, psdUrl, error, fidelity } = req.body;
    const generationId = req.params.id;

    const generation = await Generation.findById(generationId);
    
    if (!generation) {
      throw new AppError('Generation not found', 404);
    }

    if (status) generation.status = status;
    if (resultUrl) generation.resultUrl = resultUrl;
    if (psdUrl) generation.psdUrl = psdUrl;
    if (fidelity) (generation as any).fidelity = fidelity;
    
    // if error, log it or save to a metadata field if added later
    if (error) {
      console.error(`AI Worker reported error for generation ${generationId}:`, error);
    }

    await generation.save();

    res.status(200).json({
      success: true,
      message: 'Webhook received',
    });
  } catch (error) {
    next(error);
  }
};

// Proxy download for PSD from AI Worker
export const downloadPsd = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);
    
    const generation = await Generation.findById(req.params.id);
    if (!generation || !generation.psdUrl) {
      throw new AppError('PSD file not ready or generation not found', 404);
    }

    if (generation.userId.toString() !== req.user.id) {
       throw new AppError('Not authorized', 403);
    }

    // Fetch from AI worker and stream to response
    const response = await fetch(generation.psdUrl);
    if (!response.ok) throw new Error('Failed to fetch from worker');

    res.setHeader('Content-Disposition', `attachment; filename=virelo-${generation._id}.psd`);
    res.setHeader('Content-Type', 'application/x-photoshop');
    
    // Convert Web Response back to a buffer/stream for Express
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);

  } catch (error) {
    next(error);
  }
};
