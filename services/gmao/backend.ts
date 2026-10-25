import { CollName, GmaoNotification, GmaoRole, GmaoSettings, GmaoUser, TenantPlan } from '../../functions/src/gmao/model';

export interface TenantView {
  name: string;
  plan: TenantPlan | null;
  settings: GmaoSettings;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  role: GmaoRole;
  clientId: string | null;
  isDisabled: boolean;
}

/** Accès aux données GMAO : Firebase (production) ou mémoire locale (démo). */
export interface GmaoBackend {
  mode: 'firebase' | 'demo';
  tenantId: string;
  call(action: string, payload?: any): Promise<any>;
  subscribe<T = any>(coll: CollName, cb: (docs: T[]) => void): () => void;
  subscribeTenant(cb: (t: TenantView) => void): () => void;
  subscribeNotifications(userId: string, cb: (n: GmaoNotification[]) => void): () => void;
  markNotificationRead(userId: string, id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  listUsers(): Promise<GmaoUser[]>;
  upload(folder: string, file: File): Promise<string>;
  /** Origine des URL des QR codes (ex. https://app.miki.nc). */
  publicOrigin(): string;
  accounts: {
    list(): Promise<Account[]>;
    create(a: { firstName: string; lastName: string; email: string; role: GmaoRole; clientId?: string | null }): Promise<{ password: string }>;
    resetPassword(id: string): Promise<{ password: string }>;
    setDisabled(id: string, disabled: boolean): Promise<void>;
  };
}

/** Accès sans compte, pour la page publique du QR code. */
export interface PublicBackend {
  info(token: string): Promise<{ organization: string; enabled: boolean; asset: { code: string; name: string; typology: string | null; site: string | null; location: string | null; client: string | null } }>;
  report(token: string, payload: any): Promise<{ number: string; duplicate?: boolean }>;
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

export async function toDataUrl(file: File, maxSize = 1024, quality = 0.7): Promise<string> {
  const blob = await compressImage(file, maxSize, quality);
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
