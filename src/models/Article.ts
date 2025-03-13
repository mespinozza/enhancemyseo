import mongoose, { Document } from 'mongoose';

export interface IArticle extends Document {
  userId: mongoose.Types.ObjectId;
  keyword: string;
  content: string;
}

const articleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  keyword: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

export const Article = mongoose.model<IArticle>('Article', articleSchema); 