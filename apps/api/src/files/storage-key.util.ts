/**
 * `datarooms/{dataRoomId}/{fileId}` — derived from ids only, never from the filename or
 * folder. This is what makes rename and move pure database updates (see FilesService's
 * `update`) and Data Room deletion a single prefix delete rather than a tree walk. See
 * ARCHITECTURE.md §4/§5.
 */
export function buildStorageKey(dataRoomId: string, fileId: string): string {
  return `datarooms/${dataRoomId}/${fileId}`;
}

/** The prefix that owns every object belonging to a Data Room — used for the whole-room
 * blob cleanup on `DELETE /data-rooms/:id`. */
export function dataRoomStoragePrefix(dataRoomId: string): string {
  return `datarooms/${dataRoomId}/`;
}
