import { resolve } from 'node:path';
import { getToken as realGetToken } from '../token.js';
import {
  resolveLibraryOwner as realResolveLibraryOwner,
  listLibraryAssets as realListLibraryAssets,
  listLibraryTags as realListLibraryTags,
  uploadLibraryAsset as realUploadLibraryAsset,
  importToLibrary as realImportToLibrary,
  exportLibraryAsset as realExportLibraryAsset,
  downloadLibraryAsset as realDownloadLibraryAsset,
  renameLibraryAsset as realRenameLibraryAsset,
  addLibraryTag as realAddLibraryTag,
  removeLibraryTag as realRemoveLibraryTag,
  setLibraryPinned as realSetLibraryPinned,
  deleteLibraryAsset as realDeleteLibraryAsset,
  restoreLibraryAsset as realRestoreLibraryAsset,
  libraryRow,
  assetRow,
} from '../utils.js';
import { looksLikeUuid } from '../helpers.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const LIBRARY_COLUMNS = [
  'libraryAssetId', 'name', 'type', 'library', 'tags', 'pinned', 'creatorDisplayId',
  'fileUrl', 'thumbnailUrl', 'url', 'width', 'height', 'duration', 'createdAt',
];
const VALID_TYPES = ['image', 'video', 'audio', 'pdf', 'markdown', 'url'];

const realDeps = {
  getToken: realGetToken,
  resolveLibraryOwner: realResolveLibraryOwner,
  listLibraryAssets: realListLibraryAssets,
  listLibraryTags: realListLibraryTags,
  uploadLibraryAsset: realUploadLibraryAsset,
  importToLibrary: realImportToLibrary,
  exportLibraryAsset: realExportLibraryAsset,
  downloadLibraryAsset: realDownloadLibraryAsset,
  renameLibraryAsset: realRenameLibraryAsset,
  addLibraryTag: realAddLibraryTag,
  removeLibraryTag: realRemoveLibraryTag,
  setLibraryPinned: realSetLibraryPinned,
  deleteLibraryAsset: realDeleteLibraryAsset,
  restoreLibraryAsset: realRestoreLibraryAsset,
};

function splitCsv(s) {
  return String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

// 资产库 ID 允许带 lib: 前缀，方便直接复用生成命令里的写法
function parseLibraryId(raw) {
  const id = String(raw ?? '').trim().replace(/^lib:/, '');
  if (!looksLikeUuid(id)) throw new ArgumentError(`"${raw}" 不是有效的资产库素材 ID`);
  return id;
}

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) throw new ArgumentError('--limit 必须是正整数');
  return n;
}

export function register(program, deps = realDeps) {
  const library = program
    .command('library')
    .description('资产库（跨项目素材库，默认个人库，--enterprise 切企业库）：查看 / 上传 / 下载 / 整理');

  // 子命令统一的执行壳：取 token、按全局 --format 输出、错误走 handleError
  const run = (fn) => async (...args) => {
    const fmt = program.opts().format;
    try {
      const token = await deps.getToken();
      const { rows, columns } = await fn(token, ...args);
      printOutput(rows, columns, fmt);
    } catch (err) {
      handleError(err);
    }
  };
  const one = (asset) => ({ rows: [libraryRow(asset)], columns: LIBRARY_COLUMNS });

  const listAction = (trash) => run(async (token, opts) => {
    const type = opts.type.trim();
    if (type && !VALID_TYPES.includes(type)) {
      throw new ArgumentError(`--type 只能是 ${VALID_TYPES.join(' / ')}`);
    }
    const limit = parseLimit(opts.limit);
    const owner = await deps.resolveLibraryOwner(token, { enterprise: opts.enterprise });
    const items = await deps.listLibraryAssets(token, owner, {
      type: type || undefined,
      tag: opts.tag.trim() || undefined,
      q: opts.q.trim() || undefined,
      pinned: Boolean(opts.pinned),
      trash,
      limit,
    });
    return { rows: items.map(libraryRow), columns: LIBRARY_COLUMNS };
  });

  for (const [name, desc, trash] of [
    ['list', '列出资产库素材（支持按类型 / 标签 / 关键词 / 置顶筛选）', false],
    ['trash', '列出资产库回收站里的素材（可用 restore 恢复）', true],
  ]) {
    library
      .command(name)
      .description(desc)
      .option('--enterprise', '使用企业库（默认个人库）')
      .option('--type <type>', `按类型过滤：${VALID_TYPES.join(' / ')}`, '')
      .option('--tag <tag>', '按标签过滤', '')
      .option('--q <keyword>', '按名称 / 创建人关键词搜索', '')
      .option('--pinned', '只看置顶素材')
      .option('--limit <n>', '最多返回多少条', '100')
      .action(listAction(trash));
  }

  library
    .command('tags')
    .description('列出资产库已有标签及使用次数')
    .option('--enterprise', '使用企业库（默认个人库）')
    .action(run(async (token, opts) => {
      const owner = await deps.resolveLibraryOwner(token, { enterprise: opts.enterprise });
      const tags = await deps.listLibraryTags(token, owner);
      return { rows: tags.map((t) => ({ tag: t.name, count: t.count })), columns: ['tag', 'count'] };
    }));

  library
    .command('upload <file>')
    .description('上传本地文件到资产库，返回资产库素材 ID')
    .option('--enterprise', '上传到企业库（默认个人库）')
    .option('--tags <tags>', '附带标签，多个逗号分隔', '')
    .action(run(async (token, file, opts) => {
      const owner = await deps.resolveLibraryOwner(token, { enterprise: opts.enterprise });
      return one(await deps.uploadLibraryAsset(token, owner, file, { tags: splitCsv(opts.tags) }));
    }));

  library
    .command('import <project> <assets>')
    .description('把项目素材收进资产库（assets 为项目素材 ID，多个逗号分隔）')
    .option('--enterprise', '收进企业库（默认个人库）')
    .action(run(async (token, project, assets, opts) => {
      const ids = splitCsv(assets);
      if (!ids.length) throw new ArgumentError('至少指定一个项目素材 ID');
      const owner = await deps.resolveLibraryOwner(token, { enterprise: opts.enterprise });
      const { items, skipped } = await deps.importToLibrary(token, owner, project, ids);
      if (skipped.length) {
        process.stderr.write(`以下素材未收入（不存在或不支持）：${skipped.join(', ')}\n`);
      }
      return { rows: items.map(libraryRow), columns: LIBRARY_COLUMNS };
    }));

  library
    .command('export <project> <libraryAssets>')
    .description('把资产库素材复制进项目，返回新的项目素材 ID（个人库 / 企业库自动识别）')
    .action(run(async (token, project, libraryAssets) => {
      const ids = splitCsv(libraryAssets).map(parseLibraryId);
      if (!ids.length) throw new ArgumentError('至少指定一个资产库素材 ID');
      const rows = [];
      // 逐个导出：后端批量返回不带来源 ID，逐个才能对应「资产库 ID → 项目素材 ID」
      for (const id of ids) {
        const asset = await deps.exportLibraryAsset(token, project, id);
        rows.push({ libraryAssetId: id, ...assetRow(asset) });
      }
      return { rows, columns: ['libraryAssetId', 'assetId', 'assetName', 'assetType', 'fileUrl', 'width', 'height', 'duration'] };
    }));

  library
    .command('download <libraryAsset>')
    .description('下载资产库素材到本地')
    .option('--out <path>', '保存路径（缺省用素材名存当前目录）', '')
    .action(run(async (token, raw, opts) => {
      const id = parseLibraryId(raw);
      const out = opts.out.trim() ? resolve(opts.out.trim()) : undefined;
      const { asset, localPath, bytes } = await deps.downloadLibraryAsset(token, id, out);
      return {
        rows: [{ libraryAssetId: id, name: asset?.name ?? '', type: asset?.type ?? '', localPath: resolve(localPath), bytes }],
        columns: ['libraryAssetId', 'name', 'type', 'localPath', 'bytes'],
      };
    }));

  library
    .command('rename <libraryAsset> <name>')
    .description('重命名资产库素材')
    .action(run(async (token, raw, name) => {
      if (!name.trim()) throw new ArgumentError('名称不能为空');
      return one(await deps.renameLibraryAsset(token, parseLibraryId(raw), name.trim()));
    }));

  library
    .command('tag <libraryAsset> <tags>')
    .description('给资产库素材加标签（多个逗号分隔）')
    .action(run(async (token, raw, tags) => {
      const id = parseLibraryId(raw);
      const list = splitCsv(tags);
      if (!list.length) throw new ArgumentError('至少指定一个标签');
      let asset;
      for (const t of list) asset = await deps.addLibraryTag(token, id, t);
      return one(asset);
    }));

  library
    .command('untag <libraryAsset> <tags>')
    .description('移除资产库素材的标签（多个逗号分隔）')
    .action(run(async (token, raw, tags) => {
      const id = parseLibraryId(raw);
      const list = splitCsv(tags);
      if (!list.length) throw new ArgumentError('至少指定一个标签');
      let asset;
      for (const t of list) asset = await deps.removeLibraryTag(token, id, t);
      return one(asset);
    }));

  for (const [name, desc, pinned] of [
    ['pin', '置顶资产库素材', true],
    ['unpin', '取消置顶资产库素材', false],
  ]) {
    library
      .command(`${name} <libraryAsset>`)
      .description(desc)
      .action(run(async (token, raw) => one(await deps.setLibraryPinned(token, parseLibraryId(raw), pinned))));
  }

  library
    .command('delete <libraryAsset>')
    .description('删除资产库素材（进回收站，可用 restore 恢复）')
    .action(run(async (token, raw) => one(await deps.deleteLibraryAsset(token, parseLibraryId(raw)))));

  library
    .command('restore <libraryAsset>')
    .description('从回收站恢复资产库素材')
    .action(run(async (token, raw) => one(await deps.restoreLibraryAsset(token, parseLibraryId(raw)))));
}
