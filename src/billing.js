import { AuthRequiredError, CommandError } from './errors.js';

export const ORDER_STATUS_TEXT = {
  pending: '待支付',
  paid: '已付款，到账中',
  fulfilled: '已到账',
  cancelled: '已取消',
  expired: '已过期',
};

// 后端金额单位是「分」；json 给机器读输出元（数字），table 给人看输出 ¥ 字符串
export function money(fen, format = 'table') {
  if (fen === null || fen === undefined) return null;
  const yuan = fen / 100;
  if (format === 'json') return yuan;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

export function approxImages(credits, minImageCost) {
  return minImageCost > 0 ? Math.floor(credits / minImageCost) : null;
}

// 按 productId 在套餐 / 积分包里找商品，决定下单类型
export function findProduct(plans, packs, productId) {
  const id = String(productId ?? '').trim().toLowerCase();
  const plan = plans.find((p) => String(p.id).toLowerCase() === id);
  if (plan) return { orderType: 'subscription', product: plan };
  const pack = packs.find((p) => String(p.id).toLowerCase() === id);
  if (pack) return { orderType: 'credit_pack', product: pack };
  return null;
}

/**
 * 轮询订单直到到账；paid 只是微信回调已到、积分还在发放，继续等。
 * 到 deadline 返回最后一次查到的订单（可能是 paid / pending，查询全失败时为 null），由调用方提示。
 * 单次查询失败（网络抖动 / 5xx）不中断：用户可能正在付款，退出反而让人以为失败。
 */
export async function pollOrder(
  getOrderStatus,
  orderId,
  { deadline, intervalMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) },
) {
  let last = null;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    let order;
    try {
      order = await getOrderStatus(orderId);
    } catch (err) {
      if (err instanceof AuthRequiredError) throw err;
      continue;
    }
    last = order;
    if (order?.status === 'fulfilled') return order;
    if (order?.status === 'cancelled' || order?.status === 'expired') {
      throw new CommandError(
        `订单 ${orderId} ${ORDER_STATUS_TEXT[order.status]}，如需购买请重新运行 zovii buy`,
      );
    }
  }
  return last;
}
