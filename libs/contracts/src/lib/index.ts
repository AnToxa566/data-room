import { initContract } from '@ts-rest/core';

import { authContract } from './auth.js';
import { dataRoomsContract } from './data-rooms.js';
import { filesContract } from './files.js';
import { foldersContract } from './folders.js';
import { healthContract } from './health.js';
import { sharesContract } from './shares.js';

const c = initContract();

/** The single source of truth for the HTTP surface. See ARCHITECTURE.md §3, §6. */
export const contract = c.router({
  auth: authContract,
  dataRooms: dataRoomsContract,
  folders: foldersContract,
  files: filesContract,
  shares: sharesContract,
  health: healthContract,
});

export * from './common.js';
export * from './auth.js';
export * from './data-rooms.js';
export * from './folders.js';
export * from './files.js';
export * from './shares.js';
export * from './health.js';
