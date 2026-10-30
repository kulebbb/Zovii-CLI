import { getToken as realGetToken } from '../token.js';
import {
  listPlans as realListPlans,
  listPacks as realListPacks,
  getBalance as realGetBalance,
} from '../utils.js';
import { money, approxImages } from '../billing.js';
import { printOutput, handleError } from '../output.js';

// 中文只放最后一列：表格按字符数对齐，中文宽两格，放中间会把后面的列挤歪
const COLUMNS = [
  'type', 'productId', 'name', 'monthlyPrice', 'yearlyPrice', 'monthlyCredits',
  'price', 'credits', 'validityDays', 'approxImages', 'note',
];

const realDeps = {
  getToken: realGetToken,
  listPlans: realListPlans,
  listPacks: realListPacks,
  getBalance: realGetBalance,
  log: (msg) => process.stderr.write(`${msg}\n`),
};

export function planRow(plan, fmt) {
  return {
    type: 'subscription',
    productId: plan.id,
    name: plan.name,
    monthlyPrice: money(plan.monthly_price, fmt),
    yearlyPrice: money(plan.yearly_price, fmt),
    monthlyCredits: plan.monthly_credits,
    approxImages: approxImages(plan.monthly_credits, plan.min_image_cost),
    // 停用套餐只会作为「当前用户自己那档」下发，仅可同档续费
    note: plan.is_active === false ? '已停售，仅可续费' : '月付/年付',
  };
}

export function packRow(pack, fmt) {
  return {
    type: 'credit_pack',
    productId: pack.id,
    price: money(pack.price, fmt),
    credits: pack.credits,
    approxImages: approxImages(pack.credits, pack.min_image_cost),
    validityDays: pack.validity_days,
    note: `${pack.credits} 积分包，${pack.is_member ? '会员价' : '非会员价'}`,
  };
}

export function register(program, deps = realDeps) {
  program
    .command('plans')
    .description('查看订阅套餐、积分包价格与当前积分余额')
    .action(async () => {
      const fmt = program.opts().format;
      try {
        const token = await deps.getToken();
        const [plans, packs] = await Promise.all([deps.listPlans(token), deps.listPacks(token)]);
        const rows = [...plans.map((p) => planRow(p, fmt)), ...packs.map((p) => packRow(p, fmt))];
        printOutput(rows, COLUMNS, fmt);
        // 余额只是附加信息，拉取失败不影响价格展示；走 stderr 保持 stdout 为纯数据
        const balance = await deps.getBalance(token).catch(() => null);
        if (balance !== null) deps.log(`当前积分余额：${balance}`);
        deps.log('购买：zovii buy <productId>（订阅默认月付，年付加 --yearly）');
      } catch (err) {
        handleError(err);
      }
    });
}
