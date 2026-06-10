#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';
import { register as registerCreateProject } from '../src/commands/create-project.js';
import { register as registerGenerateImage } from '../src/commands/generate-image.js';
import { register as registerGenerateVideo } from '../src/commands/generate-video.js';
import { register as registerUploadAsset } from '../src/commands/upload-asset.js';
import { register as registerDownloadAsset } from '../src/commands/download-asset.js';
import { register as registerListAssets } from '../src/commands/list-assets.js';
import { register as registerRemoveBackground } from '../src/commands/remove-background.js';
import { register as registerUpscaleVideo } from '../src/commands/upscale-video.js';
import { register as registerListProjects } from '../src/commands/list-projects.js';
import { register as registerSendCode } from '../src/commands/send-code.js';
import { register as registerListGroups } from '../src/commands/list-groups.js';
import { register as registerCreateGroup } from '../src/commands/create-group.js';
import { register as registerAddToGroup } from '../src/commands/add-to-group.js';
import { register as registerRenameGroup } from '../src/commands/rename-group.js';
import { register as registerSetAutoOrganize } from '../src/commands/set-auto-organize.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version(pkg.version)
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);
registerCreateProject(program);
registerGenerateImage(program);
registerGenerateVideo(program);
registerUploadAsset(program);
registerDownloadAsset(program);
registerListAssets(program);
registerRemoveBackground(program);
registerUpscaleVideo(program);
registerListProjects(program);
registerSendCode(program);
registerListGroups(program);
registerCreateGroup(program);
registerAddToGroup(program);
registerRenameGroup(program);
registerSetAutoOrganize(program);

program.parse();
