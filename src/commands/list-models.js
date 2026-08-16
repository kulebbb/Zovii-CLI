import {
  getToolsConfig as realGetToolsConfig,
  findTool,
  getDefaultModel,
  resolveFields,
  visibleModels,
} from '../tools-config.js';
import { printOutput, handleError } from '../output.js';

const TOOL_COLUMNS = ['toolId', 'name', 'models', 'default'];
const MODEL_COLUMNS = ['modelId', 'name', 'default', 'minCost', 'options'];
// 只摘要用户能通过 CLI 直接指定的枚举参数
const SUMMARY_KEYS = ['ratio', 'aspect_ratio', 'image_size', 'size', 'quality', 'duration', 'resolution'];
const MAX_INLINE_OPTIONS = 8;

const realDeps = { getToolsConfig: realGetToolsConfig };

function summarizeField(key, field) {
  const { options } = field;
  if (options.length > MAX_INLINE_OPTIONS) {
    const tail = field.default ? `${options.length} 项，默认 ${field.default}` : `${options.length} 项`;
    return `${key}=${options[0]}…${options[options.length - 1]}(${tail})`;
  }
  const marked = options.map((o) => (String(field.default) === o ? `${o}*` : o));
  return `${key}=${marked.join('|')}`;
}

// 取该模型第一个子功能下可见的枚举字段，拼成一行紧凑摘要
function summarizeOptions(tool, model) {
  const subFeatureId = tool.sub_features?.[0]?.id;
  if (!subFeatureId) return '';
  let fields;
  try {
    fields = resolveFields(tool, subFeatureId, model.id);
  } catch {
    return '';
  }
  const parts = [];
  for (const key of SUMMARY_KEYS) {
    const field = fields.get(key);
    if (!field || !field.visible || !field.options.length) continue;
    parts.push(summarizeField(key, field));
  }
  return parts.join(' ');
}

export function register(program, deps = realDeps) {
  program
    .command('list-models [tool]')
    .description('列出产品当前可用的工具与模型（含各模型可选参数）')
    .option('--refresh', '强制刷新模型配置缓存')
    .action(async (toolId, opts) => {
      const fmt = program.opts().format;
      try {
        const tools = await deps.getToolsConfig(opts.refresh ? { refresh: true } : {});

        if (!toolId) {
          const rows = tools.map((tool) => ({
            toolId: tool.id,
            name: tool.name,
            models: visibleModels(tool).length,
            default: getDefaultModel(tool)?.id ?? '',
          }));
          printOutput(rows, TOOL_COLUMNS, fmt);
          return;
        }

        const tool = findTool(tools, toolId);
        const rows = visibleModels(tool).map((model) => ({
          modelId: model.id,
          name: model.name,
          // json 输出给机器读，用布尔；table 输出给人看，用 ✓
          default: fmt === 'json' ? model.default === true : model.default === true ? '✓' : '',
          minCost: model.credit_cost ?? '',
          options: summarizeOptions(tool, model),
        }));
        printOutput(rows, MODEL_COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
