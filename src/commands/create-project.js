import { getToken as realGetToken } from '../token.js';
import { createProject as realCreateProject, getMe as realGetMe } from '../utils.js';
import { promptLine as realPromptLine } from '../auth/prompt.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['projectId', 'projectName', 'enterpriseId', 'createdAt'];

const realDeps = {
  getToken: realGetToken,
  getMe: realGetMe,
  createProject: realCreateProject,
  promptLine: realPromptLine,
  isTTY: () => Boolean(process.stdin.isTTY),
};

// 把交互输入归一化为是否个人项目：'2'/enterprise/企业 → 企业(false)，其余(含空) → 个人(true)
function parseTypeChoice(input) {
  const v = String(input ?? '').trim().toLowerCase();
  if (v === '2' || v === 'enterprise' || v === '企业') return false;
  return true;
}

/**
 * 决定本次创建是否为个人项目（personal_project 值），返回 true/false/undefined。
 * - 显式 --type：直接采用，跳过身份探测与交互
 * - 否则查 /me：非企业成员 → 个人(true)，无需选择
 * - 企业成员：TTY 下交互选择（默认个人），非 TTY 默认个人(true)
 */
async function resolveType(deps, token, typeOpt) {
  if (typeOpt !== undefined) {
    if (typeOpt === 'personal') return true;
    if (typeOpt === 'enterprise') return false;
    throw new ArgumentError("--type 仅支持 personal 或 enterprise");
  }
  const me = await deps.getMe(token);
  const isEnterpriseMember = Boolean(me?.enterprise_id);
  if (!isEnterpriseMember) return true; // 非企业用户无需选择，直接个人项目
  if (!deps.isTTY()) return true; // 非交互终端默认个人项目
  const answer = await deps.promptLine(
    '请选择项目类型 [1] 个人项目（默认） [2] 企业项目: ',
    { isTTY: true },
  );
  return parseTypeChoice(answer);
}

export function register(program, deps = realDeps) {
  program
    .command('create-project <name>')
    .description('新建项目，返回 project ID（企业成员可选个人/企业项目，默认个人）')
    .option('--type <type>', '项目类型：personal（默认）/ enterprise，跳过交互选择')
    .action(async (name, options) => {
      const fmt = program.opts().format;
      try {
        const token = await deps.getToken();
        const personalProject = await resolveType(deps, token, options.type);
        const project = await deps.createProject(token, name.trim(), { personalProject });
        printOutput(
          [{
            projectId: project.id ?? '',
            projectName: project.name ?? '',
            enterpriseId: project.enterprise_id ?? '',
            createdAt: project.created_at ?? '',
          }],
          COLUMNS,
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
