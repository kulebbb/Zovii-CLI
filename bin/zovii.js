#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

program.parse();
