import { Request, Response, NextFunction } from 'express';
import { Newsletter } from '../models/Newsletter';

export const subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }

    // Check if already subscribed
    const existing = await Newsletter.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(200).json({
        success: true,
        message: 'You are already subscribed!',
      });
      return;
    }

    await Newsletter.create({ email: email.toLowerCase() });

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to the newsletter!',
    });
  } catch (error) {
    next(error);
  }
};
