const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * `FolderStats.totalSize`/`File.size` are raw byte counts serialized as strings (BigInt
 * on the wire — see `libs/contracts/src/lib/common.ts`), so they need formatting before
 * they're fit to show a user. One decimal place past KB; whole bytes below that.
 */
export function formatBytes(value: string): string {
  let bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';

  let unitIndex = 0;
  while (bytes >= 1024 && unitIndex < UNITS.length - 1) {
    bytes /= 1024;
    unitIndex++;
  }

  const formatted = unitIndex === 0 ? String(bytes) : bytes.toFixed(1);
  return `${formatted} ${UNITS[unitIndex]}`;
}
