import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { astraDb } from '../lib/astra';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const getUsersCollection = () => astraDb.collection('users');

const generateToken = (id: string, role: string): string => {
  return jwt.sign({ id, role }, env.JWT_SECRET, { expiresIn: '7d' });
};

export const register = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    const collection = getUsersCollection();

    // Check if user already exists
    const existingUser = await collection.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      plan: 'free',
      generationCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await collection.insertOne(userData);
    const userId = result.insertedId as string;
    const token = generateToken(userId, userData.role);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: userId,
          name: userData.name,
          email: userData.email,
          role: userData.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;
    
    console.log(`[LOGIN ATTEMPT] Email received: "${email}" | Password length: ${password?.length}`);

    const collection = getUsersCollection();

    // Find user
    const user = await collection.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`[LOGIN FAILED] User not found for email: "${email.toLowerCase()}"`);
      throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await bcrypt.compare(password, user.password as string);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = generateToken(user._id as string, user.role as string);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id as string,
          name: user.name as string,
          email: user.email as string,
          role: user.role as string,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const collection = getUsersCollection();
    const user = await collection.findOne({ _id: req.user.id });
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id as string,
        name: user.name as string,
        email: user.email as string,
        role: user.role as string,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new AppError('Current and new password are required', 400);
    }

    const collection = getUsersCollection();
    const user = await collection.findOne({ _id: req.user.id });
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password as string);
    if (!isMatch) {
      throw new AppError('Incorrect current password', 401);
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters long', 400);
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await collection.updateOne(
      { _id: req.user.id },
      { $set: { password: hashedPassword, updatedAt: new Date().toISOString() } }
    );

    res.status(200).json({
      success: true,
      message: 'Password successfully updated'
    });
  } catch (error) {
    next(error);
  }
};
