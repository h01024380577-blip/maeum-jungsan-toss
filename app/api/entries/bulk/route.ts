import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import {
  consumeCredit,
  refundCredit,
  resolveDbUserId,
  isGuardEnabled,
} from '@/src/lib/credits';
import {
  buildBulkDuplicateKey,
  dateFromBulkDateKey,
  normalizeBulkEventType,
  normalizeBulkName,
  parseBulkAmount,
  parseBulkDate,
  type BulkEventType,
  type BulkTransactionType,
} from '@/src/lib/bulkEntryDedup';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

interface BulkEntryInput {
  targetName?: string;
  amount?: number | string;
  date?: string;
  eventType?: string;
  location?: string;
  relation?: string;
  type?: 'INCOME' | 'EXPENSE';
  memo?: string;
  account?: string;
}

type NormalizedBulkEntry = {
  targetName: string;
  amount: number;
  date: Date;
  dateKey: string;
  importFingerprint: string;
  eventType: BulkEventType;
  location: string;
  relation: string;
  type: BulkTransactionType;
  memo: string;
  account: string;
};

export async function POST(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const rawEntries = Array.isArray(body?.entries) ? body.entries : null;
  if (!rawEntries || rawEntries.length === 0) {
    return withCors(req, NextResponse.json({ error: 'empty_entries' }, { status: 400 }));
  }

  // 입력 정규화
  const entries: NormalizedBulkEntry[] = [];

  for (const raw of rawEntries as BulkEntryInput[]) {
    const targetName = String(raw.targetName ?? '').trim();
    const amount = parseBulkAmount(raw.amount);
    if (!targetName || amount <= 0) continue;
    const { date, dateKey } = parseBulkDate(raw.date);
    const type: BulkTransactionType = raw.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const entry = {
      targetName,
      amount,
      date,
      dateKey,
      eventType: normalizeBulkEventType(raw.eventType),
      location: String(raw.location ?? '').trim() || '기타',
      relation: String(raw.relation ?? '').trim() || '지인',
      type,
      memo: String(raw.memo ?? '').trim(),
      account: String(raw.account ?? ''),
    };
    entries.push({
      ...entry,
      importFingerprint: buildBulkDuplicateKey(entry),
    });
  }

  if (entries.length === 0) {
    return withCors(req, NextResponse.json({ error: 'no_valid_entries' }, { status: 400 }));
  }

  // CSV 크레딧 가드 (env로 on/off)
  const guardOn = isGuardEnabled('CSV_CREDIT');
  if (guardOn) {
    const consumed = await consumeCredit(userId, 'CSV_CREDIT');
    if (!consumed) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'no_credits', rewardType: 'CSV_CREDIT' },
        { status: 402 },
      ));
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bulk-entries:${userId}`})::bigint)`;

      const seenIncoming = new Set<string>();
      const uniqueEntries: NormalizedBulkEntry[] = [];
      let skipped = 0;

      for (const entry of entries) {
        const key = buildBulkDuplicateKey(entry);
        if (seenIncoming.has(key)) {
          skipped += 1;
          continue;
        }
        seenIncoming.add(key);
        uniqueEntries.push(entry);
      }

      // Contact name 목록에 대해 한 번에 조회
      const dateKeys = Array.from(new Set(uniqueEntries.map((entry) => entry.dateKey))).sort();
      const startDate = dateFromBulkDateKey(dateKeys[0]);
      const endDate = dateFromBulkDateKey(dateKeys[dateKeys.length - 1]);
      endDate.setUTCHours(23, 59, 59, 999);
      const existingEvents = dateKeys.length > 0
        ? await tx.event.findMany({
          where: {
            userId,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            transactions: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { type: true, amount: true },
            },
          },
        })
        : [];
      const existingKeys = new Set(
        existingEvents.flatMap((event) => {
          const tx = event.transactions[0];
          if (!tx) return [];
          return [
            event.importFingerprint,
            buildBulkDuplicateKey({
              targetName: event.targetName,
              amount: tx.amount,
              date: event.date,
              type: tx.type,
            }),
          ].filter((key): key is string => typeof key === 'string' && key.length > 0);
        }),
      );
      const entriesToInsert = uniqueEntries.filter((entry) => {
        const isDuplicate = existingKeys.has(entry.importFingerprint);
        if (isDuplicate) skipped += 1;
        return !isDuplicate;
      });

      if (entriesToInsert.length === 0) {
        return { inserted: 0, skipped };
      }

      const existingContacts = await tx.contact.findMany({
        where: { userId },
        select: { id: true, name: true },
      });
      const contactByName = new Map<string, string>(
        existingContacts.map((c) => [normalizeBulkName(c.name), c.id]),
      );

      // 누락된 contact 생성
      for (const name of Array.from(new Set(entriesToInsert.map((e) => e.targetName)))) {
        const normalizedName = normalizeBulkName(name);
        if (!contactByName.has(normalizedName)) {
          const relation =
            entriesToInsert.find((e) => e.targetName === name)?.relation || '지인';
          const created = await tx.contact.create({
            data: { userId, name, relation },
            select: { id: true },
          });
          contactByName.set(normalizedName, created.id);
        }
      }

      let inserted = 0;
      for (const entry of entriesToInsert) {
        const contactId = contactByName.get(normalizeBulkName(entry.targetName))!;
        const event = await tx.event.create({
          data: {
            userId,
            contactId,
            eventType: entry.eventType,
            targetName: entry.targetName,
            date: entry.date,
            location: entry.location,
            relation: entry.relation,
            memo: entry.memo,
            account: entry.account,
            importFingerprint: entry.importFingerprint,
          },
          select: { id: true },
        });
        await tx.transaction.create({
          data: {
            eventId: event.id,
            userId,
            type: entry.type,
            amount: entry.amount,
            account: entry.account,
            relation: entry.relation,
            source: 'CSV',
          },
        });
        inserted += 1;
      }
      return { inserted, skipped };
    });

    if (guardOn && result.inserted === 0) {
      await refundCredit(userId, 'CSV_CREDIT');
    }

    return withCors(
      req,
      NextResponse.json({
        success: true,
        inserted: result.inserted,
        skipped: result.skipped,
        attempted: entries.length,
      }),
    );
  } catch (err) {
    // 0건 저장 실패 → CSV 크레딧 환불
    if (guardOn) await refundCredit(userId, 'CSV_CREDIT');
    const message = err instanceof Error ? err.message : String(err);
    console.error('[bulk] insert failed:', message);
    return withCors(
      req,
      NextResponse.json(
        { success: false, reason: 'insert_failed', message },
        { status: 500 },
      ),
    );
  }
}
