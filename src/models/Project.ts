import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  name: string;
  userId: mongoose.Types.ObjectId;
  sceneData: {
    keyframes: Array<{
      id: string;
      type?: 'default' | 'model' | 'cube' | 'sphere' | 'cylinder';
      url?: string;
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }>;
    sunPosition?: [number, number, number];
    sunIntensity?: number;
    sunColor?: string;
  };
  referenceSheetUrl?: string;
  sketchData?: any;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: 200,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sceneData: {
      type: Schema.Types.Mixed,
      default: {
        keyframes: [],
        sunPosition: [5, 10, 5],
        sunIntensity: 1.5,
        sunColor: '#ffffff',
      },
    },
    referenceSheetUrl: {
      type: String,
      trim: true,
    },
    sketchData: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

export const Project = mongoose.model<IProject>('Project', projectSchema);
