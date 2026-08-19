/**
 * Splits a materialized `Folder.path` (`/rootId/childId/thisId/`) into its ordered list
 * of folder ids, root first, self last. See ARCHITECTURE.md §4.
 */
export function parsePathIds(path: string): string[] {
  return path.split('/').filter(Boolean);
}
