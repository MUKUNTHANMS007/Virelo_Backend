import { Request, Response } from 'express';

export const generateVideo = async (req: Request, res: Response) => {
  try {
    console.log('Received pipeline generation request:', req.body);
    
    return res.status(200).json({
      success: true,
      message: 'Video generation task queued successfully (Mocked)',
      jobId: 'mock-job-' + Date.now()
    });
  } catch (error) {
    console.error('Error in mock generateVideo:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
