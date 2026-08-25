import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import {
  buildBlockEditPrompt,
  validateRewrite,
  EDIT_PRESETS,
  type BrandContext,
} from '@/lib/article/rewrite';

initializeFirebaseAdmin();

const MAX_BLOCK_LENGTH = 20000;
const MAX_INSTRUCTION_LENGTH = 1000;

let anthropic: Anthropic | null = null;
try {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
  anthropic = new Anthropic({ apiKey: key });
} catch (error) {
  console.error('Error initializing Anthropic for article edits:', error);
}

interface EditBlockBody {
  blogId?: string;
  blockHtml?: string;
  selectedText?: string;
  instruction?: string;
  presetId?: string;
  brand?: BrandContext;
}

export async function POST(request: Request) {
  try {
    if (!anthropic) {
      return NextResponse.json(
        { error: 'AI service not available. Please check API configuration.' },
        { status: 503 },
      );
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let uid: string;
    try {
      const verified = await getAuth().verifyIdToken(idToken);
      if (!verified.uid) throw new Error('Invalid token');
      uid = verified.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json()) as EditBlockBody;
    const { blogId, blockHtml, selectedText, presetId, brand } = body;

    if (!blogId || !blockHtml) {
      return NextResponse.json(
        { error: 'blogId and blockHtml are required' },
        { status: 400 },
      );
    }

    if (blockHtml.length > MAX_BLOCK_LENGTH) {
      return NextResponse.json(
        { error: 'That block is too large to edit with AI. Edit it directly instead.' },
        { status: 413 },
      );
    }

    const preset = presetId ? EDIT_PRESETS.find((entry) => entry.id === presetId) : undefined;
    const instruction = (preset?.instruction ?? body.instruction ?? '').trim();

    if (!instruction) {
      return NextResponse.json(
        { error: 'Describe the change you want, or pick a preset.' },
        { status: 400 },
      );
    }

    if (instruction.length > MAX_INSTRUCTION_LENGTH) {
      return NextResponse.json({ error: 'Instruction is too long.' }, { status: 400 });
    }

    // Verifying the token proves identity, not authorization for this article.
    const snapshot = await getFirestore().collection('blogs').doc(blogId).get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    if (snapshot.data()?.userId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const prompt = buildBlockEditPrompt({ blockHtml, instruction, selectedText, brand });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: 'Claude returned no text content for this edit.' },
        { status: 502 },
      );
    }

    const validated = validateRewrite(textBlock.text, blockHtml);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.reason }, { status: 422 });
    }

    return NextResponse.json({
      html: validated.html,
      unchanged: validated.html.trim() === blockHtml.trim(),
    });
  } catch (error) {
    console.error('Error editing article block:', error);
    const message = error instanceof Error ? error.message : 'Failed to edit block';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
