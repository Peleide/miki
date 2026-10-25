import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { dbFirestore, functions, storage } from '../firebaseConfig';
import { db } from '../db';
import { CLIENT_SCOPED, COLL, GmaoRole, GmaoUser, MIKI_FROM_ROLE, ROLE_FROM_MIKI, SHARED_COLLS, withDefaults } from '../../functions/src/gmao/model';
import { Account, GmaoBackend, PublicBackend, compressImage } from './backend';

export interface FirebaseIdentity {
  tenantId: string;
  userId: string;
  name: string;
  role: GmaoRole;
  clientId: string | null;
}

const errMsg = (e: any) => new Error(e?.message || 'Erreur de communication avec le serveur.');

export function firebaseBackend(me: FirebaseIdentity): GmaoBackend {
  const { tenantId } = me;
  const fn = httpsCallable(functions, 'gmaoAction');
  const manageUser = httpsCallable(functions, 'manageUser');
  const isClient = me.role === 'CLIENT';

  return {
    mode: 'firebase',
    tenantId,
    async call(action, payload) {
      try {
        const res = await fn({ tenantId, action, payload });
        return res.data;
      } catch (e: any) {
        throw errMsg(e);
      }
    },
    subscribe(coll, cb) {
      // Un compte client ne lit que ses machines (les règles Firestore l'imposent : la requête doit filtrer).
      if (isClient && !CLIENT_SCOPED.includes(coll) && !SHARED_COLLS.includes(coll) && coll !== COLL.clients) { cb([]); return () => {}; }
      if (isClient && coll === COLL.clients) {
        if (!me.clientId) { cb([]); return () => {}; }
        return onSnapshot(doc(dbFirestore, 'tenants', tenantId, coll, me.clientId), s => cb(s.exists() ? [{ id: s.id, ...s.data() }] as any : []), () => cb([]));
      }
      const ref = collection(dbFirestore, 'tenants', tenantId, coll);
      let source: any = ref;
      if (isClient && CLIENT_SCOPED.includes(coll)) source = query(ref, where('clientId', '==', me.clientId || '__none__'));
      else if (coll === COLL.assetEvents) source = query(ref, where('at', '>=', new Date(Date.now() - 400 * 86400000).toISOString()));
      return onSnapshot(
        source,
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]),
        err => { console.error(`[GMAO] lecture ${coll}`, err); cb([]); },
      );
    },
    subscribeTenant(cb) {
      return onSnapshot(doc(dbFirestore, 'tenants', tenantId), snap => {
        const d: any = snap.data() || {};
        cb({ name: d.name || 'Maintenance', plan: d.plan || null, settings: withDefaults(d.gmao) });
      });
    },
    subscribeNotifications(userId, cb) {
      return db.subscribeToNotifications(userId, n => cb(n.filter(x => !x.tenantId || x.tenantId === tenantId) as any));
    },
    markNotificationRead: (userId, id) => db.markNotificationRead(userId, id),
    markAllNotificationsRead: (userId) => db.markAllNotificationsRead(userId),
    async listUsers(): Promise<GmaoUser[]> {
      if (isClient) return [{ id: me.userId, name: me.name, role: me.role, clientId: me.clientId }];
      try {
        const res: any = await fn({ tenantId, action: 'USERS_LIST', payload: {} });
        return res.data as GmaoUser[];
      } catch {
        return [{ id: me.userId, name: me.name, role: me.role, clientId: me.clientId }];
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
    publicOrigin: () => window.location.origin,
    accounts: {
      async list(): Promise<Account[]> {
        const snap = await getDocs(query(collection(dbFirestore, 'users'), where('accessibleTenantIds', 'array-contains', tenantId)));
        return snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(u => u.tenantsAccess?.platform !== 'ADMIN' && !u.isArchived)
          .map(u => ({
            id: u.id,
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
            email: u.email || '',
            role: ROLE_FROM_MIKI[u.tenantsAccess?.[tenantId] || u.role] || 'CLIENT',
            clientId: u.gmaoClientIds?.[tenantId] || null,
            isDisabled: !!u.isDisabled,
          }))
          .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
      },
      async create(a) {
        try {
          const res: any = await manageUser({ action: 'CREATE', tenantId, userData: { email: a.email, firstName: a.firstName, lastName: a.lastName, role: MIKI_FROM_ROLE[a.role], ...(a.role === 'CLIENT' ? { gmaoClientId: a.clientId } : {}) } });
          return { password: res.data?.password || '' };
        } catch (e) { throw errMsg(e); }
      },
      async resetPassword(id) {
        try {
          const res: any = await manageUser({ action: 'RESET_PASSWORD', tenantId, targetUserId: id });
          return { password: res.data?.tempPassword || '' };
        } catch (e) { throw errMsg(e); }
      },
      async setDisabled(id, disabled) {
        try { await manageUser({ action: 'UPDATE', tenantId, targetUserId: id, userData: { isDisabled: disabled } }); } catch (e) { throw errMsg(e); }
      },
    },
  };
}

export function firebasePublicBackend(): PublicBackend {
  const fn = httpsCallable(functions, 'gmaoPublic');
  return {
    async info(token) {
      try { return (await fn({ action: 'INFO', token })).data as any; } catch (e) { throw errMsg(e); }
    },
    async report(token, payload) {
      try { return (await fn({ action: 'REPORT', token, payload })).data as any; } catch (e) { throw errMsg(e); }
    },
  };
}
