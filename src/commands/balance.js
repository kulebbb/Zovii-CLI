import { getToken as realGetToken } from '../token.js';
import {
  getBalance as realGetBalance,
  getEnterpriseBalance as realGetEnterpriseBalance,
} from '../utils.js';
import { AuthRequiredError, CommandError } from '../errors.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['personalBalance', 'enterpriseId', 'enterpriseBalance'];

const realDeps = {
  getToken: realGetToken,
  getBalance: realGetBalance,
  getEnterpriseBalance: realGetEnterpriseBalance,
  log: (msg) => process.stderr.write(`${msg}\n`),
};

// 非企业成员给 null：表格模式整列跳过，json 模式如实给出 null（而不是冒充 0 或空串）
export function balanceRow(personalBalance, enterprise) {
  const hasEnterprise = Boolean(enterprise?.enterpriseId);
  return {
    personalBalance,
    enterpriseId: hasEnterprise ? enterprise.enterpriseId : null,
    enterpriseBalance: hasEnterprise ? enterprise.balance : null,
  };
}

export function register(program, deps = realDeps) {
  program
    .command('balance')
    .description('查看个人积分余额与企业可用额度（企业成员）')
    .action(async () => {
      const fmt = program.opts().format;
      try {
        const token = await deps.getToken();
        const personalBalance = await deps.getBalance(token);
        if (personalBalance === null) {
          throw new CommandError('查询余额失败：响应缺少 balance');
        }
        // 企业余额只是补充信息，查询失败不影响个人余额展示；企业列隐藏时明确告知原因
        const enterprise = await deps.getEnterpriseBalance(token).catch((err) => {
          // 两次请求之间 token 恰好失效时不降级，照常提示重新登录
          if (err instanceof AuthRequiredError) throw err;
          deps.log(`企业余额查询失败（${err.message}），已隐藏企业列`);
          return null;
        });
        printOutput([balanceRow(personalBalance, enterprise)], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
