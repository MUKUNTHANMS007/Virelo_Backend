import { Request, Response } from 'express';
import { astraDb } from '../lib/astra';

const getGenerationsCollection = () => astraDb.collection('generations');

export const createJob = async (req: Request, res: Response) => {
  try {
    const collection = getGenerationsCollection();
    
    // In a real app we'd process req.files (start_frame, end_frame)
    // For now, we mock the job creation in AstraDB.
    const newJob = {
      status: 'queued',
      progress: 0,
      frames_done: 0,
      current_step: 'Initializing pipeline...',
      createdAt: new Date().toISOString(),
    };

    const result = await collection.insertOne(newJob);
    const jobId = result.insertedId;

    // --- MOCK BACKGROUND WORKER ---
    // Simulate real-time progress updates so the frontend spinner animates
    const simulateAsyncWork = async () => {
      // 1. Enter planning phase
      setTimeout(async () => {
        await collection.updateOne({ _id: jobId }, { $set: { status: 'planning', current_step: 'Analyzing spatial coherency...' } });
      }, 2000);

      // 2. Start running (progressing)
      setTimeout(async () => {
        await collection.updateOne({ _id: jobId }, { $set: { status: 'running', current_step: 'Generating keyframes...', progress: 35, frames_done: 40 } });
      }, 5000);

      // 3. Keep running
      setTimeout(async () => {
        await collection.updateOne({ _id: jobId }, { $set: { status: 'running', current_step: 'Rendering temporal layers...', progress: 75, frames_done: 150 } });
      }, 8000);

      // 4. Complete
      setTimeout(async () => {
        await collection.updateOne({ _id: jobId }, { $set: { status: 'complete', current_step: 'Finalizing export...', progress: 100, frames_done: 200 } });
      }, 12000);
    };
    
    simulateAsyncWork();

    return res.status(200).json({ job_id: jobId });
  } catch (error) {
    console.error('Error creating job:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const collection = getGenerationsCollection();
    
    const job = await collection.findOne({ _id: id });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.status(200).json({
      status: job.status,
      progress: job.progress,
      frames_done: job.frames_done,
      current_step: job.current_step,
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Mock endpoints for the final generated assets
export const getJobVideo = (req: Request, res: Response) => {
  // Normally this would stream a real video from S3/Astra Blob.
  // We'll redirect to a generic sample video.
  res.redirect('https://www.w3schools.com/html/mov_bbb.mp4');
};

export const getJobZip = (req: Request, res: Response) => {
  // Returns a dummy zip file or empty response
  res.status(200).send('Mock ZIP file data');
};
