import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'models');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadModelMiddleware = multer({ storage }).single('model');

export const uploadModel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No model file provided' });
    }
    
    const fileUrl = `/uploads/models/${req.file.filename}`;
    
    return res.status(200).json({
      success: true,
      message: 'Model uploaded successfully',
      url: fileUrl
    });
  } catch (error) {
    console.error('Error uploading model:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
