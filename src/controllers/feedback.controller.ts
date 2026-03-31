import { Request, Response, NextFunction } from 'express';
import { astraDb } from '../lib/astra';
import { AppError } from '../middleware/errorHandler';

const getFeedbacksCollection = () => astraDb.collection('feedbacks');

export const submitFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rating, name, email, type, message } = req.body;
    
    const collection = getFeedbacksCollection();

    const newFeedback = {
      name,
      email: email.toLowerCase(),
      type,
      message,
      rating: rating || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const result = await collection.insertOne(newFeedback);

    res.status(201).json({
      success: true,
      data: {
        id: result.insertedId,
        message: 'Feedback submitted successfully.',
      },
    });
  } catch (error) {
    next(error);
  }
};
