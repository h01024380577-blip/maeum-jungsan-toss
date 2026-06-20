'use client';
import { apiFetch } from '@/src/lib/apiClient';
import { PREMIUM_SKU } from '@/src/lib/iapConfig';

async function getIap() {
  try {
    const mod = await import('@apps-in-toss/web-framework');
    return (mod as { IAP?: unknown }).IAP as
      | typeof import('@apps-in-toss/web-framework').IAP
      | undefined;
  } catch {
    return undefined;
  }
}

/** 토스앱 5.219.0+ 에서만 IAP 지원. */
export async function isIapSupported(): Promise<boolean> {
  return (await getIap()) != null;
}

export async function getPremiumProduct() {
  const IAP = await getIap();
  if (!IAP) return null;
  const res = await IAP.getProductItemList();
  return res?.products?.find((p) => p.sku === PREMIUM_SKU) ?? null;
}

async function grantOrder(orderId: string): Promise<boolean> {
  const res = await apiFetch('/api/iap/grant', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
  const json = await res.json().catch(() => ({}));
  return json?.granted === true;
}

export interface PurchaseHandlers {
  onSuccess: () => void;
  onError: (e: unknown) => void;
}

/** 프리미엄 구매. cleanup 함수 반환. */
export async function purchasePremium({ onSuccess, onError }: PurchaseHandlers): Promise<() => void> {
  const IAP = await getIap();
  if (!IAP) {
    onError(new Error('iap_unsupported'));
    return () => {};
  }
  const cleanup = IAP.createOneTimePurchaseOrder({
    options: {
      sku: PREMIUM_SKU,
      processProductGrant: ({ orderId }) => grantOrder(orderId),
    },
    onEvent: (event) => {
      if (event.type === 'success') {
        onSuccess();
        cleanup();
      }
    },
    onError: (e) => {
      onError(e);
      cleanup();
    },
  });
  return cleanup;
}

/** 앱 실행 시: 미결 주문 복원 + 환불 재정합. */
export async function restorePremium(): Promise<void> {
  const IAP = await getIap();
  if (!IAP) return;

  const pending = await IAP.getPendingOrders().catch(() => undefined);
  for (const order of pending?.orders ?? []) {
    if (order.sku && order.sku !== PREMIUM_SKU) continue;
    if (await grantOrder(order.orderId)) {
      await IAP.completeProductGrant({ params: { orderId: order.orderId } }).catch(() => {});
    }
  }

  const completed = await IAP.getCompletedOrRefundedOrders().catch(() => undefined);
  const refundedOrderIds = (completed?.orders ?? [])
    .filter((o) => o.status === 'REFUNDED' && o.sku === PREMIUM_SKU)
    .map((o) => o.orderId);
  if (refundedOrderIds.length > 0) {
    await apiFetch('/api/iap/reconcile', {
      method: 'POST',
      body: JSON.stringify({ refundedOrderIds }),
    });
  }
}
