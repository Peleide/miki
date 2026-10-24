import { CollName, GmaoNotification, GmaoSettings, GmaoUser } from '../../functions/src/gmao/model';

/** Accès aux données GMAO : Firebase (production) ou mémoire locale (démo). */
export interface GmaoBackend {
  mode: 'firebase' | 'demo';
  tenantId: string;
  call(action: string, payload?: any): Promise<any>;
  subscribe<T = any>(coll: CollName, cb: (docs: T[]) => void): () => void;
  subscribeSettings(cb: (s: GmaoSettings) => void): () => void;
  subscribeNotifications(userId: string, cb: (n: GmaoNotification[]) => void): () => void;
  markNotificationRead(userId: string, id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  listUsers(): Promise<GmaoUser[]>;
  upload(folder: string, file: File): Promise<string>;
}

/** Réduit une photo avant envoi (terrain : réseau mobile, et stockage démo). */
export async function compressImage(file: File, maxSize = 1280, quality = 0.75): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b || file), 'image/jpeg', quality));
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
