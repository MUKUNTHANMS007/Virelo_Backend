import mongoose, { Schema, Document } from 'mongoose';

export interface IGeneration extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  referenceSheetUrl: string;
  sketchData: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  psdUrl?: string;
  fidelity?: string;
  createdAt: Date;
  updatedAt: Date;
}

const generationSchema = new Schema<IGeneration>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referenceSheetUrl: {
      type: String,
      required: [true, 'Reference sheet URL is required'],
    },
    sketchData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    resultUrl: {
      type: String,
    },
    psdUrl: {
      type: String,
    },
    fidelity: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Generation = mongoose.model<IGeneration>('Generation', generationSchema);
