import express, { type Request, type Response, type NextFunction } from 'express';
import { db } from './db.ts';
import {
  formatRef,
  generateNumericCode,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './crypto.ts';
import {
  appendLedgerEntry,
  createNotification,
  getNextSeq,
  getPlatformFeeTotal,
  getUserAccountBalance,
  recordAuditLog,
} from './ledgerService.ts';
import { paymentService } from './paymentService.ts';
import { runMaturityCheck } from './maturityService.ts';

interface AuthUser {
  id: number;
  email: string;
  phone: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  csrfToken: string;
  sessionId: number;
  isAdminSession: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

function getPlatformSettings() {
  const row = db.prepare("SELECT content_json FROM cms_contents WHERE key = 'platform_settings'").get() as { content_json: string } | undefined;
  const defaults = {
    companyName: 'InvestMarket',
    logoText: 'InvestMarket',
    logoUrl: '',
    email: 'contact@investmarket.tg',
    phone: '+228 22 21 00 00',
    address: 'Boulevard du 13 Janvier, Lomé, Togo',
    currency: 'XOF',
    timezone: 'Africa/Lome',
    maintenanceMode: false,
    maintenanceMessage: 'La plateforme InvestMarket est actuellement en maintenance programmée. Les souscriptions reprendront très prochainement.',
    adminInactivityMinutes: 15,
    maxLoginAttempts: 5,
    dualApprovalThreshold: 500000,
    notificationsEnabled: true,
  };
  if (!row) return defaults;
  try {
    return { ...defaults, ...JSON.parse(row.content_json) };
  } catch {
    return defaults;
  }
}

// Simple memory rate-limiter for sensitive routes
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ error: 'Trop de requêtes effectuées. Veuillez patienter avant de réessayer.' });
    }
    bucket.count += 1;
    return next();
  };
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function parseSqliteUtcMs(iso?: string | null): number {
  if (!iso) return NaN;
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  return new Date(normalized).getTime();
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (proto === 'https') return true;
  const origin = String(req.headers.origin || '').toLowerCase();
  if (origin.startsWith('https://')) return true;
  return false;
}

function createSessionCookie(req: Request, res: Response, rawToken: string) {
  const isHttps = isHttpsRequest(req);
  res.cookie('im_session', rawToken, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(req: Request, res: Response) {
  const isHttps = isHttpsRequest(req);
  res.clearCookie('im_session', {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
}

function getBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7).trim();
  return token || undefined;
}

function buildPhoneCandidates(rawIdentifier: string): string[] {
  const cleanPhone = rawIdentifier.trim().replace(/[\s()-]+/g, '');
  if (!cleanPhone) return [];
  const candidates = new Set<string>([cleanPhone]);
  if (cleanPhone.startsWith('+228')) {
    candidates.add(cleanPhone.slice(4));
  } else if (/^\d{8}$/.test(cleanPhone)) {
    candidates.add(`+228${cleanPhone}`);
  }
  return Array.from(candidates);
}

function attachSession(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const bearerToken = getBearerToken(req);
  const cookieToken = cookies['im_session'];
  const candidates = [bearerToken, cookieToken].filter((t): t is string => Boolean(t));
  if (candidates.length === 0) return next();

  const findSessionStmt = db.prepare(`
    SELECT s.id as sessionId, s.user_id as userId, s.csrf_token as csrfToken, s.expires_at as expiresAt,
           s.is_admin_session as isAdminSession, s.last_activity_at as lastActivityAt,
           u.email, u.phone, u.status, r.code as roleCode, r.name as roleName, r.id as roleId
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
  `);

  type SessionRow = {
    sessionId: number;
    userId: number;
    csrfToken: string;
    expiresAt: string;
    isAdminSession: number;
    lastActivityAt: string;
    email: string;
    phone: string;
    status: string;
    roleCode: string;
    roleName: string;
    roleId: number;
  };

  let session: SessionRow | undefined;
  for (const raw of candidates) {
    session = findSessionStmt.get(hashToken(raw)) as SessionRow | undefined;
    if (session) break;
  }

  if (!session || session.status === 'suspended') {
    return next();
  }

  // Enforce admin session inactivity timeout
  if (session.isAdminSession === 1) {
    const settings = getPlatformSettings();
    const timeoutMin = Math.max(1, Number(settings.adminInactivityMinutes || 15));
    if (session.lastActivityAt) {
      const lastMs = parseSqliteUtcMs(session.lastActivityAt);
      if (!Number.isNaN(lastMs) && Date.now() - lastMs > timeoutMin * 60 * 1000) {
        db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`).run(session.sessionId);
        clearSessionCookie(req, res);
        res.setHeader('X-Admin-Session-Expired', 'inactivity');
        return next();
      }
    }
    db.prepare(`UPDATE sessions SET last_activity_at = datetime('now') WHERE id = ?`).run(session.sessionId);
  }

  const permRows = db.prepare(`
    SELECT p.code FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
  `).all(session.roleId) as Array<{ code: string }>;

  req.authUser = {
    id: session.userId,
    email: session.email,
    phone: session.phone,
    roleCode: session.roleCode,
    roleName: session.roleName,
    permissions: permRows.map((p) => p.code),
    csrfToken: session.csrfToken,
    sessionId: session.sessionId,
    isAdminSession: session.isAdminSession === 1,
  };
  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    if (!headerToken || headerToken !== req.authUser.csrfToken) {
      return res.status(403).json({ error: 'Jeton de sécurité CSRF invalide ou expiré.' });
    }
  }
  next();
}

function requireAdminSession(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Session administrateur expirée ou requise.' });
  }
  if (!req.authUser.isAdminSession) {
    return res.status(403).json({ error: 'Veuillez vous authentifier depuis le portail Administration InvestMarket avec votre code PIN.' });
  }
  const staffRoles = ['super_admin', 'finance', 'compliance', 'support', 'offer_manager', 'auditor', 'analyst'];
  if (!staffRoles.includes(req.authUser.roleCode)) {
    return res.status(403).json({ error: 'Accès strictement réservé aux administrateurs habilités.' });
  }
  next();
}

function requirePermission(perm: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }
    if (!req.authUser.isAdminSession) {
      return res.status(403).json({ error: 'Session administrateur requise.' });
    }
    if (req.authUser.roleCode === 'super_admin' || req.authUser.permissions.includes(perm)) {
      return next();
    }
    return res.status(403).json({ error: 'Accès refusé : privilèges insuffisants pour cette action.' });
  };
}

function assertAdminPin(req: Request, providedPin?: string): void {
  const pin = providedPin || String(req.headers['x-admin-pin'] || '');
  if (!pin) {
    throw new Error('Code PIN administrateur requis pour valider cette opération sensible.');
  }
  const adminRow = db.prepare('SELECT pin_hash, is_active FROM admin_users WHERE user_id = ?').get(req.authUser!.id) as {
    pin_hash: string | null;
    is_active: number;
  } | undefined;
  if (!adminRow || !adminRow.is_active || !adminRow.pin_hash || !verifyPassword(String(pin), adminRow.pin_hash)) {
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'ADMIN_PIN_VERIFICATION_FAILED',
      entityType: 'admin_security',
      entityId: req.authUser!.id,
      result: 'échec',
      ipAddress: req.ip,
    });
    throw new Error('Code PIN administrateur incorrect.');
  }
}

function serverCalculateInvestment(planId: number, durationId: number, rawAmount: number) {
  const plan = db.prepare('SELECT * FROM investment_plans WHERE id = ?').get(planId) as Record<string, any> | undefined;
  if (!plan) {
    throw new Error('Offre d’investissement introuvable.');
  }
  if (plan.status !== 'active' && plan.status !== 'scheduled') {
    throw new Error('Cette offre n’est pas ouverte à la souscription actuellement.');
  }
  if (plan.status === 'scheduled' && plan.scheduled_start_at && new Date(plan.scheduled_start_at) > new Date()) {
    throw new Error(`Cette offre ouvrira le ${plan.scheduled_start_at}.`);
  }

  const duration = db.prepare('SELECT * FROM investment_plan_durations WHERE id = ? AND plan_id = ? AND is_active = 1').get(durationId, planId) as Record<string, any> | undefined;
  if (!duration) {
    throw new Error('Durée sélectionnée invalide ou désactivée pour cette offre.');
  }

  const amount = Math.round(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Le montant saisi doit être un entier positif en FCFA.');
  }
  if (amount < plan.min_amount) {
    throw new Error(`Le montant minimum pour cette offre est de ${Number(plan.min_amount).toLocaleString('fr-FR')} FCFA.`);
  }
  if (amount > plan.max_amount) {
    throw new Error(`Le montant maximum pour cette offre est de ${Number(plan.max_amount).toLocaleString('fr-FR')} FCFA.`);
  }
  if (plan.step_amount > 0 && amount % plan.step_amount !== 0) {
    throw new Error(`Le montant doit être un multiple du palier de ${Number(plan.step_amount).toLocaleString('fr-FR')} FCFA.`);
  }
  const remainingCap = Number(plan.available_cap) - Number(plan.allocated_cap);
  if (amount > remainingCap) {
    throw new Error(`Capacité disponible insuffisante sur cette tranche (${remainingCap.toLocaleString('fr-FR')} FCFA restants).`);
  }

  const feePercentAmount = Math.round((amount * Number(plan.fee_percent)) / 100);
  const feeAmount = feePercentAmount + Number(plan.fee_fixed);
  const totalAmount = amount + feeAmount;

  const now = new Date();
  const maturityDate = new Date(now.getTime() + Number(duration.days) * 24 * 60 * 60 * 1000);

  // Indicative potential scenario (never guaranteed)
  let potentialScenarioMin: number | null = null;
  let potentialScenarioMax: number | null = null;
  if (plan.potential_rate_min != null && plan.potential_rate_max != null) {
    const yearFraction = Number(duration.days) / 365;
    potentialScenarioMin = Math.round(amount * (Number(plan.potential_rate_min) / 100) * yearFraction);
    potentialScenarioMax = Math.round(amount * (Number(plan.potential_rate_max) / 100) * yearFraction);
  }

  return {
    plan: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      slug: plan.slug,
      riskLevel: plan.risk_level,
      feePercent: plan.fee_percent,
      feeFixed: plan.fee_fixed,
      conditionsText: plan.conditions_text,
      exitRules: plan.exit_rules,
      renewalRules: plan.renewal_rules,
      rateDisclaimer: plan.rate_disclaimer,
      dailyLimit: plan.daily_limit,
      userLimit: plan.user_limit,
      remainingCap,
    },
    duration: {
      id: duration.id,
      label: duration.label,
      durationType: duration.duration_type,
      days: duration.days,
      weeks: duration.weeks,
      months: duration.months,
    },
    amount,
    feeAmount,
    totalAmount,
    currency: 'XOF',
    estimatedStartDate: now.toISOString(),
    estimatedMaturityDate: maturityDate.toISOString(),
    potentialScenarioMin,
    potentialScenarioMax,
    disclaimer: plan.rate_disclaimer,
  };
}

export function createApiRouter() {
  const router = express.Router();
  router.use(attachSession);

  // =========================================================
  // PUBLIC CMS, OFFERS, PROVIDERS, CALCULATOR & CONTACT
  // =========================================================
  router.get('/cms', (_req, res) => {
    const rows = db.prepare('SELECT key, section, title, content_json, updated_at FROM cms_contents').all() as Array<{
      key: string;
      section: string;
      title: string;
      content_json: string;
      updated_at: string;
    }>;
    const map: Record<string, unknown> = {};
    for (const r of rows) {
      map[r.key] = JSON.parse(r.content_json);
    }
    res.json({ contents: map, items: rows });
  });

  router.get('/plans', (_req, res) => {
    const plans = db.prepare(`
      SELECT * FROM investment_plans
      WHERE visibility = 'public'
        AND status IN ('active', 'scheduled')
        AND (expires_at IS NULL OR expires_at = '' OR datetime(expires_at) > datetime('now'))
      ORDER BY id ASC
    `).all() as Array<Record<string, any>>;

    const durationsStmt = db.prepare('SELECT * FROM investment_plan_durations WHERE plan_id = ? AND is_active = 1 ORDER BY days ASC');
    const enriched = plans.map((p) => ({
      ...p,
      durations: durationsStmt.all(p.id),
    }));
    res.json({ plans: enriched });
  });

  router.get('/plans/:slug', (req, res) => {
    const plan = db.prepare(`SELECT * FROM investment_plans WHERE slug = ? AND visibility = 'public'`).get(req.params.slug) as Record<string, any> | undefined;
    if (!plan) return res.status(404).json({ error: 'Offre introuvable.' });
    const durations = db.prepare('SELECT * FROM investment_plan_durations WHERE plan_id = ? AND is_active = 1 ORDER BY days ASC').all(plan.id);
    const docs = db.prepare('SELECT id, reference, title, doc_type, content_json, created_at FROM documents WHERE plan_id = ? AND user_id IS NULL').all(plan.id);
    res.json({ plan: { ...plan, durations, documents: docs } });
  });

  router.get('/payment-providers', (_req, res) => {
    const providers = db.prepare('SELECT code, name, country, currency, is_active, fee_percent, receiving_account, receiving_name, instructions, config_status FROM payment_providers WHERE is_active = 1 ORDER BY sort_order ASC').all();
    res.json({ providers });
  });

  router.post('/calculator', (req, res) => {
    try {
      const { planId, durationId, amount } = req.body || {};
      const result = serverCalculateInvestment(Number(planId), Number(durationId), Number(amount));
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Paramètres de calcul invalides.' });
    }
  });

  router.post('/contact', rateLimit(10, 60_000), (req, res) => {
    const { name, email, phone, subject, message } = req.body || {};
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Veuillez renseigner tous les champs obligatoires.' });
    }
    db.prepare(`
      INSERT INTO contact_messages (name, email, phone, subject, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(String(name).trim(), String(email).trim(), phone ? String(phone).trim() : null, String(subject).trim(), String(message).trim());
    res.json({ ok: true, message: 'Votre message a bien été transmis aux équipes InvestMarket.' });
  });

  // =========================================================
  // AUTHENTICATION, REGISTRATION, 2FA & SESSIONS
  // =========================================================
  router.post('/auth/register', rateLimit(15, 60_000), (req, res) => {
    try {
      const { firstName, lastName, email, phone, country, password, confirmPassword } = req.body || {};
      if (!firstName || !lastName || !email || !phone || !password) {
        return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPhone = String(phone).trim().replace(/\s+/g, '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Format d’adresse e-mail invalide.' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'La confirmation du mot de passe ne correspond pas.' });
      }

      const exists = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(cleanEmail, cleanPhone);
      if (exists) {
        return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail ou ce numéro de téléphone.' });
      }

      const userRole = db.prepare('SELECT id FROM roles WHERE code = ?').get('user') as { id: number };
      const verificationCode = generateNumericCode(6);

      const createAccount = db.transaction(() => {
        const uRes = db.prepare(`
          INSERT INTO users (email, phone, password_hash, role_id, verification_code, status)
          VALUES (?, ?, ?, ?, ?, 'pending_verification')
        `).run(cleanEmail, cleanPhone, hashPassword(String(password)), userRole.id, verificationCode);
        const userId = Number(uRes.lastInsertRowid);

        db.prepare(`
          INSERT INTO profiles (user_id, first_name, last_name, country)
          VALUES (?, ?, ?, ?)
        `).run(userId, String(firstName).trim(), String(lastName).trim(), country ? String(country).trim() : 'Togo');

        recordAuditLog({
          actorUserId: userId,
          actorEmail: cleanEmail,
          actorRole: 'user',
          action: 'USER_REGISTERED',
          entityType: 'user',
          entityId: userId,
          ipAddress: req.ip,
        });

        return userId;
      });

      const userId = createAccount();
      res.status(201).json({
        userId,
        email: cleanEmail,
        requiresVerification: true,
        // Returned in dev/sandbox response so tester can confirm OTP immediately without external SMTP/SMS gateway
        sandboxVerificationCode: verificationCode,
        message: 'Compte créé. Veuillez saisir le code de confirmation à 6 chiffres pour activer votre accès.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erreur lors de la création du compte.' });
    }
  });

  router.post('/auth/verify-account', rateLimit(20, 60_000), (req, res) => {
    const { email, code } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = db.prepare('SELECT id, verification_code, status FROM users WHERE email = ?').get(cleanEmail) as {
      id: number;
      verification_code: string | null;
      status: string;
    } | undefined;

    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    if (user.status === 'active') return res.json({ ok: true, message: 'Compte déjà activé.' });
    if (!code || user.verification_code !== String(code).trim()) {
      return res.status(400).json({ error: 'Code de vérification invalide.' });
    }

    db.prepare(`
      UPDATE users
      SET email_verified = 1, phone_verified = 1, verification_code = NULL, status = 'active'
      WHERE id = ?
    `).run(user.id);

    createNotification({
      userId: user.id,
      title: 'Bienvenue sur InvestMarket',
      message: 'Bienvenue sur InvestMarket. Votre compte investisseur est actif et prêt pour vos opérations.',
      category: 'account',
      actionUrl: '/dashboard',
    });

    const rawToken = generateToken(32);
    const csrfToken = generateToken(24);
    db.prepare(`
      INSERT INTO sessions (user_id, token_hash, csrf_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))
    `).run(user.id, hashToken(rawToken), csrfToken, req.ip || '', req.headers['user-agent'] || '');

    recordAuditLog({
      actorUserId: user.id,
      actorEmail: cleanEmail,
      actorRole: 'user',
      action: 'ACCOUNT_ACTIVATED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
    });

    createSessionCookie(req, res, rawToken);
    res.json({ ok: true, message: 'Compte activé avec succès.', sessionToken: rawToken, csrfToken });
  });

  router.post('/auth/login', rateLimit(20, 60_000), (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
    }
    const cleanId = String(identifier).trim().toLowerCase();
    const phoneCandidates = buildPhoneCandidates(String(identifier));
    const phonePlaceholders = phoneCandidates.map(() => '?').join(', ');

    const user = db.prepare(`
      SELECT u.*, r.code as role_code
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE lower(u.email) = ? ${phonePlaceholders ? `OR u.phone IN (${phonePlaceholders})` : ''}
    `).get(cleanId, ...phoneCandidates) as Record<string, any> | undefined;

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Ce compte est suspendu. Contactez le support InvestMarket.' });
    }

    const lockedUntilMs = parseSqliteUtcMs(user.locked_until);
    if (!Number.isNaN(lockedUntilMs) && lockedUntilMs > Date.now()) {
      return res.status(423).json({ error: 'Compte temporairement verrouillé suite à plusieurs tentatives infructueuses. Réessayez dans quelques minutes.' });
    }

    if (!verifyPassword(String(password), user.password_hash)) {
      const nextAttempts = Number(user.failed_login_attempts) + 1;
      if (nextAttempts >= 5) {
        db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = datetime('now', '+15 minutes') WHERE id = ?`).run(nextAttempts, user.id);
        recordAuditLog({
          actorUserId: user.id,
          actorEmail: user.email,
          action: 'SECURITY_BRUTEFORCE_LOCK',
          entityType: 'user',
          entityId: user.id,
          details: { attempts: nextAttempts },
          ipAddress: req.ip,
        });
      } else {
        db.prepare(`UPDATE users SET failed_login_attempts = ? WHERE id = ?`).run(nextAttempts, user.id);
      }
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    if (user.status === 'pending_verification') {
      const activationCode = user.verification_code || generateNumericCode(6);
      if (!user.verification_code) {
        db.prepare('UPDATE users SET verification_code = ? WHERE id = ?').run(activationCode, user.id);
      }
      return res.status(403).json({
        error: 'Compte non encore activé. Veuillez valider votre code de confirmation.',
        requiresVerification: true,
        email: user.email,
        sandboxVerificationCode: activationCode,
      });
    }

    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    // 2FA check if enabled
    if (user.two_factor_enabled === 1) {
      const code = generateNumericCode(6);
      db.prepare(`UPDATE users SET two_factor_code = ?, two_factor_expires_at = datetime('now', '+10 minutes') WHERE id = ?`).run(code, user.id);
      return res.json({
        requires2FA: true,
        userId: user.id,
        sandbox2FACode: code,
        message: 'Veuillez saisir le code d’authentification à deux facteurs.',
      });
    }

    const rawToken = generateToken(32);
    const csrfToken = generateToken(24);
    db.prepare(`
      INSERT INTO sessions (user_id, token_hash, csrf_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))
    `).run(user.id, hashToken(rawToken), csrfToken, req.ip || '', req.headers['user-agent'] || '');

    recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role_code,
      action: 'USER_LOGIN',
      entityType: 'session',
      entityId: user.id,
      ipAddress: req.ip,
    });

    createSessionCookie(req, res, rawToken);
    res.json({ ok: true, role: user.role_code, sessionToken: rawToken, csrfToken });
  });

  router.post('/auth/verify-2fa', rateLimit(15, 60_000), (req, res) => {
    const { userId, code } = req.body || {};
    const user = db.prepare(`
      SELECT u.*, r.code as role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?
    `).get(Number(userId)) as Record<string, any> | undefined;

    if (!user || !user.two_factor_code || user.two_factor_code !== String(code || '').trim()) {
      return res.status(400).json({ error: 'Code 2FA invalide.' });
    }
    const twoFaExpMs = parseSqliteUtcMs(user.two_factor_expires_at);
    if (!Number.isNaN(twoFaExpMs) && twoFaExpMs < Date.now()) {
      return res.status(400).json({ error: 'Code 2FA expiré.' });
    }

    db.prepare('UPDATE users SET two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?').run(user.id);
    const rawToken = generateToken(32);
    const csrfToken = generateToken(24);
    db.prepare(`
      INSERT INTO sessions (user_id, token_hash, csrf_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))
    `).run(user.id, hashToken(rawToken), csrfToken, req.ip || '', req.headers['user-agent'] || '');

    createSessionCookie(req, res, rawToken);
    res.json({ ok: true, role: user.role_code, sessionToken: rawToken, csrfToken });
  });

  router.post('/auth/forgot-password', rateLimit(10, 60_000), (req, res) => {
    const { email } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(cleanEmail) as { id: number } | undefined;
    if (!user) {
      return res.json({ ok: true, message: 'Si cette adresse est associée à un compte, un code de réinitialisation a été généré.' });
    }
    const resetCode = generateNumericCode(6);
    db.prepare('UPDATE users SET verification_code = ? WHERE id = ?').run(resetCode, user.id);
    res.json({
      ok: true,
      sandboxResetCode: resetCode,
      message: 'Un code de réinitialisation à 6 chiffres a été généré.',
    });
  });

  router.post('/auth/reset-password', rateLimit(10, 60_000), (req, res) => {
    const { email, code, newPassword } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 8 caractères.' });
    }
    const user = db.prepare('SELECT id, verification_code FROM users WHERE lower(email) = ?').get(cleanEmail) as { id: number; verification_code: string | null } | undefined;
    if (!user || !user.verification_code || user.verification_code !== String(code || '').trim()) {
      return res.status(400).json({ error: 'Code de réinitialisation invalide.' });
    }
    db.prepare('UPDATE users SET password_hash = ?, verification_code = NULL, failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(hashPassword(String(newPassword)), user.id);
    db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(user.id);
    recordAuditLog({ actorUserId: user.id, actorEmail: cleanEmail, action: 'PASSWORD_RESET', entityType: 'user', entityId: user.id, ipAddress: req.ip });
    res.json({ ok: true, message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' });
  });

  router.post('/auth/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const bearerToken = getBearerToken(req);
    const revokeStmt = db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?`);
    if (cookies['im_session']) {
      revokeStmt.run(hashToken(cookies['im_session']));
    }
    if (bearerToken) {
      revokeStmt.run(hashToken(bearerToken));
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    if (!req.authUser) {
      return res.json({ authenticated: false });
    }
    const userRow = db.prepare(`
      SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.two_factor_enabled, u.status, u.created_at,
             p.first_name, p.last_name, p.birth_date, p.address, p.city, p.country, p.profession
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ?
    `).get(req.authUser.id) as Record<string, any>;

    const unreadNotifications = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.authUser.id) as { c: number }).c;

    res.json({
      authenticated: true,
      csrfToken: req.authUser.csrfToken,
      user: {
        ...userRow,
        roleCode: req.authUser.roleCode,
        roleName: req.authUser.roleName,
        permissions: req.authUser.permissions,
        isAdminSession: req.authUser.isAdminSession,
        unreadNotifications,
      },
    });
  });

  // =========================================================
  // SECURITY & SESSIONS MANAGEMENT
  // =========================================================
  router.get('/security/sessions', requireAuth, (req, res) => {
    const sessions = db.prepare(`
      SELECT id, ip_address, user_agent, created_at, expires_at, revoked_at,
             CASE WHEN id = ? THEN 1 ELSE 0 END as is_current
      FROM sessions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 15
    `).all(req.authUser!.sessionId, req.authUser!.id);
    res.json({ sessions });
  });

  router.delete('/security/sessions/:id', requireAuth, (req, res) => {
    db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND user_id = ?`).run(Number(req.params.id), req.authUser!.id);
    res.json({ ok: true });
  });

  router.post('/security/password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as { password_hash: string };
    if (!verifyPassword(String(currentPassword || ''), row.password_hash)) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(newPassword)), req.authUser!.id);
    recordAuditLog({ actorUserId: req.authUser!.id, actorEmail: req.authUser!.email, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: req.authUser!.id, ipAddress: req.ip });
    res.json({ ok: true, message: 'Mot de passe modifié avec succès.' });
  });

  router.post('/security/2fa/toggle', requireAuth, (req, res) => {
    const { enable } = req.body || {};
    const val = enable ? 1 : 0;
    db.prepare('UPDATE users SET two_factor_enabled = ? WHERE id = ?').run(val, req.authUser!.id);
    recordAuditLog({ actorUserId: req.authUser!.id, actorEmail: req.authUser!.email, action: enable ? '2FA_ENABLED' : '2FA_DISABLED', entityType: 'user', entityId: req.authUser!.id, ipAddress: req.ip });
    res.json({ ok: true, twoFactorEnabled: Boolean(val) });
  });

  // =========================================================
  // INVESTOR PROFILE, DASHBOARD & OPERATIONS
  // =========================================================
  router.put('/investor/profile', requireAuth, (req, res) => {
    const { firstName, lastName, birthDate, address, city, country, profession } = req.body || {};
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Le prénom et le nom sont requis.' });
    }
    db.prepare(`
      UPDATE profiles
      SET first_name = ?, last_name = ?, birth_date = ?, address = ?, city = ?, country = ?, profession = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      String(firstName).trim(),
      String(lastName).trim(),
      birthDate || null,
      address || null,
      city || null,
      country || 'Togo',
      profession || null,
      req.authUser!.id
    );
    recordAuditLog({ actorUserId: req.authUser!.id, actorEmail: req.authUser!.email, action: 'PROFILE_UPDATED', entityType: 'profile', entityId: req.authUser!.id });
    res.json({ ok: true });
  });

  router.get('/investor/dashboard', requireAuth, (req, res) => {
    const userId = req.authUser!.id;
    const availableBalance = getUserAccountBalance(userId, 'USER_AVAILABLE');
    const investedBalance = getUserAccountBalance(userId, 'USER_INVESTED');

    const activeCount = (db.prepare(`SELECT COUNT(*) as c FROM investments WHERE user_id = ? AND status = 'active'`).get(userId) as { c: number }).c;
    const maturedCount = (db.prepare(`SELECT COUNT(*) as c FROM investments WHERE user_id = ? AND status = 'matured'`).get(userId) as { c: number }).c;

    const investments = db.prepare(`
      SELECT i.*, p.name as plan_name, p.slug as plan_slug, p.risk_level
      FROM investments i
      JOIN investment_plans p ON p.id = i.plan_id
      WHERE i.user_id = ?
      ORDER BY i.id DESC
    `).all(userId);

    const recentTransactions = db.prepare(`
      SELECT t.*, py.provider_code, py.payment_reference, py.external_reference
      FROM transactions t
      LEFT JOIN payments py ON py.id = t.payment_id
      WHERE t.user_id = ?
      ORDER BY t.id DESC
      LIMIT 10
    `).all(userId);

    const pendingPayments = db.prepare(`
      SELECT * FROM payments WHERE user_id = ? AND status IN ('initiated', 'pending_confirmation') ORDER BY id DESC
    `).all(userId);

    const notifications = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 12
    `).all(userId);

    res.json({
      summary: {
        availableBalance,
        investedBalance,
        activeCount,
        maturedCount,
        currency: 'XOF',
      },
      investments,
      recentTransactions,
      pendingPayments,
      notifications,
    });
  });

  router.get('/investor/investments', requireAuth, (req, res) => {
    const investments = db.prepare(`
      SELECT i.*, p.name as plan_name, p.slug as plan_slug, p.risk_level, p.renewal_rules
      FROM investments i
      JOIN investment_plans p ON p.id = i.plan_id
      WHERE i.user_id = ?
      ORDER BY i.id DESC
    `).all(req.authUser!.id);
    const docs = db.prepare('SELECT id, reference, investment_id, title, doc_type, created_at FROM documents WHERE user_id = ?').all(req.authUser!.id) as Array<Record<string, any>>;
    const enriched = (investments as Array<Record<string, any>>).map((inv) => ({
      ...inv,
      documents: docs.filter((d) => d.investment_id === inv.id),
    }));
    res.json({ investments: enriched });
  });

  router.get('/investor/transactions', requireAuth, (req, res) => {
    const transactions = db.prepare(`
      SELECT t.*, py.provider_code, py.payment_reference, py.external_reference
      FROM transactions t
      LEFT JOIN payments py ON py.id = t.payment_id
      WHERE t.user_id = ?
      ORDER BY t.id DESC
    `).all(req.authUser!.id);

    const payments = db.prepare(`
      SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC
    `).all(req.authUser!.id);

    res.json({ transactions, payments });
  });

  router.get('/investor/notifications', requireAuth, (req, res) => {
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC').all(req.authUser!.id);
    res.json({ notifications });
  });

  router.patch('/investor/notifications/:id/read', requireAuth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.authUser!.id);
    res.json({ ok: true });
  });

  router.post('/investor/notifications/read-all', requireAuth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  router.get('/investor/documents', requireAuth, (req, res) => {
    const documents = db.prepare(`
      SELECT * FROM documents
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY id DESC
    `).all(req.authUser!.id);
    res.json({ documents });
  });

  // =========================================================
  // INVESTMENT CHECKOUT & MULTI-PAYMENT (FLOOZ / TMONEY)
  // =========================================================
  router.post('/investments/checkout', requireAuth, async (req, res) => {
    try {
      const settings = getPlatformSettings();
      if (settings.maintenanceMode) {
        return res.status(503).json({ error: settings.maintenanceMessage || 'La plateforme est actuellement en maintenance programmée.' });
      }
      const userId = req.authUser!.id;

      const { planId, durationId, amount, providerCode, phoneNumber, externalReference, idempotencyKey, acceptedTerms } = req.body || {};
      if (!acceptedTerms) {
        return res.status(400).json({ error: 'Vous devez accepter les conditions contractuelles et l’avertissement sur les risques.' });
      }
      if (!providerCode) {
        return res.status(400).json({ error: 'Veuillez choisir un moyen de paiement.' });
      }
      if ((providerCode === 'flooz' || providerCode === 'tmoney') && !phoneNumber) {
        return res.status(400).json({ error: 'Veuillez saisir votre numéro Mobile Money d’envoi (Flooz / TMoney).' });
      }

      const calc = serverCalculateInvestment(Number(planId), Number(durationId), Number(amount));

      // Check user daily limit & cumulative user limit
      const todayTotal = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as s FROM investments
        WHERE user_id = ? AND plan_id = ? AND status IN ('active', 'pending_payment') AND date(created_at) = date('now')
      `).get(userId, Number(planId)) as { s: number }).s;

      if (todayTotal + calc.amount > calc.plan.dailyLimit) {
        return res.status(400).json({ error: `Limite quotidienne dépassée pour cette offre (${Number(calc.plan.dailyLimit).toLocaleString('fr-FR')} FCFA / jour).` });
      }

      const userActiveTotal = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as s FROM investments
        WHERE user_id = ? AND plan_id = ? AND status IN ('active', 'pending_payment')
      `).get(userId, Number(planId)) as { s: number }).s;

      if (userActiveTotal + calc.amount > calc.plan.userLimit) {
        return res.status(400).json({ error: `Plafond maximal par investisseur dépassé (${Number(calc.plan.userLimit).toLocaleString('fr-FR')} FCFA).` });
      }

      const idemKey = String(idempotencyKey || generateToken(16));

      // Check idempotency if order already exists for this key
      const existingPay = db.prepare('SELECT p.*, i.reference as investment_reference FROM payments p LEFT JOIN investments i ON i.id = p.investment_id WHERE p.idempotency_key = ?').get(idemKey) as Record<string, any> | undefined;
      if (existingPay) {
        return res.json({
          orderReference: existingPay.investment_reference,
          payment: existingPay,
          idempotentReplay: true,
        });
      }

      const planRow = db.prepare('SELECT version, potential_rate_min, potential_rate_max FROM investment_plans WHERE id = ?').get(Number(planId)) as {
        version: number;
        potential_rate_min: number | null;
        potential_rate_max: number | null;
      };

      const invSeq = getNextSeq('investments');
      const orderRef = formatRef('INV', invSeq);

      const invRes = db.prepare(`
        INSERT INTO investments (
          reference, user_id, plan_id, plan_version, duration_id, duration_label, duration_days,
          amount, fee_amount, total_paid, potential_rate_min, potential_rate_max,
          status, exit_rules_snapshot, conditions_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)
      `).run(
        orderRef,
        userId,
        calc.plan.id,
        planRow.version,
        calc.duration.id,
        calc.duration.label,
        calc.duration.days,
        calc.amount,
        calc.feeAmount,
        calc.totalAmount,
        planRow.potential_rate_min,
        planRow.potential_rate_max,
        calc.plan.exitRules,
        calc.plan.conditionsText
      );

      const investmentId = Number(invRes.lastInsertRowid);

      const payResult = await paymentService.initiatePayment({
        userId,
        investmentId,
        providerCode: String(providerCode),
        phoneNumber: phoneNumber ? String(phoneNumber).trim() : undefined,
        externalReference: externalReference ? String(externalReference).trim() : undefined,
        amount: calc.amount,
        feeAmount: calc.feeAmount,
        totalAmount: calc.totalAmount,
        idempotencyKey: idemKey,
        purpose: 'investment',
      });

      res.status(201).json({
        orderReference: orderRef,
        investmentId,
        calculation: calc,
        ...payResult,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Impossible d’initier la souscription.' });
    }
  });

  // Direct wallet deposit onto TMoney 93736916 / Flooz 97172729
  router.post('/investor/deposits', requireAuth, async (req, res) => {
    try {
      const settings = getPlatformSettings();
      if (settings.maintenanceMode) {
        return res.status(503).json({ error: settings.maintenanceMessage || 'La plateforme est actuellement en maintenance programmée.' });
      }
      const userId = req.authUser!.id;
      const { amount, providerCode, phoneNumber, externalReference, idempotencyKey } = req.body || {};
      const numAmount = Math.round(Number(amount));
      if (!Number.isFinite(numAmount) || numAmount < 1000) {
        return res.status(400).json({ error: 'Le montant minimum d’un dépôt est de 1 000 FCFA.' });
      }
      if (!providerCode) {
        return res.status(400).json({ error: 'Veuillez sélectionner Flooz ou TMoney.' });
      }
      if ((providerCode === 'flooz' || providerCode === 'tmoney') && !phoneNumber) {
        return res.status(400).json({ error: 'Veuillez indiquer votre numéro d’envoi.' });
      }

      const payResult = await paymentService.initiatePayment({
        userId,
        investmentId: null,
        providerCode: String(providerCode),
        phoneNumber: phoneNumber ? String(phoneNumber).trim() : undefined,
        externalReference: externalReference ? String(externalReference).trim() : undefined,
        amount: numAmount,
        feeAmount: 0,
        totalAmount: numAmount,
        idempotencyKey: String(idempotencyKey || generateToken(16)),
        purpose: 'deposit',
      });

      res.status(201).json({ ok: true, ...payResult });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Impossible d’enregistrer le dépôt.' });
    }
  });

  router.post('/payments/:reference/submit-proof', requireAuth, (req, res) => {
    try {
      const { externalReference, phoneNumber } = req.body || {};
      if (!externalReference || !String(externalReference).trim()) {
        return res.status(400).json({ error: 'Veuillez saisir la référence SMS ou ID de transaction du transfert.' });
      }
      const updated = paymentService.submitTransferProof({
        userId: req.authUser!.id,
        paymentReference: req.params.reference,
        externalReference: String(externalReference),
        phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
      });
      res.json({ ok: true, payment: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/payments/:reference/status', requireAuth, (req, res) => {
    const payment = db.prepare(`
      SELECT p.*, i.reference as investment_reference, i.status as investment_status,
             pp.receiving_account, pp.receiving_name
      FROM payments p
      LEFT JOIN investments i ON i.id = p.investment_id
      LEFT JOIN payment_providers pp ON pp.code = p.provider_code
      WHERE p.payment_reference = ? AND p.user_id = ?
    `).get(req.params.reference, req.authUser!.id);
    if (!payment) return res.status(404).json({ error: 'Transaction introuvable.' });
    res.json({ payment });
  });

  // =========================================================
  // WITHDRAWALS (RETRAITS SÉCURISÉS)
  // =========================================================
  router.get('/investor/withdrawals', requireAuth, (req, res) => {
    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC').all(req.authUser!.id);
    const availableBalance = getUserAccountBalance(req.authUser!.id, 'USER_AVAILABLE');
    res.json({ withdrawals, availableBalance });
  });

  router.post('/investor/withdrawals', requireAuth, (req, res) => {
    try {
      const userId = req.authUser!.id;

      const { amount, method, beneficiaryAccount, beneficiaryName } = req.body || {};
      const numAmount = Math.round(Number(amount));
      if (!Number.isFinite(numAmount) || numAmount < 5000) {
        return res.status(400).json({ error: 'Le montant minimum de retrait est de 5 000 FCFA.' });
      }
      if (!method || !beneficiaryAccount || !beneficiaryName) {
        return res.status(400).json({ error: 'Veuillez renseigner la méthode et le compte bénéficiaire.' });
      }

      const availableBalance = getUserAccountBalance(userId, 'USER_AVAILABLE');
      const pendingSum = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as s FROM withdrawals WHERE user_id = ? AND status IN ('demande', 'en_verification', 'approuve', 'en_traitement')`).get(userId) as { s: number }).s;

      if (numAmount + pendingSum > availableBalance) {
        return res.status(400).json({ error: `Solde disponible insuffisant (${(availableBalance - pendingSum).toLocaleString('fr-FR')} FCFA disponibles hors demandes en cours).` });
      }

      const feeAmount = Math.round(numAmount * 0.005); // 0.5% withdrawal processing fee
      const netAmount = numAmount - feeAmount;
      const seq = getNextSeq('withdrawals');
      const ref = formatRef('RET', seq);

      // Basic anti-fraud flag check
      const fraudStatus = numAmount >= 5000000 ? 'manual_review_high_amount' : 'clean';

      db.prepare(`
        INSERT INTO withdrawals (reference, user_id, amount, fee_amount, net_amount, method, beneficiary_account, beneficiary_name, status, fraud_check_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'demande', ?)
      `).run(ref, userId, numAmount, feeAmount, netAmount, method, beneficiaryAccount, beneficiaryName, fraudStatus);

      createNotification({
        userId,
        title: 'Demande de retrait enregistrée',
        message: `Votre demande de retrait ${ref} de ${numAmount.toLocaleString('fr-FR')} FCFA vers ${beneficiaryAccount} est en cours d’examen.`,
        category: 'withdrawal',
        actionUrl: '/dashboard/retraits',
      });

      recordAuditLog({
        actorUserId: userId,
        actorEmail: req.authUser!.email,
        action: 'WITHDRAWAL_REQUESTED',
        entityType: 'withdrawal',
        entityId: ref,
        details: { amount: numAmount, method, fraudStatus },
        ipAddress: req.ip,
      });

      res.status(201).json({ ok: true, reference: ref });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // =========================================================
  // ISOLATED ADMIN AUTHENTICATION & SECURITY
  // =========================================================
  router.post('/admin/auth/login', rateLimit(15, 60_000), (req, res) => {
    const { identifier, password, pin } = req.body || {};
    if (!identifier || !password || !pin) {
      return res.status(400).json({ error: 'Identifiant, mot de passe et code PIN administrateur requis.' });
    }
    const cleanId = String(identifier).trim().toLowerCase();
    const phoneCandidates = buildPhoneCandidates(String(identifier));
    const phonePlaceholders = phoneCandidates.map(() => '?').join(', ');

    const user = db.prepare(`
      SELECT u.*, r.code as role_code, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE lower(u.email) = ? ${phonePlaceholders ? `OR u.phone IN (${phonePlaceholders})` : ''}
    `).get(cleanId, ...phoneCandidates) as Record<string, any> | undefined;

    const settings = getPlatformSettings();
    const maxAttempts = Math.max(3, Number(settings.maxLoginAttempts || 5));

    if (!user || user.role_code === 'user') {
      recordAuditLog({
        actorEmail: cleanId,
        action: 'ADMIN_LOGIN_DENIED_UNKNOWN',
        entityType: 'admin_session',
        entityId: cleanId,
        result: 'échec',
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Identifiants administrateur invalides.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Ce compte administrateur est suspendu.' });
    }

    const lockedUntilMs = parseSqliteUtcMs(user.locked_until);
    if (!Number.isNaN(lockedUntilMs) && lockedUntilMs > Date.now()) {
      return res.status(423).json({ error: 'Compte administrateur temporairement verrouillé après plusieurs échecs.' });
    }

    const adminRow = db.prepare('SELECT * FROM admin_users WHERE user_id = ? AND is_active = 1').get(user.id) as Record<string, any> | undefined;
    if (!adminRow) {
      return res.status(403).json({ error: 'Profil administrateur inactif ou non autorisé.' });
    }

    const pwdOk = verifyPassword(String(password), user.password_hash);
    const pinOk = Boolean(adminRow.pin_hash && verifyPassword(String(pin), adminRow.pin_hash));

    if (!pwdOk || !pinOk) {
      const nextAttempts = Number(user.failed_login_attempts) + 1;
      if (nextAttempts >= maxAttempts) {
        db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = datetime('now', '+15 minutes') WHERE id = ?`).run(nextAttempts, user.id);
      } else {
        db.prepare(`UPDATE users SET failed_login_attempts = ? WHERE id = ?`).run(nextAttempts, user.id);
      }
      recordAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role_code,
        action: !pwdOk ? 'ADMIN_LOGIN_BAD_PASSWORD' : 'ADMIN_LOGIN_BAD_PIN',
        entityType: 'admin_session',
        entityId: user.id,
        details: { attempts: nextAttempts },
        result: 'échec',
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Identifiant, mot de passe ou code PIN administrateur incorrect.' });
    }

    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    const currentIp = req.ip || 'unknown';
    const isUnusualLogin = Boolean(adminRow.last_login_ip && adminRow.last_login_ip !== currentIp);
    if (isUnusualLogin) {
      createNotification({
        userId: user.id,
        title: 'Connexion administrateur inhabituelle détectée',
        message: `Une connexion au module Administration a été initiée depuis une nouvelle adresse IP (${currentIp}).`,
        category: 'security',
        actionUrl: '/admin',
      });
      recordAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role_code,
        action: 'SECURITY_ADMIN_UNUSUAL_LOGIN',
        entityType: 'admin_session',
        entityId: user.id,
        details: { previousIp: adminRow.last_login_ip, newIp: currentIp },
        result: 'succès',
        ipAddress: currentIp,
      });
    }

    if (user.two_factor_enabled === 1) {
      const code = generateNumericCode(6);
      db.prepare(`UPDATE users SET two_factor_code = ?, two_factor_expires_at = datetime('now', '+10 minutes') WHERE id = ?`).run(code, user.id);
      return res.json({
        requires2FA: true,
        userId: user.id,
        sandbox2FACode: code,
        message: 'Veuillez saisir le code 2FA administrateur.',
      });
    }

    const rawToken = generateToken(32);
    const csrfToken = generateToken(24);
    db.prepare(`
      INSERT INTO sessions (user_id, token_hash, csrf_token, ip_address, user_agent, is_admin_session, last_activity_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now', '+12 hours'))
    `).run(user.id, hashToken(rawToken), csrfToken, currentIp, req.headers['user-agent'] || '');

    db.prepare(`UPDATE admin_users SET last_login_at = datetime('now'), last_login_ip = ? WHERE user_id = ?`).run(currentIp, user.id);

    recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role_code,
      action: 'ADMIN_LOGIN_SUCCESS',
      entityType: 'admin_session',
      entityId: user.id,
      details: { unusualIp: isUnusualLogin },
      result: 'succès',
      ipAddress: currentIp,
    });

    createSessionCookie(req, res, rawToken);
    res.json({ ok: true, role: user.role_code, sessionToken: rawToken, csrfToken });
  });

  router.post('/admin/auth/verify-2fa', rateLimit(15, 60_000), (req, res) => {
    const { userId, code } = req.body || {};
    const user = db.prepare(`
      SELECT u.*, r.code as role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?
    `).get(Number(userId)) as Record<string, any> | undefined;

    if (!user || user.role_code === 'user' || !user.two_factor_code || user.two_factor_code !== String(code || '').trim()) {
      return res.status(400).json({ error: 'Code 2FA administrateur invalide.' });
    }
    const adminTwoFaExpMs = parseSqliteUtcMs(user.two_factor_expires_at);
    if (!Number.isNaN(adminTwoFaExpMs) && adminTwoFaExpMs < Date.now()) {
      return res.status(400).json({ error: 'Code 2FA expiré.' });
    }

    const currentIp = req.ip || 'unknown';
    db.prepare('UPDATE users SET two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?').run(user.id);
    const rawToken = generateToken(32);
    const csrfToken = generateToken(24);
    db.prepare(`
      INSERT INTO sessions (user_id, token_hash, csrf_token, ip_address, user_agent, is_admin_session, last_activity_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now', '+12 hours'))
    `).run(user.id, hashToken(rawToken), csrfToken, currentIp, req.headers['user-agent'] || '');

    db.prepare(`UPDATE admin_users SET last_login_at = datetime('now'), last_login_ip = ? WHERE user_id = ?`).run(currentIp, user.id);

    recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role_code,
      action: 'ADMIN_LOGIN_2FA_SUCCESS',
      entityType: 'admin_session',
      entityId: user.id,
      result: 'succès',
      ipAddress: currentIp,
    });

    createSessionCookie(req, res, rawToken);
    res.json({ ok: true, role: user.role_code, sessionToken: rawToken, csrfToken });
  });

  // Strict isolation middleware for all remaining /api/admin/* endpoints
  router.use('/admin', (req, res, next) => {
    requireAuth(req, res, () => requireAdminSession(req, res, next));
  });

  // Personal admin PIN management
  router.post('/admin/security/pin', (req, res) => {
    const { currentPin, newPin } = req.body || {};
    if (!newPin || !/^\d{4,8}$/.test(String(newPin).trim())) {
      return res.status(400).json({ error: 'Le nouveau PIN administrateur doit contenir entre 4 et 8 chiffres.' });
    }
    const adminRow = db.prepare('SELECT pin_hash FROM admin_users WHERE user_id = ?').get(req.authUser!.id) as { pin_hash: string | null } | undefined;
    if (!adminRow) return res.status(404).json({ error: 'Profil administrateur introuvable.' });
    if (adminRow.pin_hash && !verifyPassword(String(currentPin || ''), adminRow.pin_hash)) {
      recordAuditLog({
        actorUserId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        actorRole: req.authUser!.roleCode,
        action: 'ADMIN_PIN_CHANGE_FAILED',
        entityType: 'admin_security',
        entityId: req.authUser!.id,
        result: 'échec',
        ipAddress: req.ip,
      });
      return res.status(403).json({ error: 'Code PIN actuel incorrect.' });
    }
    db.prepare('UPDATE admin_users SET pin_hash = ? WHERE user_id = ?').run(hashPassword(String(newPin).trim()), req.authUser!.id);
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'ADMIN_PIN_UPDATED',
      entityType: 'admin_security',
      entityId: req.authUser!.id,
      result: 'succès',
      ipAddress: req.ip,
    });
    res.json({ ok: true, message: 'Votre code PIN personnel a été mis à jour.' });
  });

  // =========================================================
  // ADMIN BACK-OFFICE ROUTES (RBAC + ISOLATED SESSION)
  // =========================================================
  router.get('/admin/overview', requirePermission('admin:dashboard'), (_req, res) => {
    const usersCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const activeInvestments = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total FROM investments WHERE status = 'active'`).get() as { c: number; total: number };
    const maturingSoonCount = (db.prepare(`SELECT COUNT(*) as c FROM investments WHERE status = 'active' AND end_date IS NOT NULL AND datetime(end_date) <= datetime('now', '+30 days')`).get() as { c: number }).c;
    const maturedInvestments = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total FROM investments WHERE status = 'matured'`).get() as { c: number; total: number };
    const confirmedDeposits = (db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as s FROM payments WHERE status = 'confirmed'`).get() as { s: number }).s;
    const withdrawalsTotal = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as s FROM withdrawals WHERE status = 'termine'`).get() as { s: number }).s;
    const pendingPaymentsCount = (db.prepare(`SELECT COUNT(*) as c FROM payments WHERE status IN ('initiated', 'pending_confirmation')`).get() as { c: number }).c;
    const pendingWithdrawalsCount = (db.prepare(`SELECT COUNT(*) as c FROM withdrawals WHERE status IN ('demande', 'en_verification', 'approuve', 'en_traitement')`).get() as { c: number }).c;
    const floozAgg = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(total_amount), 0) as total FROM payments WHERE provider_code = 'flooz' AND status = 'confirmed'`).get() as { c: number; total: number };
    const tmoneyAgg = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(total_amount), 0) as total FROM payments WHERE provider_code = 'tmoney' AND status = 'confirmed'`).get() as { c: number; total: number };
    const activeOffersCount = (db.prepare(`SELECT COUNT(*) as c FROM investment_plans WHERE status = 'active'`).get() as { c: number }).c;
    const expiredOffersCount = (db.prepare(`SELECT COUNT(*) as c FROM investment_plans WHERE status IN ('inactive', 'expired', 'expiree', 'suspendue')`).get() as { c: number }).c;
    const investmentVolume = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as s FROM investments WHERE status IN ('active', 'matured')`).get() as { s: number }).s;
    const platformFeesTotal = getPlatformFeeTotal();

    const recentAlerts = db.prepare(`
      SELECT * FROM audit_logs
      WHERE action LIKE 'SECURITY_%' OR action LIKE 'ADMIN_LOGIN_%' OR result = 'échec'
      ORDER BY id DESC LIMIT 12
    `).all();

    const recentActivities = db.prepare(`
      SELECT * FROM audit_logs ORDER BY id DESC LIMIT 15
    `).all();

    res.json({
      stats: {
        usersCount,
        activeInvestmentsCount: activeInvestments.c,
        activeInvestmentsTotal: activeInvestments.total,
        maturingSoonCount,
        maturedInvestmentsCount: maturedInvestments.c,
        confirmedDeposits,
        withdrawalsTotal,
        pendingTransactionsCount: pendingPaymentsCount + pendingWithdrawalsCount,
        pendingPaymentsCount,
        pendingWithdrawalsCount,
        floozPaymentsCount: floozAgg.c,
        floozTotal: floozAgg.total,
        tmoneyPaymentsCount: tmoneyAgg.c,
        tmoneyTotal: tmoneyAgg.total,
        activeOffersCount,
        expiredOffersCount,
        investmentVolume,
        platformFeesTotal,
      },
      recentAlerts,
      recentActivities,
    });
  });

  // Plans management (Admin)
  router.get('/admin/plans', requirePermission('admin:dashboard'), (_req, res) => {
    const plans = db.prepare(`
      SELECT ip.*, uc.email as created_by_email, uu.email as updated_by_email
      FROM investment_plans ip
      LEFT JOIN users uc ON uc.id = ip.created_by
      LEFT JOIN users uu ON uu.id = ip.updated_by
      ORDER BY ip.id DESC
    `).all() as Array<Record<string, any>>;
    const durStmt = db.prepare('SELECT * FROM investment_plan_durations WHERE plan_id = ? ORDER BY days ASC');
    const verStmt = db.prepare(`
      SELECT v.id, v.version, v.change_reason, v.created_at, u.email as changed_by_email
      FROM investment_plan_versions v
      LEFT JOIN users u ON u.id = v.changed_by
      WHERE v.plan_id = ? ORDER BY v.version DESC
    `);
    const docStmt = db.prepare('SELECT id, reference, title, doc_type, content_json, created_at FROM documents WHERE plan_id = ? AND user_id IS NULL ORDER BY id DESC');
    res.json({
      plans: plans.map((p) => ({
        ...p,
        durations: durStmt.all(p.id),
        versions: verStmt.all(p.id),
        documents: docStmt.all(p.id),
      })),
    });
  });

  router.post('/admin/plans', requirePermission('offers:manage'), (req, res) => {
    try {
      const b = req.body || {};
      if (!b.name || b.min_amount === undefined || b.max_amount === undefined) {
        return res.status(400).json({ error: 'Le nom et les montants minimum/maximum sont requis pour créer l’offre.' });
      }
      const generatedCode = b.code ? String(b.code).trim() : `IM-${Date.now().toString().slice(-6)}`;
      const generatedSlug = b.slug
        ? String(b.slug).trim()
        : `${String(b.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-4)}`;

      const createPlan = db.transaction(() => {
        const resPlan = db.prepare(`
          INSERT INTO investment_plans (
            code, name, slug, category, summary, description, objective,
            min_amount, max_amount, step_amount, daily_limit, user_limit,
            fee_percent, fee_fixed, risk_level, status, visibility, scheduled_start_at, expires_at,
            available_cap, potential_rate_min, potential_rate_max, rate_disclaimer,
            conditions_text, exit_rules, renewal_rules, version, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          generatedCode,
          String(b.name).trim(),
          generatedSlug,
          b.category || 'Structuré',
          b.summary || String(b.description || '').slice(0, 140),
          b.description || '',
          b.objective || '',
          Number(b.min_amount),
          Number(b.max_amount),
          Number(b.step_amount || 5000),
          Number(b.daily_limit || 10000000),
          Number(b.user_limit || 25000000),
          Number(b.fee_percent || 0),
          Number(b.fee_fixed || 0),
          b.risk_level || 'Modéré',
          b.status || 'active',
          b.visibility || 'public',
          b.scheduled_start_at || null,
          b.expires_at || null,
          Number(b.available_cap || 100000000),
          b.potential_rate_min !== undefined && b.potential_rate_min !== '' && b.potential_rate_min !== null ? Number(b.potential_rate_min) : null,
          b.potential_rate_max !== undefined && b.potential_rate_max !== '' && b.potential_rate_max !== null ? Number(b.potential_rate_max) : null,
          b.rate_disclaimer || 'Performance potentielle non garantie. Tout investissement comporte un risque de perte en capital.',
          b.conditions_text || '',
          b.exit_rules || 'Sortie selon les conditions contractuelles à l’échéance.',
          b.renewal_rules || 'Sur instruction explicite à l’échéance.',
          req.authUser!.id,
          req.authUser!.id
        );
        const planId = Number(resPlan.lastInsertRowid);

        const durations = Array.isArray(b.durations) && b.durations.length > 0
          ? b.durations
          : [{ label: '6 mois (180 jours)', duration_type: 'moyen', days: 180, weeks: 26, months: 6 }];
        for (const d of durations) {
          db.prepare(`
            INSERT INTO investment_plan_durations (plan_id, label, duration_type, days, weeks, months, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `).run(planId, d.label, d.duration_type || 'moyen', Number(d.days), Number(d.weeks || 0), Number(d.months || 0));
        }

        db.prepare(`
          INSERT INTO investment_plan_versions (plan_id, version, snapshot_json, changed_by, change_reason)
          VALUES (?, 1, ?, ?, 'Création de l’offre depuis le back-office')
        `).run(planId, JSON.stringify({ ...b, code: generatedCode, slug: generatedSlug }), req.authUser!.id);

        recordAuditLog({
          actorUserId: req.authUser!.id,
          actorEmail: req.authUser!.email,
          actorRole: req.authUser!.roleCode,
          action: 'PLAN_CREATED',
          entityType: 'investment_plan',
          entityId: planId,
          oldValue: null,
          newValue: { code: generatedCode, name: b.name, status: b.status || 'active', min_amount: b.min_amount, max_amount: b.max_amount },
          result: 'succès',
          ipAddress: req.ip,
        });

        return planId;
      });

      const id = createPlan();
      res.status(201).json({ ok: true, id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/admin/plans/:id', requirePermission('offers:manage'), (req, res) => {
    try {
      const planId = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM investment_plans WHERE id = ?').get(planId) as Record<string, any> | undefined;
      if (!existing) return res.status(404).json({ error: 'Offre introuvable.' });

      const b = req.body || {};
      if (existing.status === 'active') {
        assertAdminPin(req, b.adminPin);
      }
      const nextVersion = Number(existing.version) + 1;

      db.transaction(() => {
        db.prepare(`
          UPDATE investment_plans
          SET name = ?, category = ?, summary = ?, description = ?, objective = ?,
              min_amount = ?, max_amount = ?, step_amount = ?, daily_limit = ?, user_limit = ?,
              fee_percent = ?, fee_fixed = ?, risk_level = ?, status = ?, visibility = ?,
              scheduled_start_at = ?, expires_at = ?, available_cap = ?, potential_rate_min = ?, potential_rate_max = ?,
              rate_disclaimer = ?, conditions_text = ?, exit_rules = ?, renewal_rules = ?,
              version = ?, updated_by = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          b.name ?? existing.name,
          b.category ?? existing.category,
          b.summary ?? existing.summary,
          b.description ?? existing.description,
          b.objective ?? existing.objective,
          b.min_amount !== undefined ? Number(b.min_amount) : existing.min_amount,
          b.max_amount !== undefined ? Number(b.max_amount) : existing.max_amount,
          b.step_amount !== undefined ? Number(b.step_amount) : existing.step_amount,
          b.daily_limit !== undefined ? Number(b.daily_limit) : existing.daily_limit,
          b.user_limit !== undefined ? Number(b.user_limit) : existing.user_limit,
          b.fee_percent !== undefined ? Number(b.fee_percent) : existing.fee_percent,
          b.fee_fixed !== undefined ? Number(b.fee_fixed) : existing.fee_fixed,
          b.risk_level ?? existing.risk_level,
          b.status ?? existing.status,
          b.visibility ?? existing.visibility,
          b.scheduled_start_at !== undefined ? b.scheduled_start_at || null : existing.scheduled_start_at,
          b.expires_at !== undefined ? b.expires_at || null : existing.expires_at,
          b.available_cap !== undefined ? Number(b.available_cap) : existing.available_cap,
          b.potential_rate_min !== undefined ? (b.potential_rate_min === '' || b.potential_rate_min === null ? null : Number(b.potential_rate_min)) : existing.potential_rate_min,
          b.potential_rate_max !== undefined ? (b.potential_rate_max === '' || b.potential_rate_max === null ? null : Number(b.potential_rate_max)) : existing.potential_rate_max,
          b.rate_disclaimer ?? existing.rate_disclaimer,
          b.conditions_text ?? existing.conditions_text,
          b.exit_rules ?? existing.exit_rules,
          b.renewal_rules ?? existing.renewal_rules,
          nextVersion,
          req.authUser!.id,
          planId
        );

        if (Array.isArray(b.durations) && b.durations.length > 0) {
          db.prepare('UPDATE investment_plan_durations SET is_active = 0 WHERE plan_id = ?').run(planId);
          for (const d of b.durations) {
            if (d.id) {
              db.prepare(`
                UPDATE investment_plan_durations SET label = ?, duration_type = ?, days = ?, weeks = ?, months = ?, is_active = 1
                WHERE id = ? AND plan_id = ?
              `).run(d.label, d.duration_type || 'moyen', Number(d.days), Number(d.weeks || 0), Number(d.months || 0), Number(d.id), planId);
            } else {
              db.prepare(`
                INSERT INTO investment_plan_durations (plan_id, label, duration_type, days, weeks, months, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
              `).run(planId, d.label, d.duration_type || 'moyen', Number(d.days), Number(d.weeks || 0), Number(d.months || 0));
            }
          }
        }

        const updated = db.prepare('SELECT * FROM investment_plans WHERE id = ?').get(planId) as Record<string, any>;
        db.prepare(`
          INSERT INTO investment_plan_versions (plan_id, version, snapshot_json, changed_by, change_reason)
          VALUES (?, ?, ?, ?, ?)
        `).run(planId, nextVersion, JSON.stringify(updated), req.authUser!.id, b.change_reason || `Version ${nextVersion} (non rétroactive)`);

        recordAuditLog({
          actorUserId: req.authUser!.id,
          actorEmail: req.authUser!.email,
          actorRole: req.authUser!.roleCode,
          action: 'PLAN_VERSIONED',
          entityType: 'investment_plan',
          entityId: planId,
          oldValue: {
            version: existing.version,
            name: existing.name,
            min_amount: existing.min_amount,
            max_amount: existing.max_amount,
            fee_percent: existing.fee_percent,
            status: existing.status,
            visibility: existing.visibility,
          },
          newValue: {
            version: nextVersion,
            name: updated.name,
            min_amount: updated.min_amount,
            max_amount: updated.max_amount,
            fee_percent: updated.fee_percent,
            status: updated.status,
            visibility: updated.visibility,
          },
          details: { reason: b.change_reason || 'Mise à jour non rétroactive' },
          result: 'succès',
          ipAddress: req.ip,
        });
      })();

      res.json({ ok: true, version: nextVersion });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/admin/plans/:id/documents', requirePermission('offers:manage'), (req, res) => {
    const planId = Number(req.params.id);
    const { title, docType, summary } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Titre du document requis.' });
    const ref = `DOC-OFF-${planId}-${Date.now().toString().slice(-5)}`;
    db.prepare(`
      INSERT INTO documents (reference, user_id, investment_id, plan_id, title, doc_type, content_json)
      VALUES (?, NULL, NULL, ?, ?, ?, ?)
    `).run(ref, planId, String(title).trim(), docType || 'notice', JSON.stringify({ summary: summary || '', addedBy: req.authUser!.email }));
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'PLAN_DOCUMENT_ADDED',
      entityType: 'investment_plan',
      entityId: planId,
      newValue: { reference: ref, title },
      result: 'succès',
      ipAddress: req.ip,
    });
    res.status(201).json({ ok: true, reference: ref });
  });

  router.delete('/admin/plans/:id/documents/:docId', requirePermission('offers:manage'), (req, res) => {
    const planId = Number(req.params.id);
    const docId = Number(req.params.docId);
    const doc = db.prepare('SELECT title, reference FROM documents WHERE id = ? AND plan_id = ? AND user_id IS NULL').get(docId, planId) as Record<string, any> | undefined;
    if (!doc) return res.status(404).json({ error: 'Document introuvable.' });
    db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'PLAN_DOCUMENT_REMOVED',
      entityType: 'investment_plan',
      entityId: planId,
      oldValue: doc,
      result: 'succès',
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  // Transactions & Payments reconciliation (Admin / Finance)
  router.get('/admin/transactions', requirePermission('admin:dashboard'), (req, res) => {
    const { provider, status, q, dateFrom, dateTo, minAmount, maxAmount, planId, txType } = req.query;

    let paySql = `
      SELECT p.*, u.email as user_email, pr.first_name, pr.last_name,
             i.reference as investment_reference, i.plan_id, pl.name as plan_name,
             pp.receiving_account
      FROM payments p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN profiles pr ON pr.user_id = p.user_id
      LEFT JOIN investments i ON i.id = p.investment_id
      LEFT JOIN investment_plans pl ON pl.id = i.plan_id
      LEFT JOIN payment_providers pp ON pp.code = p.provider_code
      WHERE 1=1
    `;
    const payParams: any[] = [];
    if (provider && provider !== 'all') {
      paySql += ' AND p.provider_code = ?';
      payParams.push(String(provider));
    }
    if (status && status !== 'all') {
      paySql += ' AND p.status = ?';
      payParams.push(String(status));
    }
    if (planId && planId !== 'all') {
      paySql += ' AND i.plan_id = ?';
      payParams.push(Number(planId));
    }
    if (dateFrom) {
      paySql += ' AND date(p.created_at) >= date(?)';
      payParams.push(String(dateFrom));
    }
    if (dateTo) {
      paySql += ' AND date(p.created_at) <= date(?)';
      payParams.push(String(dateTo));
    }
    if (minAmount) {
      paySql += ' AND p.total_amount >= ?';
      payParams.push(Number(minAmount));
    }
    if (maxAmount) {
      paySql += ' AND p.total_amount <= ?';
      payParams.push(Number(maxAmount));
    }
    if (q) {
      paySql += ' AND (p.payment_reference LIKE ? OR p.external_reference LIKE ? OR u.email LIKE ? OR i.reference LIKE ? OR p.phone_number LIKE ?)';
      const like = `%${String(q)}%`;
      payParams.push(like, like, like, like, like);
    }
    paySql += ' ORDER BY p.id DESC LIMIT 200';
    const payments = db.prepare(paySql).all(...payParams);

    let txSql = `
      SELECT t.*, u.email as user_email, pr.first_name, pr.last_name,
             py.provider_code, py.payment_reference, py.external_reference,
             i.reference as investment_reference, pl.name as plan_name
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN profiles pr ON pr.user_id = t.user_id
      LEFT JOIN payments py ON py.id = t.payment_id
      LEFT JOIN investments i ON i.id = t.investment_id
      LEFT JOIN investment_plans pl ON pl.id = i.plan_id
      WHERE 1=1
    `;
    const txParams: any[] = [];
    if (provider && provider !== 'all') {
      txSql += ' AND py.provider_code = ?';
      txParams.push(String(provider));
    }
    if (txType && txType !== 'all') {
      txSql += ' AND t.type = ?';
      txParams.push(String(txType));
    }
    if (planId && planId !== 'all') {
      txSql += ' AND i.plan_id = ?';
      txParams.push(Number(planId));
    }
    if (dateFrom) {
      txSql += ' AND date(t.created_at) >= date(?)';
      txParams.push(String(dateFrom));
    }
    if (dateTo) {
      txSql += ' AND date(t.created_at) <= date(?)';
      txParams.push(String(dateTo));
    }
    if (minAmount) {
      txSql += ' AND t.amount >= ?';
      txParams.push(Number(minAmount));
    }
    if (maxAmount) {
      txSql += ' AND t.amount <= ?';
      txParams.push(Number(maxAmount));
    }
    if (q) {
      txSql += ' AND (t.reference LIKE ? OR py.payment_reference LIKE ? OR py.external_reference LIKE ? OR u.email LIKE ? OR t.description LIKE ?)';
      const like = `%${String(q)}%`;
      txParams.push(like, like, like, like, like);
    }
    txSql += ' ORDER BY t.id DESC LIMIT 200';
    const transactions = db.prepare(txSql).all(...txParams);

    res.json({ payments, transactions });
  });

  router.post('/admin/payments/:reference/reconcile', requirePermission('transactions:reconcile'), (req, res) => {
    try {
      const { status, externalReference, failureReason } = req.body || {};
      const payment = db.prepare('SELECT provider_code, external_reference, status FROM payments WHERE payment_reference = ?').get(req.params.reference) as {
        provider_code: string;
        external_reference: string | null;
        status: string;
      } | undefined;
      if (!payment) return res.status(404).json({ error: 'Paiement introuvable.' });

      const result = paymentService.processProviderConfirmation({
        providerCode: payment.provider_code,
        paymentReference: req.params.reference,
        externalReference: externalReference || payment.external_reference || `REC-${Date.now()}`,
        status: status === 'confirmed' ? 'confirmed' : 'failed',
        failureReason,
        rawBody: JSON.stringify({ reconciledBy: req.authUser!.email, status, externalReference: externalReference || payment.external_reference }),
        adminActor: {
          id: req.authUser!.id,
          email: req.authUser!.email,
          role: req.authUser!.roleCode,
        },
      });
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Payment providers receiving numbers config (Admin - PIN required)
  router.get('/admin/payment-providers', requirePermission('admin:dashboard'), (_req, res) => {
    const providers = db.prepare('SELECT id, code, name, country, currency, is_active, fee_percent, receiving_account, receiving_name, instructions, config_status, sort_order FROM payment_providers ORDER BY sort_order ASC').all();
    res.json({ providers });
  });

  router.put('/admin/payment-providers/:code', requirePermission('admin:dashboard'), (req, res) => {
    try {
      if (!['super_admin', 'finance'].includes(req.authUser!.roleCode)) {
        return res.status(403).json({ error: 'Rôle Super Admin ou Finance requis pour modifier un compte de réception.' });
      }
      const { receiving_account, receiving_name, instructions, is_active, fee_percent, adminPin } = req.body || {};
      assertAdminPin(req, adminPin);

      const existing = db.prepare('SELECT receiving_account, receiving_name, is_active, fee_percent FROM payment_providers WHERE code = ?').get(req.params.code) as Record<string, any> | undefined;
      if (!existing) return res.status(404).json({ error: 'Prestataire introuvable.' });

      db.prepare(`
        UPDATE payment_providers
        SET receiving_account = ?, receiving_name = ?, instructions = ?, is_active = ?, fee_percent = ?
        WHERE code = ?
      `).run(
        receiving_account || '',
        receiving_name || '',
        instructions || '',
        is_active ? 1 : 0,
        fee_percent !== undefined ? Number(fee_percent) : existing.fee_percent,
        req.params.code
      );

      recordAuditLog({
        actorUserId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        actorRole: req.authUser!.roleCode,
        action: 'PAYMENT_PROVIDER_UPDATED',
        entityType: 'payment_provider',
        entityId: req.params.code,
        oldValue: existing,
        newValue: { receiving_account, receiving_name, is_active: Boolean(is_active), fee_percent },
        result: 'succès',
        ipAddress: req.ip,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  // Withdrawals processing with two-level admin approval (Admin / Finance)
  router.get('/admin/withdrawals', requirePermission('admin:dashboard'), (_req, res) => {
    const settings = getPlatformSettings();
    const threshold = Number(settings.dualApprovalThreshold || 500000);
    const withdrawals = db.prepare(`
      SELECT w.*, u.email as user_email, p.first_name, p.last_name,
             a1.email as first_approved_by_email, a2.email as second_approved_by_email
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      LEFT JOIN profiles p ON p.user_id = w.user_id
      LEFT JOIN users a1 ON a1.id = w.first_approved_by
      LEFT JOIN users a2 ON a2.id = w.second_approved_by
      ORDER BY w.id DESC
    `).all();
    res.json({ withdrawals, dualApprovalThreshold: threshold });
  });

  router.post('/admin/withdrawals/:id/process', requirePermission('withdrawals:process'), (req, res) => {
    try {
      const wId = Number(req.params.id);
      const { status, note, adminPin } = req.body || {};
      const allowed = ['en_verification', 'approuve', 'en_traitement', 'termine', 'refuse', 'echoue'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Statut de retrait invalide.' });
      }

      const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(wId) as Record<string, any> | undefined;
      if (!w) return res.status(404).json({ error: 'Retrait introuvable.' });
      if (w.status === 'termine' || w.status === 'refuse') {
        return res.status(400).json({ error: 'Ce retrait est déjà finalisé.' });
      }

      const settings = getPlatformSettings();
      const threshold = Number(settings.dualApprovalThreshold || 500000);
      const needsDual = Number(w.amount) >= threshold || w.fraud_check_status !== 'clean' || Number(w.requires_dual_approval) === 1;

      if (['approuve', 'termine'].includes(status)) {
        assertAdminPin(req, adminPin);
      }

      db.transaction(() => {
        let targetStatus = status;
        let firstBy = w.first_approved_by;
        let firstAt = w.first_approved_at;
        let secondBy = w.second_approved_by;
        let secondAt = w.second_approved_at;

        if (status === 'approuve') {
          if (needsDual) {
            if (!firstBy) {
              firstBy = req.authUser!.id;
              firstAt = new Date().toISOString();
              targetStatus = 'en_verification';
            } else if (!secondBy) {
              if (Number(firstBy) === req.authUser!.id) {
                throw new Error('Validation à deux niveaux requise : un second administrateur distinct doit approuver ce retrait.');
              }
              secondBy = req.authUser!.id;
              secondAt = new Date().toISOString();
              targetStatus = 'approuve';
            }
          } else {
            if (!firstBy) {
              firstBy = req.authUser!.id;
              firstAt = new Date().toISOString();
            }
          }
        }

        if (status === 'termine') {
          if (needsDual && (!firstBy || !secondBy)) {
            throw new Error('Ce retrait nécessite une double validation (Administrateur 1 puis Administrateur 2) avant le décaissement final.');
          }
          const avail = getUserAccountBalance(w.user_id, 'USER_AVAILABLE');
          if (avail < w.amount) {
            throw new Error('Solde utilisateur insuffisant dans le grand livre pour finaliser ce retrait.');
          }
          const txSeq = getNextSeq('transactions');
          const txRes = db.prepare(`
            INSERT INTO transactions (reference, user_id, withdrawal_id, type, direction, amount, status, description)
            VALUES (?, ?, ?, 'withdrawal', 'debit', ?, 'confirmed', ?)
          `).run(formatRef('TRX', txSeq), w.user_id, w.id, w.amount, `Retrait exécuté ${w.reference} (${w.method})`);
          const txId = Number(txRes.lastInsertRowid);

          appendLedgerEntry({
            transactionId: txId,
            userId: w.user_id,
            accountCode: 'USER_AVAILABLE',
            entryType: 'DEBIT',
            amount: w.amount,
            description: `Décaissement retrait ${w.reference}`,
          });
          if (w.fee_amount > 0) {
            appendLedgerEntry({
              transactionId: txId,
              userId: w.user_id,
              accountCode: 'PLATFORM_FEES',
              entryType: 'CREDIT',
              amount: w.fee_amount,
              description: `Frais de retrait ${w.reference}`,
            });
          }
        }

        db.prepare(`
          UPDATE withdrawals
          SET status = ?, requires_dual_approval = ?, first_approved_by = ?, first_approved_at = ?,
              second_approved_by = ?, second_approved_at = ?, reviewed_by = ?, review_note = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(targetStatus, needsDual ? 1 : 0, firstBy, firstAt, secondBy, secondAt, req.authUser!.id, note || w.review_note || null, wId);

        createNotification({
          userId: w.user_id,
          title: `Retrait ${w.reference} : ${targetStatus}`,
          message: `Le statut de votre retrait ${w.reference} (${Number(w.amount).toLocaleString('fr-FR')} FCFA) est passé à « ${targetStatus} ».`,
          category: 'withdrawal',
          actionUrl: '/dashboard/retraits',
        });

        recordAuditLog({
          actorUserId: req.authUser!.id,
          actorEmail: req.authUser!.email,
          actorRole: req.authUser!.roleCode,
          action: `WITHDRAWAL_${targetStatus.toUpperCase()}`,
          entityType: 'withdrawal',
          entityId: w.reference,
          oldValue: { status: w.status, first_approved_by: w.first_approved_by, second_approved_by: w.second_approved_by },
          newValue: { status: targetStatus, first_approved_by: firstBy, second_approved_by: secondBy, note },
          result: 'succès',
          ipAddress: req.ip,
        });
      })();

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Financial Ledger (Admin)
  router.get('/admin/ledger', requirePermission('ledger:read'), (_req, res) => {
    const entries = db.prepare(`
      SELECT l.*, u.email as user_email, t.reference as tx_reference, t.type as tx_type
      FROM ledger_entries l
      JOIN users u ON u.id = l.user_id
      JOIN transactions t ON t.id = l.transaction_id
      ORDER BY l.id DESC
      LIMIT 250
    `).all();
    res.json({ entries });
  });

  // Users Management & Full Dossier (Admin)
  router.get('/admin/users', requirePermission('users:manage'), (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    let sql = `
      SELECT u.id, u.email, u.phone, u.status, u.two_factor_enabled, u.created_at,
             r.id as role_id, r.code as role_code, r.name as role_name,
             p.first_name, p.last_name, p.country, p.city,
             (SELECT COUNT(*) FROM investments i WHERE i.user_id = u.id AND i.status IN ('active', 'matured')) as investments_count,
             (SELECT COALESCE(SUM(amount), 0) FROM investments i WHERE i.user_id = u.id AND i.status = 'active') as active_invested
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (q) {
      sql += ` AND (lower(u.email) LIKE ? OR u.phone LIKE ? OR lower(COALESCE(p.first_name,'')) LIKE ? OR lower(COALESCE(p.last_name,'')) LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY u.id DESC';
    const users = db.prepare(sql).all(...params);
    const roles = db.prepare('SELECT * FROM roles ORDER BY id ASC').all();
    res.json({ users, roles });
  });

  router.get('/admin/users/:id/dossier', requirePermission('users:manage'), (req, res) => {
    const userId = Number(req.params.id);
    const userRow = db.prepare(`
      SELECT u.id, u.email, u.phone, u.status, u.email_verified, u.phone_verified, u.two_factor_enabled, u.created_at,
             r.code as role_code, r.name as role_name,
             p.first_name, p.last_name, p.birth_date, p.address, p.city, p.country, p.profession
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ?
    `).get(userId);
    if (!userRow) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const investments = db.prepare(`
      SELECT i.*, pl.name as plan_name FROM investments i JOIN investment_plans pl ON pl.id = i.plan_id WHERE i.user_id = ? ORDER BY i.id DESC
    `).all(userId);
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);
    const payments = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);
    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);
    const notes = db.prepare('SELECT * FROM user_notes WHERE user_id = ? ORDER BY id DESC').all(userId);
    const history = db.prepare('SELECT * FROM audit_logs WHERE actor_user_id = ? OR (entity_type = \'user\' AND entity_id = ?) ORDER BY id DESC LIMIT 50').all(userId, String(userId));

    res.json({
      dossier: {
        user: userRow,
        availableBalance: getUserAccountBalance(userId, 'USER_AVAILABLE'),
        investedBalance: getUserAccountBalance(userId, 'USER_INVESTED'),
        investments,
        transactions,
        payments,
        withdrawals,
        notes,
        history,
      },
    });
  });

  router.put('/admin/users/:id/info', requirePermission('users:manage'), (req, res) => {
    const userId = Number(req.params.id);
    const { first_name, last_name, city, country, profession, address } = req.body || {};
    const existing = db.prepare('SELECT first_name, last_name, city, country, profession, address FROM profiles WHERE user_id = ?').get(userId) as Record<string, any> | undefined;
    if (!existing) return res.status(404).json({ error: 'Profil introuvable.' });

    db.prepare(`
      UPDATE profiles
      SET first_name = ?, last_name = ?, city = ?, country = ?, profession = ?, address = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      first_name ?? existing.first_name,
      last_name ?? existing.last_name,
      city ?? existing.city,
      country ?? existing.country,
      profession ?? existing.profession,
      address ?? existing.address,
      userId
    );

    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'USER_PROFILE_ADMIN_EDITED',
      entityType: 'user',
      entityId: userId,
      oldValue: existing,
      newValue: { first_name, last_name, city, country, profession, address },
      result: 'succès',
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  router.post('/admin/users/:id/note', requirePermission('users:manage'), (req, res) => {
    const userId = Number(req.params.id);
    const { note } = req.body || {};
    if (!note || !String(note).trim()) return res.status(400).json({ error: 'Le contenu de la note interne est requis.' });
    db.prepare('INSERT INTO user_notes (user_id, admin_id, admin_email, note) VALUES (?, ?, ?, ?)').run(
      userId,
      req.authUser!.id,
      req.authUser!.email,
      String(note).trim()
    );
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'USER_INTERNAL_NOTE_ADDED',
      entityType: 'user',
      entityId: userId,
      newValue: { note: String(note).trim() },
      result: 'succès',
      ipAddress: req.ip,
    });
    res.status(201).json({ ok: true });
  });

  router.post('/admin/users/:id/request-info', requirePermission('users:manage'), (req, res) => {
    const userId = Number(req.params.id);
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message de demande d’informations requis.' });
    createNotification({
      userId,
      title: 'Demande d’informations complémentaires',
      message: String(message).trim(),
      category: 'account',
      actionUrl: '/dashboard/profil',
    });
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'USER_INFO_REQUESTED',
      entityType: 'user',
      entityId: userId,
      newValue: { message },
      result: 'succès',
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  router.post('/admin/users/:id/role', requirePermission('users:manage'), (req, res) => {
    try {
      if (req.authUser!.roleCode !== 'super_admin') {
        return res.status(403).json({ error: 'Seul le Super Administrateur peut modifier les rôles.' });
      }
      const targetId = Number(req.params.id);
      const { roleCode, adminPin } = req.body || {};
      assertAdminPin(req, adminPin);

      const oldUser = db.prepare('SELECT r.code as role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?').get(targetId) as { role_code: string } | undefined;
      const role = db.prepare('SELECT id, name FROM roles WHERE code = ?').get(roleCode) as { id: number; name: string } | undefined;
      if (!role || !oldUser) return res.status(400).json({ error: 'Rôle ou utilisateur inconnu.' });

      db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(role.id, targetId);
      recordAuditLog({
        actorUserId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        actorRole: req.authUser!.roleCode,
        action: 'USER_ROLE_CHANGED',
        entityType: 'user',
        entityId: targetId,
        oldValue: { role: oldUser.role_code },
        newValue: { role: roleCode },
        result: 'succès',
        ipAddress: req.ip,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  router.post('/admin/users/:id/status', requirePermission('users:manage'), (req, res) => {
    const targetId = Number(req.params.id);
    const { status } = req.body || {};
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    const existing = db.prepare('SELECT status FROM users WHERE id = ?').get(targetId) as { status: string } | undefined;
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, targetId);
    if (status === 'suspended') {
      db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(targetId);
    }
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: `USER_${status.toUpperCase()}`,
      entityType: 'user',
      entityId: targetId,
      oldValue: { status: existing?.status },
      newValue: { status },
      result: 'succès',
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  // Administrators management (Super Admin only)
  router.get('/admin/admins', requirePermission('admin:dashboard'), (_req, res) => {
    const admins = db.prepare(`
      SELECT a.id as admin_id, a.user_id, a.department, a.is_active, a.last_login_at, a.last_login_ip, a.created_at,
             u.email, u.phone, u.status as user_status, u.two_factor_enabled,
             r.code as role_code, r.name as role_name,
             p.first_name, p.last_name
      FROM admin_users a
      JOIN users u ON u.id = a.user_id
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN profiles p ON p.user_id = u.id
      ORDER BY a.id ASC
    `).all();
    const adminRoles = db.prepare(`SELECT * FROM roles WHERE code != 'user' ORDER BY id ASC`).all();
    res.json({ admins, adminRoles });
  });

  router.post('/admin/admins', requirePermission('users:manage'), (req, res) => {
    try {
      if (req.authUser!.roleCode !== 'super_admin') {
        return res.status(403).json({ error: 'Seul le Super Administrateur peut créer de nouveaux comptes administrateurs.' });
      }
      const { firstName, lastName, email, phone, password, pin, roleCode, department, adminPin } = req.body || {};
      assertAdminPin(req, adminPin);

      if (!firstName || !lastName || !email || !phone || !password || !pin || !roleCode) {
        return res.status(400).json({ error: 'Tous les champs sont obligatoires pour créer un administrateur.' });
      }
      if (!/^\d{4,8}$/.test(String(pin).trim())) {
        return res.status(400).json({ error: 'Le code PIN personnel du nouvel administrateur doit comporter 4 à 8 chiffres.' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPhone = String(phone).trim().replace(/\s+/g, '');
      const role = db.prepare("SELECT id, name FROM roles WHERE code = ? AND code != 'user'").get(roleCode) as { id: number; name: string } | undefined;
      if (!role) return res.status(400).json({ error: 'Rôle administrateur invalide.' });

      const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ? OR phone = ?').get(cleanEmail, cleanPhone);
      if (exists) return res.status(409).json({ error: 'Cet e-mail ou téléphone est déjà utilisé.' });

      const userId = db.transaction(() => {
        const uRes = db.prepare(`
          INSERT INTO users (email, phone, password_hash, role_id, email_verified, phone_verified, two_factor_enabled, status)
          VALUES (?, ?, ?, ?, 1, 1, 0, 'active')
        `).run(cleanEmail, cleanPhone, hashPassword(String(password)), role.id);
        const uid = Number(uRes.lastInsertRowid);
        db.prepare(`
          INSERT INTO profiles (user_id, first_name, last_name, country, profession)
          VALUES (?, ?, ?, 'Togo', ?)
        `).run(uid, String(firstName).trim(), String(lastName).trim(), role.name);
        db.prepare(`
          INSERT INTO admin_users (user_id, department, pin_hash, assigned_by, is_active)
          VALUES (?, ?, ?, ?, 1)
        `).run(uid, department || role.name, hashPassword(String(pin).trim()), req.authUser!.id);

        recordAuditLog({
          actorUserId: req.authUser!.id,
          actorEmail: req.authUser!.email,
          actorRole: req.authUser!.roleCode,
          action: 'ADMIN_ACCOUNT_CREATED',
          entityType: 'admin_user',
          entityId: uid,
          oldValue: null,
          newValue: { email: cleanEmail, role: roleCode, department: department || role.name },
          result: 'succès',
          ipAddress: req.ip,
        });
        return uid;
      })();

      res.status(201).json({ ok: true, userId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/admin/admins/:userId/role', requirePermission('users:manage'), (req, res) => {
    try {
      if (req.authUser!.roleCode !== 'super_admin') {
        return res.status(403).json({ error: 'Seul le Super Administrateur peut modifier les habilitations.' });
      }
      const targetUserId = Number(req.params.userId);
      const { roleCode, isActive, adminPin } = req.body || {};
      assertAdminPin(req, adminPin);

      const current = db.prepare(`
        SELECT u.id, r.code as role_code, a.is_active
        FROM users u JOIN roles r ON r.id = u.role_id JOIN admin_users a ON a.user_id = u.id
        WHERE u.id = ?
      `).get(targetUserId) as { id: number; role_code: string; is_active: number } | undefined;
      if (!current) return res.status(404).json({ error: 'Administrateur introuvable.' });

      const role = db.prepare("SELECT id FROM roles WHERE code = ? AND code != 'user'").get(roleCode) as { id: number } | undefined;
      if (!role) return res.status(400).json({ error: 'Rôle administrateur invalide.' });

      db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(role.id, targetUserId);
      if (isActive !== undefined) {
        db.prepare('UPDATE admin_users SET is_active = ? WHERE user_id = ?').run(isActive ? 1 : 0, targetUserId);
        if (!isActive) {
          db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(targetUserId);
        }
      }

      recordAuditLog({
        actorUserId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        actorRole: req.authUser!.roleCode,
        action: 'ADMIN_PERMISSIONS_UPDATED',
        entityType: 'admin_user',
        entityId: targetUserId,
        oldValue: { role: current.role_code, is_active: Boolean(current.is_active) },
        newValue: { role: roleCode, is_active: isActive !== undefined ? Boolean(isActive) : Boolean(current.is_active) },
        result: 'succès',
        ipAddress: req.ip,
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // General Settings & Maintenance Mode
  router.get('/admin/settings', requirePermission('admin:dashboard'), (_req, res) => {
    res.json({ settings: getPlatformSettings() });
  });

  router.put('/admin/settings', requirePermission('admin:dashboard'), (req, res) => {
    try {
      if (req.authUser!.roleCode !== 'super_admin') {
        return res.status(403).json({ error: 'Seul le Super Administrateur peut modifier les paramètres généraux.' });
      }
      const { settings, adminPin } = req.body || {};
      assertAdminPin(req, adminPin);

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Objet de configuration invalide.' });
      }
      const oldSettings = getPlatformSettings();
      const nextSettings = { ...oldSettings, ...settings };

      db.prepare(`UPDATE cms_contents SET content_json = ?, updated_by = ?, updated_at = datetime('now') WHERE key = 'platform_settings'`).run(
        JSON.stringify(nextSettings),
        req.authUser!.id
      );

      // Keep site_identity contact details synchronized
      const identityRow = db.prepare("SELECT content_json FROM cms_contents WHERE key = 'site_identity'").get() as { content_json: string } | undefined;
      if (identityRow) {
        try {
          const parsed = JSON.parse(identityRow.content_json);
          parsed.brandName = nextSettings.companyName || parsed.brandName;
          parsed.email = nextSettings.email || parsed.email;
          parsed.phone = nextSettings.phone || parsed.phone;
          parsed.address = nextSettings.address || parsed.address;
          db.prepare(`UPDATE cms_contents SET content_json = ?, updated_by = ?, updated_at = datetime('now') WHERE key = 'site_identity'`).run(
            JSON.stringify(parsed),
            req.authUser!.id
          );
        } catch {
          // ignore
        }
      }

      recordAuditLog({
        actorUserId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        actorRole: req.authUser!.roleCode,
        action: oldSettings.maintenanceMode !== nextSettings.maintenanceMode
          ? (nextSettings.maintenanceMode ? 'MAINTENANCE_MODE_ENABLED' : 'MAINTENANCE_MODE_DISABLED')
          : 'PLATFORM_SETTINGS_UPDATED',
        entityType: 'platform_settings',
        entityId: 'global',
        oldValue: oldSettings,
        newValue: nextSettings,
        result: 'succès',
        ipAddress: req.ip,
      });

      res.json({ ok: true, settings: nextSettings });
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  // CMS (Admin)
  router.get('/admin/cms', requirePermission('admin:dashboard'), (_req, res) => {
    const items = db.prepare("SELECT * FROM cms_contents WHERE key != 'platform_settings' ORDER BY section ASC").all();
    res.json({ items });
  });

  router.put('/admin/cms/:key', requirePermission('cms:edit'), (req, res) => {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Contenu requis.' });
    const oldRow = db.prepare('SELECT content_json FROM cms_contents WHERE key = ?').get(req.params.key) as { content_json: string } | undefined;
    db.prepare(`UPDATE cms_contents SET content_json = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?`).run(
      JSON.stringify(content),
      req.authUser!.id,
      req.params.key
    );
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      actorRole: req.authUser!.roleCode,
      action: 'CMS_UPDATED',
      entityType: 'cms_content',
      entityId: req.params.key,
      oldValue: oldRow ? JSON.parse(oldRow.content_json) : null,
      newValue: content,
      result: 'succès',
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  });

  // Audit Logs (immutable - read only)
  router.get('/admin/audit-logs', requirePermission('admin:dashboard'), (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300').all();
    res.json({ logs });
  });

  // Contact messages
  router.get('/admin/contact-messages', requirePermission('admin:dashboard'), (_req, res) => {
    const messages = db.prepare('SELECT * FROM contact_messages ORDER BY id DESC').all();
    res.json({ messages });
  });

  // Maturity trigger
  router.post('/admin/maturity/run', requirePermission('admin:dashboard'), (_req, res) => {
    const result = runMaturityCheck();
    res.json({ ok: true, ...result });
  });

  // Reports & CSV Export
  router.get('/admin/reports', requirePermission('reports:export'), (req, res) => {
    const type = String(req.query.type || 'transactions');
    const format = String(req.query.format || 'json');

    let rows: Array<Record<string, any>> = [];
    if (type === 'investments') {
      rows = db.prepare(`
        SELECT i.reference, u.email, p.name as offre, i.duration_label as duree, i.amount as montant_fcfa, i.fee_amount as frais_fcfa, i.status as statut, i.start_date, i.end_date
        FROM investments i JOIN users u ON u.id = i.user_id JOIN investment_plans p ON p.id = i.plan_id ORDER BY i.id DESC
      `).all() as Array<Record<string, any>>;
    } else if (type === 'withdrawals') {
      rows = db.prepare(`
        SELECT w.reference, u.email, w.method, w.beneficiary_account, w.amount as montant_fcfa, w.fee_amount as frais_fcfa, w.net_amount as net_fcfa, w.status, w.created_at
        FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC
      `).all() as Array<Record<string, any>>;
    } else if (type === 'fees') {
      rows = db.prepare(`
        SELECT l.entry_reference, l.amount as frais_fcfa, l.description, l.created_at, u.email
        FROM ledger_entries l JOIN users u ON u.id = l.user_id WHERE l.account_code = 'PLATFORM_FEES' ORDER BY l.id DESC
      `).all() as Array<Record<string, any>>;
    } else if (type === 'maturities') {
      rows = db.prepare(`
        SELECT i.reference, u.email, p.name as offre, i.amount as montant_fcfa, i.status, i.end_date as date_echeance
        FROM investments i JOIN users u ON u.id = i.user_id JOIN investment_plans p ON p.id = i.plan_id
        WHERE i.status IN ('active', 'matured') ORDER BY i.end_date ASC
      `).all() as Array<Record<string, any>>;
    } else {
      rows = db.prepare(`
        SELECT t.reference, u.email, t.type, t.direction, t.amount as montant_fcfa, t.status, t.description, t.created_at
        FROM transactions t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC
      `).all() as Array<Record<string, any>>;
    }

    if (format === 'csv') {
      const headers = rows.length > 0 ? Object.keys(rows[0]) : ['aucune_donnee'];
      const csvLines = [
        headers.join(';'),
        ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';')),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="investmarket_${type}_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send('\uFEFF' + csvLines.join('\n'));
    }

    res.json({ type, rows });
  });

  return router;
}
