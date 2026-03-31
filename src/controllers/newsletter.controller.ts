import { Request, Response, NextFunction } from 'express';
import { astraDb } from '../lib/astra';

const getNewsletterCollection = () => astraDb.collection('newsletter');

export const subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }

    const collection = getNewsletterCollection();

    // Check if already subscribed
    const existing = await collection.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(200).json({
        success: true,
        message: 'You are already subscribed!',
      });
      return;
    }

    await collection.insertOne({ 
      email: email.toLowerCase(),
      subscribedAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to the newsletter!',
    });
  } catch (error) {
    next(error);
  }
};
