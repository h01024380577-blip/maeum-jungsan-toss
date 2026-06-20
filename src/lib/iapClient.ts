import { TOSS_API_BASE, fetchWithRetry } from '@/src/lib/tossApiClient';

export type IapOrderStatusValue =
  | 'PURCHASED' | 'PAYMENT_COMPLETED' | 'FAILED' | 'REFUNDED'
  | 'ORDER_IN_PROGRESS' | 'NOT_FOUND' | 'MINIAPP_MISMATCH' | 'ERROR';

export interface IapOrderStatusResult {
  orderId: string;
  sku: string;
  status: IapOrderStatusValue;
  statusDeterminedAt: string;
  reason: string;
}

/** 토스 주문 상태 조회(mTLS, 서버↔서버). 실패 시 null. */
export async function getOrderStatus(
  tossUserKey: string,
  orderId: string,
): Promise<IapOrderStatusResult | null> {
  try {
    const res = await fetchWithRetry(
      `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/order/get-order-status`,
      {
        method: 'POST',
        headers: { 'x-toss-user-key': tossUserKey },
        body: JSON.stringify({ orderId }),
      },
    );
    if (res.status !== 200) return null;
    const json = await res.json();
    if (json?.resultType !== 'SUCCESS' || !json?.success) return null;
    return json.success as IapOrderStatusResult;
  } catch {
    return null;
  }
}
