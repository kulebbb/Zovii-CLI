import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { getToken as realGetToken } from '../token.js';
import {
  listPlans as realListPlans,
  listPacks as realListPacks,
  getBalance as realGetBalance,
  createOrder as realCreateOrder,
  createWechatQrcode as realCreateWechatQrcode,
  getOrderStatus as realGetOrderStatus,
} from '../utils.js';
import { ORDER_STATUS_TEXT, money, findProduct, pollOrder } from '../billing.js';
import { ArgumentError, CommandError } from '../errors.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['orderId', 'amount', 'status', 'expiresAt', 'qrPath', 'balance', 'product'];

const realDeps = {
  getToken: realGetToken,
  listPlans: realListPlans,
  listPacks: realListPacks,
  getBalance: realGetBalance,
  createOrder: realCreateOrder,
  createWechatQrcode: realCreateWechatQrcode,
  getOrderStatus: realGetOrderStatus,
  saveQrPng: (path, text) => QRCode.toFile(path, text, { width: 360, margin: 2 }),
  renderQrTerminal: (text) => QRCode.toString(text, { type: 'terminal', small: true }),
  isTTY: () => Boolean(process.stderr.isTTY),
  log: (msg) => process.stderr.write(`${msg}\n`),
  pollIntervalMs: 3000,
};

function localTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('zh-CN', { hour12: false }) : '';
}

export function register(program, deps = realDeps) {
  program
    .command('buy <productId>')
    .description('购买订阅套餐或积分包（微信扫码支付），productId 见 zovii plans')
    .option('--yearly', '订阅按年付（默认月付，仅订阅套餐可用）')
    .option('--coupon <code>', '折扣券码')
    .option('--qr-out <path>', '支付二维码 PNG 保存路径（默认系统临时目录）')
    .option('--no-wait', '出码后立即返回，不等待支付结果（之后用 zovii order <orderId> 查询）')
    .option('--timeout <sec>', '最长等待支付秒数（默认等到订单过期）')
    .action(async (productId, opts) => {
      const fmt = program.opts().format;
      try {
        // 参数先校验，避免下完单才报错
        const timeoutSec = opts.timeout !== undefined ? Number(opts.timeout) : null;
        if (timeoutSec !== null && !(timeoutSec > 0)) {
          throw new ArgumentError('--timeout 须为正数（秒）');
        }
        const token = await deps.getToken();
        const [plans, packs] = await Promise.all([deps.listPlans(token), deps.listPacks(token)]);
        const found = findProduct(plans, packs, productId);
        if (!found) {
          const ids = [...plans, ...packs].map((p) => p.id).join(', ');
          throw new ArgumentError(`未找到商品 "${productId}"，可选：${ids}（运行 zovii plans 查看详情）`);
        }
        if (opts.yearly && found.orderType !== 'subscription') {
          throw new ArgumentError('--yearly 只适用于订阅套餐，积分包不分月付年付');
        }
        const billingCycle =
          found.orderType === 'subscription' ? (opts.yearly ? 'yearly' : 'monthly') : undefined;
        const order = await deps.createOrder(token, {
          orderType: found.orderType,
          productId: found.product.id,
          billingCycle,
          couponCode: opts.coupon,
        });
        const productLabel = billingCycle
          ? `${order.product_name}（${billingCycle === 'yearly' ? '年付' : '月付'}）`
          : order.product_name;
        const row = {
          orderId: order.order_id,
          product: productLabel,
          amount: money(order.final_amount, fmt),
        };

        // 全额抵扣的券后端直接发放，无需支付
        if (order.status === 'fulfilled') {
          const balance = await deps.getBalance(token).catch(() => null);
          printOutput([{ ...row, status: 'fulfilled', balance }], COLUMNS, fmt);
          return;
        }

        const qr = await deps.createWechatQrcode(token, order.order_id);
        const qrPath = opts.qrOut || join(tmpdir(), `zovii-pay-${order.order_id}.png`);
        await deps.saveQrPng(qrPath, qr.code_url);

        const discount = order.discount_amount
          ? `（原价 ${money(order.original_amount)}，已优惠 ${money(order.discount_amount)}）`
          : '';
        deps.log(`${productLabel} 应付 ${money(order.final_amount)}${discount}`);
        // 非 TTY 多半是 AI agent 在调用，字符二维码只会刷屏，交给它 PNG 路径即可
        if (deps.isTTY()) deps.log(await deps.renderQrTerminal(qr.code_url));
        deps.log(`请在 ${localTime(qr.expires_at)} 前用微信扫码支付，二维码图片：${qrPath}`);

        const pendingRow = { ...row, status: 'pending', expiresAt: qr.expires_at, qrPath };
        if (opts.wait === false) {
          printOutput([pendingRow], COLUMNS, fmt);
          return;
        }

        const expiresAt = new Date(qr.expires_at).getTime();
        const deadline = timeoutSec ? Math.min(expiresAt, Date.now() + timeoutSec * 1000) : expiresAt;

        deps.log('等待支付结果…（Ctrl+C 可退出，付款后用 zovii order 查询）');
        const done = await pollOrder((id) => deps.getOrderStatus(token, id), order.order_id, {
          deadline,
          intervalMs: deps.pollIntervalMs,
        });
        if (done?.status !== 'fulfilled') {
          // 已付款只是积分还没发完，不能让用户以为失败而重复购买
          if (done?.status === 'paid') {
            throw new CommandError(`已收到付款，积分发放中，稍后运行 zovii order ${order.order_id} 确认到账，请勿重复购买`);
          }
          const tail = deadline >= expiresAt
            ? '订单已过期，如需购买请重新运行 zovii buy'
            : `订单 ${localTime(qr.expires_at)} 前仍可支付，付款后运行 zovii order ${order.order_id} 查看结果`;
          throw new CommandError(`等待支付超时：${tail}`);
        }
        const balance = await deps.getBalance(token).catch(() => null);
        deps.log(`支付成功，${ORDER_STATUS_TEXT.fulfilled}`);
        printOutput([{ ...pendingRow, status: 'fulfilled', balance }], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
