import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { resolveDbUserId } from '@/src/lib/credits';
import { corsResponse, withCors } from '@/src/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

function toContact(row: any) {
  return { id: row.id, name: row.name, phone: row.phone ?? '', kakaoId: row.kakaoId ?? '', relation: row.relation ?? '', avatar: row.avatar ?? '', isFavorite: row.isFavorite ?? false, userId: row.userId };
}

export async function GET(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const contacts = await prisma.contact.findMany({ where: { userId } });
  return withCors(req, NextResponse.json({ contacts: contacts.map(toContact) }));
}

export async function POST(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const body = await req.json();
  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return withCors(req, NextResponse.json({ error: 'invalid_name' }, { status: 400 }));
  }
  const contact = await prisma.contact.create({ data: { userId, name: body.name, phone: body.phone ?? '', kakaoId: body.kakaoId ?? null, relation: body.relation ?? '', avatar: body.avatar ?? null } });
  return withCors(req, NextResponse.json({ contact: toContact(contact), id: contact.id }));
}

export async function PATCH(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return withCors(req, NextResponse.json({ error: 'Missing id' }, { status: 400 }));
  const body = await req.json();
  const updates: any = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.relation !== undefined) updates.relation = body.relation;
  if (body.isFavorite !== undefined) updates.isFavorite = !!body.isFavorite;
  await prisma.contact.updateMany({ where: { id, userId }, data: updates });
  return withCors(req, NextResponse.json({ ok: true }));
}

export async function DELETE(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return withCors(req, NextResponse.json({ error: 'Missing id' }, { status: 400 }));
  await prisma.contact.deleteMany({ where: { id, userId } });
  return withCors(req, NextResponse.json({ ok: true }));
}
