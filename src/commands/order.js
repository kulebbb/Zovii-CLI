import { getToken as realGetToken } from '../token.js';
import {
  getOrderStatus as realGetOrderStatus,
  getBalance as realGetBalance,
} from '../utils.js';
import { ORDER_STATUS_TEXT, money } from '../billing.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['orderId', 'productId', 'amount', 'status', 'expiresAt', 'paidAt', 'balance', 'statusText'];

const realDeps = {
  getToken: realGetToken,
  getOrderStatus: realGetOrderStatus,
  getBalance: realGetBalance,
};

export function register(program, deps = realDeps) {
  program
    .command('order <orderId>')
    .description('查询订单支付状态（zovii buy 返回的 orderId）')
    .action(async (orderId, _opts) => {
      const fmt = program.opts().format;
      try {
        const token = await deps.getToken();
        const order = await deps.getOrderStatus(token, orderId);
        // 已到账时顺带给出最新余额，省一次查询
        const balance =
          order.status === 'fulfilled' ? await deps.getBalance(token).catch(() => null) : null;
        printOutput(
          [
            {
              orderId: order.order_id,
              productId: order.product_id,
              amount: money(order.final_amount, fmt),
              status: order.status,
              statusText: ORDER_STATUS_TEXT[order.status] ?? order.status,
              // 已结束的订单过期时间没有意义
              expiresAt: order.status === 'pending' ? order.expires_at : null,
              paidAt: order.paid_at,
              balance,
            },
          ],
          COLUMNS,
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
