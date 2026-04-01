import { Request, Response } from 'express';
import { User } from '../models/User';
import { Generation } from '../models/Generation';
import { runpodService } from '../services/runpod.service';
import fs from 'fs';

// Constants for storage limits
const FREE_PLAN_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const PRO_PLAN_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export const createJob = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id; // Assuming auth middleware sets this
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const referenceFile = files?.['reference_image']?.[0];
    const lineartFiles = files?.['lineart_frames'];

    if (!referenceFile || !lineartFiles || lineartFiles.length === 0) {
      return res.status(400).json({ error: 'Missing required files (reference_image and lineart_frames)' });
    }

    // 1. Check User Storage Limits
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const limit = user.plan === 'pro' ? PRO_PLAN_LIMIT_BYTES : FREE_PLAN_LIMIT_BYTES;
    if (user.totalStorageUsed >= limit) {
      return res.status(403).json({ 
        error: `Storage limit exceeded. Your current usage is ${(user.totalStorageUsed / (1024*1024)).toFixed(2)} MB of ${(limit / (1024*1024)).toFixed(0)} MB.` 
      });
    }

    // 2. Prepare Base64 inputs for RunPod
    const refBase64 = fs.readFileSync(referenceFile.path).toString('base64');
    const lineartBase64 = lineartFiles.map(file => fs.readFileSync(file.path).toString('base64'));

    // 3. Start Async Job on RunPod
    const runpodInput = {
      ref_image: refBase64,
      lineart_frames: lineartBase64,
      width: parseInt(req.body.width || '512'),
      height: parseInt(req.body.height || '320'),
      output_fps: parseInt(req.body.fps || '24'),
    };

    const runpodJob = await runpodService.startAsyncJob(runpodInput);

    // 4. Create Generation record
    const generation = new Generation({
      projectId: projectId || userId, // Fallback if no project ID
      userId: userId,
      referenceSheetUrl: referenceFile.filename, // Using filename as placeholder
      sketchData: { frameCount: lineartFiles.length },
      status: 'pending',
      runpodJobId: runpodJob.id,
    });

    await generation.save();

    // Cleanup local uploads asynchronously
    [referenceFile, ...lineartFiles].forEach(f => fs.unlink(f.path, () => {}));

    return res.status(200).json({ job_id: generation._id });
  } catch (error: any) {
    console.error('Error creating job:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const generation = await Generation.findById(id);
    
    if (!generation) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // If it's still processing, check RunPod
    if (generation.status === 'pending' || generation.status === 'processing') {
      const rpStatus = await runpodService.getJobStatus(generation.runpodJobId!);

      if (rpStatus.status === 'COMPLETED') {
        generation.status = 'completed';
        generation.resultUrl = rpStatus.output.video_base64; // Returning base64 for now
        generation.fileSize = rpStatus.output.video_size;
        await generation.save();

        // Update User Storage Used
        await User.findByIdAndUpdate(generation.userId, {
          $inc: { totalStorageUsed: generation.fileSize }
        });
      } else if (rpStatus.status === 'FAILED') {
        generation.status = 'failed';
        await generation.save();
      } else {
        generation.status = 'processing';
        await generation.save();
      }
    }

    return res.status(200).json({
      status: generation.status,
      // Pass through RunPod status info if available
      progress: generation.status === 'completed' ? 100 : (generation.status === 'processing' ? 50 : 0),
      current_step: generation.status.toUpperCase(),
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getJobVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const generation = await Generation.findById(id);
    
    if (!generation || !generation.resultUrl) {
      return res.status(404).json({ error: 'Video not found or job not finished' });
    }

    // Since resultUrl is base64 for now, decode and send
    const videoBuffer = Buffer.from(generation.resultUrl, 'base64');
    res.contentType('video/mp4');
    res.send(videoBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve video' });
  }
};

export const getJobZip = (req: Request, res: Response) => {
  res.status(501).send('Not implemented yet');
};
