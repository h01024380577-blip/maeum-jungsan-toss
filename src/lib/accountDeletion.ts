import { prisma } from './prisma';

type PrismaLike = typeof prisma;

export async function deleteUserAccountData(userId: string, client: PrismaLike = prisma): Promise<void> {
  if (!userId.trim()) return;

  await client.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.adRewardGrant.deleteMany({ where: { userId } });
    await tx.paymentOrder.deleteMany({ where: { userId } });
    await tx.event.deleteMany({ where: { userId } });
    await tx.contact.deleteMany({ where: { userId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
}

export async function deleteUserAccountDataByTossUserKey(
  tossUserKey: string,
  client: PrismaLike = prisma,
): Promise<boolean> {
  const normalized = tossUserKey.trim();
  if (!normalized) return false;

  const user = await client.user.findUnique({
    where: { tossUserKey: normalized },
    select: { id: true },
  });
  if (!user) return false;

  await deleteUserAccountData(user.id, client);
  return true;
}
