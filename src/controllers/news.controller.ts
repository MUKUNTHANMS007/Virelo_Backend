import { Request, Response, NextFunction } from 'express';
import { Article } from '../models/Article';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const listArticles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const category = req.query.category as string;

    const filter: any = {};
    if (category && category !== 'All') {
      filter.category = category;
    }

    const total = await Article.countDocuments(filter);
    const articles = await Article.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

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
    const article = await Article.findOne({ slug: req.params.slug });

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
    const article = await Article.create(req.body);

    res.status(201).json({
      success: true,
      data: article,
    });
  } catch (error) {
    next(error);
  }
};
