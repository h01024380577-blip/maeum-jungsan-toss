import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { resolveDbUserId } from '@/src/lib/credits';
import { corsResponse, withCors } from '@/src/lib/cors';

interface BulkContactInput {
  name?: string;
  phone?: string;
  kakaoId?: string;
  relation?: string;
  avatar?: string;
}

function toContact(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    kakaoId: row.kakaoId ?? '',
    relation: row.relation ?? '',
    avatar: row.avatar ?? '',
    isFavorite: row.isFavorite ?? false,
    userId: row.userId,
  };
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const rawContacts = Array.isArray(body?.contacts) ? body.contacts : null;
  if (!rawContacts || rawContacts.length === 0) {
    return withCors(req, NextResponse.json({ error: 'empty_contacts' }, { status: 400 }));
  }

  // 입력 정규화 + 같은 페이로드 내부 중복(name) 제거
  const seen = new Set<string>();
  const normalized: Array<{
    name: string;
    phone: string;
    kakaoId: string | null;
    relation: string;
    avatar: string | null;
  }> = [];
  for (const raw of rawContacts as BulkContactInput[]) {
    const name = String(raw?.name ?? '').trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    normalized.push({
      name,
      phone: String(raw?.phone ?? ''),
      kakaoId: raw?.kakaoId ? String(raw.kakaoId) : null,
      relation: String(raw?.relation ?? '') || '지인',
      avatar: raw?.avatar ? String(raw.avatar) : null,
    });
  }

  if (normalized.length === 0) {
    return withCors(req, NextResponse.json({ error: 'no_valid_contacts' }, { status: 400 }));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const names = normalized.map((c) => c.name);
      const existing = await tx.contact.findMany({
        where: { userId, name: { in: names } },
        select: { name: true },
      });
      const existingNames = new Set(existing.map((c) => c.name));
      const toInsert = normalized.filter((c) => !existingNames.has(c.name));
      if (toInsert.length === 0) {
        return { inserted: 0, skipped: normalized.length, contacts: [] as any[] };
      }
      await tx.contact.createMany({
        data: toInsert.map((c) => ({ userId, ...c })),
      });
      const insertedRows = await tx.contact.findMany({
        where: { userId, name: { in: toInsert.map((c) => c.name) } },
      });
      return {
        inserted: insertedRows.length,
        skipped: normalized.length - insertedRows.length,
        contacts: insertedRows.map(toContact),
      };
    });

    return withCors(
      req,
      NextResponse.json({
        success: true,
        attempted: normalized.length,
        inserted: result.inserted,
        skipped: result.skipped,
        contacts: result.contacts,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contacts/bulk] insert failed:', message);
    return withCors(
      req,
      NextResponse.json(
        { success: false, reason: 'insert_failed', message },
        { status: 500 },
      ),
    );
  }
}
