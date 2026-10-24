import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { dbFirestore, functions, storage } from '../firebaseConfig';
import { db } from '../db';
import { COLL, DEFAULT_SETTINGS, GmaoUser, ROLE_FROM_MIKI } from '../../functions/src/gmao/model';
import { GmaoBackend, compressImage } from './backend';
import { User } from '../../types';

export function firebaseBackend(user: User): GmaoBackend {
  const tenantId = user.tenantId;
  const fn = httpsCallable(functions, 'gmaoAction');

  return {
    mode: 'firebase',
    tenantId,
    async call(action, payload) {
      try {
        const res = await fn({ tenantId, action, payload });
        return res.data;
      } catch (e: any) {
        throw new Error(e?.message || 'Erreur de communication avec le serveur.');
      }
    },
    subscribe(coll, cb) {
      const ref = collection(dbFirestore, 'tenants', tenantId, coll);
      // Les événements (états, relevés) grossissent vite : on ne charge que ~13 mois, suffisant pour les indicateurs.
      const source = coll === COLL.assetEvents
        ? query(ref, where('at', '>=', new Date(Date.now() - 400 * 86400000).toISOString()))
        : ref;
      return onSnapshot(
        source,
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]),
        err => { console.error(`[GMAO] lecture ${coll}`, err); cb([]); },
      );
    },
    subscribeSettings(cb) {
      return onSnapshot(doc(dbFirestore, 'tenants', tenantId), snap => cb({ ...DEFAULT_SETTINGS, ...(snap.data()?.gmao || {}) }));
    },
    subscribeNotifications(userId, cb) {
      return db.subscribeToNotifications(userId, n => cb(n.filter(x => !x.tenantId || x.tenantId === tenantId) as any));
    },
    markNotificationRead: (userId, id) => db.markNotificationRead(userId, id),
    markAllNotificationsRead: (userId) => db.markAllNotificationsRead(userId),
    async listUsers(): Promise<GmaoUser[]> {
      try {
        const users = await db.getUsers(tenantId);
        return users
          .filter(u => !u.isDisabled)
          .map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email, role: ROLE_FROM_MIKI[u.role] || 'DEMANDEUR' }));
      } catch {
        // Les profils techniciens / demandeurs ne peuvent pas lire la liste des comptes.
        return [{ id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), role: ROLE_FROM_MIKI[user.role] || 'DEMANDEUR' }];
      }
    },
    async upload(folder, file) {
      const blob = await compressImage(file);
      const isImage = file.type.startsWith('image/');
      const ext = isImage ? 'jpg' : (file.name.split('.').pop() || 'bin');
      const path = `tenants/${tenantId}/gmao/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob, { contentType: isImage ? 'image/jpeg' : file.type });
      return getDownloadURL(ref);
    },
  };
}
