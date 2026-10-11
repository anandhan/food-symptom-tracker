import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { persistDailyEntry } from '@/lib/entries/save-entry';
import { linkFoodItemsByIds } from '@/lib/ai/food-normalization';
import { parseCalendarDate } from '@/lib/dates';
import { saveErrorPayload, StageError } from '@/lib/ai/extraction-errors';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.time('save:total');
  try {
    console.time('save:auth');
    const session = await getAuthorizedSession();
    console.timeEnd('save:auth');
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'auth', detail: 'Not signed in' },
        { status: 401 }
      );
    }

    console.time('save:parse');
    const body = await request.json();
    const {
      dailyEntryId,
      date,
      meals,
      symptomNotes,
      overallRating,
      bloating,
      gas,
      crampsPain,
      diarrhea,
      constipation,
    } = body;

    if (!date || typeof date !== 'string') {
      throw new StageError('validate', 'Date is required', 'body.date must be YYYY-MM-DD');
    }
    if (!meals || typeof meals !== 'object') {
      throw new StageError('validate', 'Meals are required', 'body.meals must be an object');
    }

    const entryDate = parseCalendarDate(date);
    console.timeEnd('save:parse');

    const persisted = await persistDailyEntry({
      userId: session.userId,
      dailyEntryId,
      date: entryDate,
      meals,
      symptomNotes,
      overallRating,
      bloating,
      gas,
      crampsPain,
      diarrhea,
      constipation,
    });

    after(async () => {
      console.time('save:concepts');
      try {
        await linkFoodItemsByIds(persisted.foodItemIds, { useGemini: false });
      } catch (error) {
        console.error('Background concept linking failed:', error);
      } finally {
        console.timeEnd('save:concepts');
      }
    });

    console.timeEnd('save:total');
    return NextResponse.json({
      success: true,
      dailyEntryId: persisted.dailyEntryId,
      stage: 'persist',
    });
  } catch (error) {
    console.timeEnd('save:total');
    console.error('Save entry error:', error);
    const payload = saveErrorPayload(error);
    return NextResponse.json(
      { error: payload.error, code: payload.code, detail: payload.detail, stage: payload.code },
      { status: payload.status }
    );
  }
}
