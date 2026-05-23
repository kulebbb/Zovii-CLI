#!/usr/bin/env node
import { Command } from 'commander';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';
import { register as registerCreateProject } from '../src/commands/create-project.js';
import { register as registerGenerateImage } from '../src/commands/generate-image.js';
import { register as registerGenerateVideo } from '../src/commands/generate-video.js';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);
registerCreateProject(program);
registerGenerateImage(program);
registerGenerateVideo(program);

program.parse();
