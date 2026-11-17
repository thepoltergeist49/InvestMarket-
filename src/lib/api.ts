let csrfTokenCache: string | null = null;
let sessionTokenCache: string | null = null;
const SESSION_STORAGE_KEY = 'im_session_token';

function readStoredSessionToken(): string | null {
  if (sessionTokenCache) return sessionTokenCache;
  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      sessionTokenCache = stored;
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return null;
}

export function setSessionToken(token: string | null) {
  sessionTokenCache = token;
  try {
    if (token) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function setCsrfToken(token: string | null) {
  csrfTokenCache = token;
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const sessionToken = readStoredSessionToken();
  if (sessionToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfTokenCache) {
    headers['X-CSRF-Token'] = csrfTokenCache;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (res.headers.get('X-Admin-Session-Expired') === 'inactivity') {
    setSessionToken(null);
    setCsrfToken(null);
    window.dispatchEvent(new CustomEvent('im-admin-expired'));
  }

  if (!res.ok) {
    const err = new Error(data.error || `Erreur serveur (${res.status})`) as Error & {
      status?: number;
      data?: any;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export function formatFCFA(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  return `${Math.round(num).toLocaleString('fr-FR')} FCFA`;
}

export function formatDateFR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeFR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function investmentStatusLabel(status?: string): { text: string; tone: string } {
  switch (status) {
    case 'active':
      return { text: 'Actif', tone: 'text-[#0F5132]' };
    case 'matured':
      return { text: 'Arrivé à échéance', tone: 'text-slate-900 font-semibold' };
    case 'pending_payment':
      return { text: 'En attente de paiement', tone: 'text-amber-700' };
    case 'failed':
      return { text: 'Échoué', tone: 'text-red-700' };
    default:
      return { text: status || '—', tone: 'text-slate-600' };
  }
}

export function paymentStatusLabel(status?: string): { text: string; tone: string } {
  switch (status) {
    case 'confirmed':
      return { text: 'Confirmé', tone: 'text-[#0F5132]' };
    case 'pending_confirmation':
    case 'initiated':
      return { text: 'En attente de vérification', tone: 'text-amber-700' };
    case 'failed':
      return { text: 'Rejeté / Échoué', tone: 'text-red-700' };
    default:
      return { text: status || '—', tone: 'text-slate-600' };
  }
}

export function withdrawalStatusLabel(status?: string): string {
  const map: Record<string, string> = {
    demande: 'Demandé',
    en_verification: 'Vérification',
    approuve: 'Approuvé',
    en_traitement: 'Traitement',
    termine: 'Terminé',
    refuse: 'Refusé',
    echoue: 'Échoué',
  };
  return (status && map[status]) || status || '—';
}

export function planStatusLabel(status?: string): string {
  const map: Record<string, string> = {
    brouillon: 'Brouillon',
    active: 'Active',
    scheduled: 'Programmée',
    suspendue: 'Suspendue',
    inactive: 'Suspendue',
    expiree: 'Expirée',
    expired: 'Expirée',
  };
  return (status && map[status]) || status || '—';
}
