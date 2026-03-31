import { Request, Response, NextFunction } from 'express';
import { astraDb } from '../lib/astra';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const getArticlesCollection = () => astraDb.collection('articles');

export const listArticles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const category = req.query.category as string;

    const filter: any = {};
    if (category && category !== 'All') {
      filter.category = category;
    }

    const collection = getArticlesCollection();
    
    // Astra Data API count equivalent is estimated or via find().toArray().length (limited)
    // For now we'll do a simple find with sort and limit
    const cursor = collection.find(filter, {
      sort: { date: -1 },
      skip: (page - 1) * limit,
      limit: limit
    });
    
    const articles = await cursor.toArray();
    
    // Quick total count for pagination
    // Note: for very large collections, countDocuments is better, but here we estimate
    const total = articles.length < limit && page === 1 ? articles.length : 100; // Placeholder for now

    res.status(200).json({
      success: true,
      data: articles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getArticleBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const collection = getArticlesCollection();
    const article = await collection.findOne({ slug: req.params.slug });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    res.status(200).json({
      success: true,
      data: article,
    });
  } catch (error) {
    next(error);
  }
};

export const createArticle = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const collection = getArticlesCollection();
    const articleData = {
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const result = await collection.insertOne(articleData);

    res.status(201).json({
      success: true,
      data: { _id: result.insertedId, ...articleData },
    });
  } catch (error) {
    next(error);
  }
};
