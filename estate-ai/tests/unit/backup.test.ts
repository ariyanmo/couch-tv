import { describe, expect, it } from 'vitest';
import { createBackup, restoreBackup, validateBackup } from '../../src/store/backup';
import * as idb from '../../src/store/db';
import { createSampleProperty } from '../../src/core/model';
import type { PhotoMeta } from '../../src/core/types';

describe('backup and restore', () => {
  it('round-trips a property with a photo through JSON', async () => {
    const p = createSampleProperty();
    await idb.saveProperty(p);
    const meta: PhotoMeta = { id: 'ph1', propertyId: p.id, name: 'x.jpg', tags: [], takenAt: 1, addedAt: 1, width: 2, height: 2, collectionIds: [], roomId: p.rooms[0].id };
    const blob = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' });
    await idb.savePhoto(meta, blob, blob);
    const backup = await createBackup([p], [meta]);
    const json = JSON.parse(JSON.stringify(backup));
    validateBackup(json);
    await idb.deletePropertyData(p.id);
    expect((await idb.loadAll()).properties).toHaveLength(0);
    const restored = await restoreBackup(json, 'merge', []);
    expect(restored.properties[0].rooms).toHaveLength(p.rooms.length);
    expect(restored.photos[0].roomId).toBe(p.rooms[0].id);
    const back = await idb.getPhotoBlob('ph1');
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250]));
  });
  it('rejects files that are not backups', () => {
    expect(() => validateBackup({ hello: 1 })).toThrow(/not an ESTATE AI backup/);
    expect(() => validateBackup({ format: 'estate-ai-backup', version: 99, properties: [], photos: [] })).toThrow(/newer/);
  });
});
