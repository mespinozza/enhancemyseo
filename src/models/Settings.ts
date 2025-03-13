import mongoose, { Document } from 'mongoose';

export interface ISettings extends Document {
  userId: mongoose.Types.ObjectId;
  brandName: string;
  businessType: string;
  articleTone: string;
  brandGuidelines: string;
}

const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  brandName: {
    type: String,
    required: true,
  },
  businessType: {
    type: String,
    required: true,
  },
  articleTone: {
    type: String,
    required: true,
  },
  brandGuidelines: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema); 