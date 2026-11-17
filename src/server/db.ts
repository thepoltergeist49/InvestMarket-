import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { hashPassword } from './crypto.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'investmarket.sqlite');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      phone_verified INTEGER NOT NULL DEFAULT 0,
      verification_code TEXT,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      two_factor_code TEXT,
      two_factor_expires_at TEXT,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      status TEXT NOT NULL DEFAULT 'pending_verification',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      department TEXT NOT NULL,
      pin_hash TEXT,
      assigned_by INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      last_login_ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      is_admin_session INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      birth_date TEXT,
      address TEXT,
      city TEXT,
      country TEXT NOT NULL DEFAULT 'Togo',
      profession TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kyc_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'non_verifie',
      id_type TEXT,
      id_number TEXT,
      document_front_name TEXT,
      document_front_data TEXT,
      document_back_name TEXT,
      document_back_data TEXT,
      proof_of_address_name TEXT,
      proof_of_address_data TEXT,
      consent_aml INTEGER NOT NULL DEFAULT 0,
      reviewer_id INTEGER,
      reviewer_note TEXT,
      submitted_at TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS investment_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      description TEXT NOT NULL,
      objective TEXT NOT NULL,
      min_amount INTEGER NOT NULL,
      max_amount INTEGER NOT NULL,
      step_amount INTEGER NOT NULL DEFAULT 5000,
      daily_limit INTEGER NOT NULL DEFAULT 10000000,
      user_limit INTEGER NOT NULL DEFAULT 25000000,
      fee_percent REAL NOT NULL DEFAULT 0,
      fee_fixed INTEGER NOT NULL DEFAULT 0,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      visibility TEXT NOT NULL DEFAULT 'public',
      scheduled_start_at TEXT,
      expires_at TEXT,
      available_cap INTEGER NOT NULL DEFAULT 100000000,
      allocated_cap INTEGER NOT NULL DEFAULT 0,
      potential_rate_min REAL,
      potential_rate_max REAL,
      rate_disclaimer TEXT NOT NULL,
      conditions_text TEXT NOT NULL,
      exit_rules TEXT NOT NULL,
      renewal_rules TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS investment_plan_durations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      duration_type TEXT NOT NULL,
      days INTEGER NOT NULL,
      weeks INTEGER NOT NULL DEFAULT 0,
      months INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (plan_id) REFERENCES investment_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS investment_plan_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      changed_by INTEGER,
      change_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (plan_id) REFERENCES investment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XOF',
      is_active INTEGER NOT NULL DEFAULT 1,
      fee_percent REAL NOT NULL DEFAULT 0,
      receiving_account TEXT,
      receiving_name TEXT,
      instructions TEXT NOT NULL,
      config_status TEXT NOT NULL DEFAULT 'direct_transfer',
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      plan_version INTEGER NOT NULL,
      duration_id INTEGER NOT NULL,
      duration_label TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      fee_amount INTEGER NOT NULL,
      total_paid INTEGER NOT NULL,
      potential_rate_min REAL,
      potential_rate_max REAL,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      start_date TEXT,
      end_date TEXT,
      exit_rules_snapshot TEXT NOT NULL,
      conditions_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES investment_plans(id),
      FOREIGN KEY (duration_id) REFERENCES investment_plan_durations(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_reference TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      transaction_id TEXT NOT NULL UNIQUE,
      investment_id INTEGER,
      user_id INTEGER NOT NULL,
      provider_code TEXT NOT NULL,
      phone_number TEXT,
      amount INTEGER NOT NULL,
      fee_amount INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XOF',
      purpose TEXT NOT NULL DEFAULT 'investment',
      status TEXT NOT NULL DEFAULT 'initiated',
      external_reference TEXT,
      webhook_payload_json TEXT,
      failure_reason TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (investment_id) REFERENCES investments(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (provider_code) REFERENCES payment_providers(code)
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      investment_id INTEGER,
      amount INTEGER NOT NULL,
      fee_amount INTEGER NOT NULL DEFAULT 0,
      net_amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      beneficiary_account TEXT NOT NULL,
      beneficiary_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'demande',
      fraud_check_status TEXT NOT NULL DEFAULT 'clean',
      requires_dual_approval INTEGER NOT NULL DEFAULT 0,
      first_approved_by INTEGER,
      first_approved_at TEXT,
      second_approved_by INTEGER,
      second_approved_at TEXT,
      reviewed_by INTEGER,
      review_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (investment_id) REFERENCES investments(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      investment_id INTEGER,
      payment_id INTEGER,
      withdrawal_id INTEGER,
      type TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XOF',
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (investment_id) REFERENCES investments(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_reference TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      account_code TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XOF',
      balance_after INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (transaction_id) REFERENCES transactions(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'system',
      is_read INTEGER NOT NULL DEFAULT 0,
      action_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      investment_id INTEGER,
      plan_id INTEGER,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (investment_id) REFERENCES investments(id),
      FOREIGN KEY (plan_id) REFERENCES investment_plans(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_email TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_value_json TEXT,
      new_value_json TEXT,
      result TEXT NOT NULL DEFAULT 'succès',
      details_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      admin_id INTEGER NOT NULL,
      admin_email TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cms_contents (
      key TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'nouveau',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const addColIfMissing = (table: string, col: string, def: string) => {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!info.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
    }
  };

  addColIfMissing('payment_providers', 'receiving_account', 'TEXT');
  addColIfMissing('payment_providers', 'receiving_name', 'TEXT');
  addColIfMissing('admin_users', 'pin_hash', 'TEXT');
  addColIfMissing('admin_users', 'last_login_at', 'TEXT');
  addColIfMissing('admin_users', 'last_login_ip', 'TEXT');
  addColIfMissing('sessions', 'is_admin_session', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing('sessions', 'last_activity_at', "TEXT NOT NULL DEFAULT ''");
  addColIfMissing('investment_plans', 'expires_at', 'TEXT');
  addColIfMissing('investment_plans', 'created_by', 'INTEGER');
  addColIfMissing('investment_plans', 'updated_by', 'INTEGER');
  addColIfMissing('withdrawals', 'requires_dual_approval', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing('withdrawals', 'first_approved_by', 'INTEGER');
  addColIfMissing('withdrawals', 'first_approved_at', 'TEXT');
  addColIfMissing('withdrawals', 'second_approved_by', 'INTEGER');
  addColIfMissing('withdrawals', 'second_approved_at', 'TEXT');
  addColIfMissing('audit_logs', 'old_value_json', 'TEXT');
  addColIfMissing('audit_logs', 'new_value_json', 'TEXT');
  addColIfMissing('audit_logs', 'result', "TEXT NOT NULL DEFAULT 'succès'");

  seedInitialData();
  ensureAdminRolesAndSettings();

  // Synchronize direct Mobile Money reception numbers (TMoney 93736916 & Flooz 97172729)
  db.prepare(`
    UPDATE payment_providers
    SET receiving_account = '97172729',
        receiving_name = 'InvestMarket Flooz',
        config_status = 'direct_transfer',
        instructions = 'Effectuez votre dépôt Flooz vers le numéro officiel 97 17 27 29 (*155# Moov Africa Togo), puis indiquez la référence SMS de votre transfert pour validation.'
    WHERE code = 'flooz' AND (receiving_account IS NULL OR receiving_account = '')
  `).run();

  db.prepare(`
    UPDATE payment_providers
    SET receiving_account = '93736916',
        receiving_name = 'InvestMarket TMoney',
        config_status = 'direct_transfer',
        instructions = 'Effectuez votre dépôt TMoney vers le numéro officiel 93 73 69 16 (*145# Togocom), puis indiquez la référence SMS de votre transfert pour validation.'
    WHERE code = 'tmoney' AND (receiving_account IS NULL OR receiving_account = '')
  `).run();
}

function seedInitialData(): void {
  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  if (roleCount > 0) return;

  const insertRole = db.prepare('INSERT INTO roles (code, name, description) VALUES (?, ?, ?)');
  const roles = [
    ['super_admin', 'Super Administrateur', 'Accès complet à la plateforme, aux rôles, au registre financier et aux configurations critiques.'],
    ['finance', 'Finance', 'Rapprochement des paiements Flooz/TMoney, validation des retraits, registre financier et rapports.'],
    ['compliance', 'Compliance', 'Contrôles de conformité, suspension de comptes et journal d’audit.'],
    ['support', 'Support', 'Assistance utilisateurs, consultation des dossiers et gestion des messages de contact.'],
    ['analyst', 'Analyste', 'Consultation des offres, statistiques d’allocation et exportation des rapports.'],
    ['user', 'Utilisateur', 'Investisseur standard accédant à son espace client et aux offres autorisées.'],
  ];
  for (const r of roles) insertRole.run(...r);

  const insertPerm = db.prepare('INSERT INTO permissions (code, description) VALUES (?, ?)');
  const perms = [
    ['admin:dashboard', 'Accéder au back-office'],
    ['offers:manage', 'Créer, modifier et publier les offres et durées'],
    ['transactions:reconcile', 'Rapprocher et vérifier les paiements'],
    ['withdrawals:process', 'Approuver ou refuser les demandes de retrait'],
    ['ledger:read', 'Consulter le grand livre financier'],
    ['users:manage', 'Gérer les comptes et attributions de rôles'],
    ['cms:edit', 'Modifier les contenus éditoriaux et FAQ'],
    ['reports:export', 'Générer et exporter les rapports financiers'],
    ['audit:read', 'Consulter le journal d’audit immuable'],
  ];
  for (const p of perms) insertPerm.run(...p);

  const getRoleId = (code: string) => (db.prepare('SELECT id FROM roles WHERE code = ?').get(code) as { id: number }).id;
  const getPermId = (code: string) => (db.prepare('SELECT id FROM permissions WHERE code = ?').get(code) as { id: number }).id;
  const assignPerm = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

  const rolePermMap: Record<string, string[]> = {
    super_admin: perms.map((p) => p[0]),
    finance: ['admin:dashboard', 'transactions:reconcile', 'withdrawals:process', 'ledger:read', 'reports:export'],
    compliance: ['admin:dashboard', 'audit:read', 'users:manage', 'reports:export'],
    support: ['admin:dashboard', 'users:manage', 'cms:edit'],
    analyst: ['admin:dashboard', 'reports:export', 'ledger:read'],
  };
  for (const [rCode, pCodes] of Object.entries(rolePermMap)) {
    const rId = getRoleId(rCode);
    for (const pCode of pCodes) {
      assignPerm.run(rId, getPermId(pCode));
    }
  }

  // Payment providers (direct reception numbers without API keys)
  const insertProvider = db.prepare(`
    INSERT INTO payment_providers (code, name, country, currency, is_active, fee_percent, receiving_account, receiving_name, instructions, config_status, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertProvider.run('flooz', 'Flooz (Moov Africa Togo)', 'Togo', 'XOF', 1, 1.0, '97172729', 'InvestMarket Flooz', 'Effectuez votre dépôt Flooz vers le numéro officiel 97 17 27 29 (*155# Moov Africa Togo), puis indiquez la référence SMS de votre transfert pour validation.', 'direct_transfer', 1);
  insertProvider.run('tmoney', 'TMoney (Togocom)', 'Togo', 'XOF', 1, 1.0, '93736916', 'InvestMarket TMoney', 'Effectuez votre dépôt TMoney vers le numéro officiel 93 73 69 16 (*145# Togocom), puis indiquez la référence SMS de votre transfert pour validation.', 'direct_transfer', 2);
  insertProvider.run('bank_transfer', 'Virement Bancaire UEMOA', 'UEMOA', 'XOF', 1, 0.0, 'TG055 01001 00004829100 42', 'InvestMarket Séquestre UEMOA', 'Virement vers le compte séquestre dédié avec mention obligatoire de votre référence d’ordre INV-XXXX.', 'manual_verification', 3);
  insertProvider.run('card', 'Carte Bancaire (GIM-UEMOA / Visa)', 'Régional', 'XOF', 0, 2.0, '', 'InvestMarket Cartes', 'Module carte bancaire prêt pour activation ultérieure.', 'inactive', 4);

  // Seed users
  const insertUser = db.prepare(`
    INSERT INTO users (email, phone, password_hash, role_id, email_verified, phone_verified, two_factor_enabled, status)
    VALUES (?, ?, ?, ?, 1, 1, 0, 'active')
  `);
  const insertProfile = db.prepare(`
    INSERT INTO profiles (user_id, first_name, last_name, birth_date, address, city, country, profession)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const adminRes = insertUser.run('admin@investmarket.tg', '+22890000001', hashPassword('Admin@2026!'), getRoleId('super_admin'));
  const adminId = Number(adminRes.lastInsertRowid);
  insertProfile.run(adminId, 'Koffi', 'Mensah', '1984-05-12', 'Boulevard du 13 Janvier, Immeuble Horizon', 'Lomé', 'Togo', 'Directeur des Opérations');
  db.prepare('INSERT INTO admin_users (user_id, department, pin_hash, assigned_by) VALUES (?, ?, ?, ?)').run(adminId, 'Direction Générale', hashPassword('2026'), adminId);

  const compRes = insertUser.run('compliance@investmarket.tg', '+22890000002', hashPassword('Compliance@2026!'), getRoleId('compliance'));
  const compId = Number(compRes.lastInsertRowid);
  insertProfile.run(compId, 'Afi', 'Lawson', '1989-11-03', 'Quartier Administratif', 'Lomé', 'Togo', 'Responsable Conformité & LCB-FT');
  db.prepare('INSERT INTO admin_users (user_id, department, pin_hash, assigned_by) VALUES (?, ?, ?, ?)').run(compId, 'Conformité', hashPassword('4589'), adminId);

  const finRes = insertUser.run('finance@investmarket.tg', '+22890000003', hashPassword('Finance@2026!'), getRoleId('finance'));
  const finId = Number(finRes.lastInsertRowid);
  insertProfile.run(finId, 'Yao', 'Tettekpo', '1987-02-22', 'Boulevard du Mono', 'Lomé', 'Togo', 'Responsable Trésorerie & Finance');
  db.prepare('INSERT INTO admin_users (user_id, department, pin_hash, assigned_by) VALUES (?, ?, ?, ?)').run(finId, 'Finance & Trésorerie', hashPassword('7391'), adminId);

  const invRes = insertUser.run('investisseur@investmarket.tg', '+22891234567', hashPassword('Invest@2026!'), getRoleId('user'));
  const invId = Number(invRes.lastInsertRowid);
  insertProfile.run(invId, 'Kodjo', 'Agbessi', '1991-08-19', 'Tokoin Habitat, Rue 14', 'Lomé', 'Togo', 'Ingénieur Génie Civil');

  // Seed Investment Plans
  const insertPlan = db.prepare(`
    INSERT INTO investment_plans (
      code, name, slug, category, summary, description, objective,
      min_amount, max_amount, step_amount, daily_limit, user_limit,
      fee_percent, fee_fixed, risk_level, status, visibility,
      available_cap, allocated_cap, potential_rate_min, potential_rate_max,
      rate_disclaimer, conditions_text, exit_rules, renewal_rules, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const insertDuration = db.prepare(`
    INSERT INTO investment_plan_durations (plan_id, label, duration_type, days, weeks, months, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const insertPlanVersion = db.prepare(`
    INSERT INTO investment_plan_versions (plan_id, version, snapshot_json, changed_by, change_reason)
    VALUES (?, 1, ?, ?, 'Création initiale du produit')
  `);

  const plans = [
    {
      code: 'IM-TRESOR-CT',
      name: 'Obligations & Trésorerie UEMOA',
      slug: 'obligations-tresorerie-uemoa',
      category: 'Court Terme · Revenu Fixe Régional',
      summary: 'Exposition structurée à des titres de créance publics et billets de trésorerie de l’espace UEMOA.',
      description: 'Ce véhicule d’investissement vise à financer des besoins de trésorerie à court et moyen terme au sein de la zone UEMOA à travers des instruments obligataires sélectionnés selon des critères de solvabilité stricts.',
      objective: 'Préservation relative du capital et recherche de performance modérée sur des horizons courts à intermédiaires.',
      min_amount: 25000,
      max_amount: 10000000,
      step_amount: 5000,
      daily_limit: 5000000,
      user_limit: 15000000,
      fee_percent: 1.0,
      fee_fixed: 500,
      risk_level: 'Modéré',
      status: 'active',
      visibility: 'public',
      available_cap: 150000000,
      allocated_cap: 1250000,
      potential_rate_min: 4.5,
      potential_rate_max: 6.2,
      rate_disclaimer: 'Scénario indicatif non garanti : les performances passées ou cibles ne constituent en aucun cas une promesse de rendement.',
      conditions_text: 'Souscription ouverte aux comptes InvestMarket actifs. Engagement contractuel sur la durée choisie.',
      exit_rules: 'Sortie normale à l’échéance. Sortie anticipée soumise à préavis de 15 jours ouvrés et frais de désengagement de 1,5 % selon liquidité du marché.',
      renewal_rules: 'Renouvellement manuel sur instruction explicite de l’investisseur à l’échéance.',
      durations: [
        ['3 mois (90 jours)', 'court', 90, 12, 3],
        ['6 mois (180 jours)', 'moyen', 180, 26, 6],
        ['12 mois (365 jours)', 'long', 365, 52, 12],
      ],
    },
    {
      code: 'IM-INFRA-TG',
      name: 'Infrastructures Logistiques & Énergie Solaire',
      slug: 'infrastructures-logistiques-energie',
      category: 'Moyen & Long Terme · Actifs Réels',
      summary: 'Financement structuré de projets d’électrification solaire et de plateformes logistiques au Togo et en Afrique de l’Ouest.',
      description: 'Investissement dédié à l’accompagnement de projets d’infrastructures productives (centrales photovoltaïques décentralisées, entrepôts portuaires et chaînes du froid) adossés à des contrats d’exploitation pluriannuels.',
      objective: 'Financement de l’économie réelle régionale avec distribution potentielle à l’échéance selon la performance effective des actifs.',
      min_amount: 100000,
      max_amount: 25000000,
      step_amount: 25000,
      daily_limit: 10000000,
      user_limit: 30000000,
      fee_percent: 1.5,
      fee_fixed: 1000,
      risk_level: 'Modéré à Élevé',
      status: 'active',
      visibility: 'public',
      available_cap: 300000000,
      allocated_cap: 2500000,
      potential_rate_min: 6.0,
      potential_rate_max: 9.5,
      rate_disclaimer: 'Performance potentielle non garantie. Comporte un risque de perte partielle en capital et d’illiquidité pendant la durée du projet.',
      conditions_text: 'Réservé aux investisseurs majeurs résidant en zone UEMOA avec compte actif et acceptation de la notice d’information.',
      exit_rules: 'Blocage des fonds jusqu’à la date d’échéance contractuelle afin de préserver l’exécution des chantiers d’infrastructure.',
      renewal_rules: 'Clôture automatique à l’échéance avec virement sur le solde disponible, ou réinvestissement sur nouvelle tranche disponible.',
      durations: [
        ['6 mois (180 jours)', 'moyen', 180, 26, 6],
        ['12 mois (365 jours)', 'long', 365, 52, 12],
        ['24 mois (730 jours)', 'long', 730, 104, 24],
      ],
    },
    {
      code: 'IM-IMMO-LOME',
      name: 'Foncier & Immobilier Locatif Lomé',
      slug: 'immobilier-locatif-lome',
      category: 'Long Terme · Immobilier Commercial',
      summary: 'Participation à des opérations immobilières commerciales et résidentielles encadrées dans le Grand Lomé.',
      description: 'Ce programme regroupe des actifs immobiliers locatifs professionnels situés dans les pôles économiques de Lomé, sélectionnés après audit foncier notarié et étude de demande locative.',
      objective: 'Valorisation patrimoniale à moyen-long terme et perception potentielle de revenus issus des baux commerciaux.',
      min_amount: 250000,
      max_amount: 50000000,
      step_amount: 50000,
      daily_limit: 15000000,
      user_limit: 50000000,
      fee_percent: 1.5,
      fee_fixed: 0,
      risk_level: 'Élevé',
      status: 'active',
      visibility: 'public',
      available_cap: 500000000,
      allocated_cap: 0,
      potential_rate_min: 7.0,
      potential_rate_max: 11.0,
      rate_disclaimer: 'Aucune garantie de rendement ni de liquidité immédiate. Risque lié au taux d’occupation locative et à la valorisation immobilière.',
      conditions_text: 'Compte actif requis et validation de la fiche de risques immobiliers avant toute souscription.',
      exit_rules: 'Sortie possible uniquement à l’échéance contractuelle ou par cession de créance encadrée après période de carence de 6 mois.',
      renewal_rules: 'Prorogation possible de 12 mois sur accord écrit des parties 30 jours avant l’échéance.',
      durations: [
        ['12 mois (365 jours)', 'long', 365, 52, 12],
        ['18 mois (540 jours)', 'long', 540, 78, 18],
        ['36 mois (1095 jours)', 'long', 1095, 156, 36],
      ],
    },
    {
      code: 'IM-PME-AGRO',
      name: 'PME & Chaînes de Valeur Agricoles',
      slug: 'pme-chaines-valeur-agricoles',
      category: 'Court Terme · Financement Campagne',
      summary: 'Accompagnement de campagnes de transformation agro-alimentaire et de négoce certifié au Togo.',
      description: 'Financement de cycles de campagne courts pour des coopératives et PME de transformation agricole (soja, anacarde, karité) disposant de contrats d’enlèvement préalables.',
      objective: 'Soutien au fonds de roulement de campagnes agricoles sur des cycles de quelques semaines à quelques mois.',
      min_amount: 10000,
      max_amount: 5000000,
      step_amount: 5000,
      daily_limit: 2500000,
      user_limit: 10000000,
      fee_percent: 1.0,
      fee_fixed: 250,
      risk_level: 'Élevé',
      status: 'active',
      visibility: 'public',
      available_cap: 75000000,
      allocated_cap: 0,
      potential_rate_min: 5.0,
      potential_rate_max: 8.5,
      rate_disclaimer: 'Investissement exposé aux aléas climatiques, logistiques et commerciaux. Capital et performance non garantis.',
      conditions_text: 'Souscription ouverte dès 10 000 FCFA aux comptes actifs.',
      exit_rules: 'Dénouement à la fin du cycle de campagne agricole (échéance fixe).',
      renewal_rules: 'Pas de reconduction tacite ; nouvelle souscription requise pour la campagne suivante.',
      durations: [
        ['4 semaines (28 jours)', 'court', 28, 4, 0],
        ['3 mois (90 jours)', 'court', 90, 12, 3],
        ['6 mois (180 jours)', 'moyen', 180, 26, 6],
      ],
    },
  ];

  for (const p of plans) {
    const res = insertPlan.run(
      p.code, p.name, p.slug, p.category, p.summary, p.description, p.objective,
      p.min_amount, p.max_amount, p.step_amount, p.daily_limit, p.user_limit,
      p.fee_percent, p.fee_fixed, p.risk_level, p.status, p.visibility,
      p.available_cap, p.allocated_cap, p.potential_rate_min, p.potential_rate_max,
      p.rate_disclaimer, p.conditions_text, p.exit_rules, p.renewal_rules
    );
    const planId = Number(res.lastInsertRowid);
    for (const d of p.durations) {
      insertDuration.run(planId, d[0], d[1], d[2], d[3], d[4]);
    }
    insertPlanVersion.run(planId, JSON.stringify(p), adminId);
  }

  // Seed historical verified investments & ledger entries for demo investor
  const plan1 = db.prepare('SELECT id FROM investment_plans WHERE code = ?').get('IM-TRESOR-CT') as { id: number };
  const dur1 = db.prepare('SELECT id FROM investment_plan_durations WHERE plan_id = ? AND days = 180').get(plan1.id) as { id: number };
  const plan2 = db.prepare('SELECT id FROM investment_plans WHERE code = ?').get('IM-INFRA-TG') as { id: number };
  const dur2 = db.prepare('SELECT id FROM investment_plan_durations WHERE plan_id = ? AND days = 365').get(plan2.id) as { id: number };

  // Matured investment + active investment
  const invMaturedRes = db.prepare(`
    INSERT INTO investments (reference, user_id, plan_id, plan_version, duration_id, duration_label, duration_days, amount, fee_amount, total_paid, potential_rate_min, potential_rate_max, status, start_date, end_date, exit_rules_snapshot, conditions_snapshot, settled_at)
    VALUES ('INV-2026-000001', ?, ?, 1, ?, '6 mois (180 jours)', 180, 250000, 3000, 253000, 4.5, 6.2, 'matured', datetime('now', '-190 days'), datetime('now', '-10 days'), 'Sortie normale à l’échéance.', 'Conditions acceptées à la souscription.', datetime('now', '-10 days'))
  `).run(invId, plan1.id, dur1.id);

  const invActiveRes = db.prepare(`
    INSERT INTO investments (reference, user_id, plan_id, plan_version, duration_id, duration_label, duration_days, amount, fee_amount, total_paid, potential_rate_min, potential_rate_max, status, start_date, end_date, exit_rules_snapshot, conditions_snapshot)
    VALUES ('INV-2026-000002', ?, ?, 1, ?, '12 mois (365 jours)', 365, 500000, 8500, 508500, 6.0, 9.5, 'active', datetime('now', '-30 days'), datetime('now', '+335 days'), 'Blocage contractuel jusqu’à l’échéance.', 'Notice signée et validée.')
  `).run(invId, plan2.id, dur2.id);

  const inv1Id = Number(invMaturedRes.lastInsertRowid);
  const inv2Id = Number(invActiveRes.lastInsertRowid);

  // Seed Payments, Transactions & Ledger Entries cleanly balanced
  const pay1 = db.prepare(`
    INSERT INTO payments (payment_reference, idempotency_key, transaction_id, investment_id, user_id, provider_code, phone_number, amount, fee_amount, total_amount, status, external_reference, confirmed_at)
    VALUES ('PAY-FLZ-2026-000001', 'seed-idem-1', 'TXN-2026-000001', ?, ?, 'flooz', '+22891234567', 250000, 3000, 253000, 'confirmed', 'FLZ-EXT-901244', datetime('now', '-190 days'))
  `).run(inv1Id, invId);

  const pay2 = db.prepare(`
    INSERT INTO payments (payment_reference, idempotency_key, transaction_id, investment_id, user_id, provider_code, phone_number, amount, fee_amount, total_amount, status, external_reference, confirmed_at)
    VALUES ('PAY-TMN-2026-000002', 'seed-idem-2', 'TXN-2026-000002', ?, ?, 'tmoney', '+22891234567', 500000, 8500, 508500, 'confirmed', 'TMN-EXT-441908', datetime('now', '-30 days'))
  `).run(inv2Id, invId);

  const insertTx = db.prepare(`
    INSERT INTO transactions (reference, user_id, investment_id, payment_id, type, direction, amount, status, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
  `);
  const insertLedger = db.prepare(`
    INSERT INTO ledger_entries (entry_reference, transaction_id, user_id, account_code, entry_type, amount, balance_after, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Tx 1: Deposit Flooz 253 000 -> Fee 3 000 -> Invest 250 000 -> Maturity Return 250 000
  const tx1 = Number(insertTx.run('TRX-2026-000001', invId, inv1Id, Number(pay1.lastInsertRowid), 'deposit', 'credit', 253000, 'Dépôt confirmé Flooz (+228 91 23 45 67)', '2026-05-10 10:00:00').lastInsertRowid);
  insertLedger.run('LDG-2026-000001', tx1, invId, 'USER_AVAILABLE', 'CREDIT', 253000, 253000, 'Réception paiement Flooz FLZ-EXT-901244', '2026-05-10 10:00:00');

  const tx2 = Number(insertTx.run('TRX-2026-000002', invId, inv1Id, Number(pay1.lastInsertRowid), 'fee', 'debit', 3000, 'Frais de structuration (IM-TRESOR-CT)', '2026-05-10 10:00:01').lastInsertRowid);
  insertLedger.run('LDG-2026-000002', tx2, invId, 'USER_AVAILABLE', 'DEBIT', 3000, 250000, 'Prélèvement frais de dossier', '2026-05-10 10:00:01');
  insertLedger.run('LDG-2026-000003', tx2, invId, 'PLATFORM_FEES', 'CREDIT', 3000, 3000, 'Produit frais de gestion plateforme', '2026-05-10 10:00:01');

  const tx3 = Number(insertTx.run('TRX-2026-000003', invId, inv1Id, Number(pay1.lastInsertRowid), 'investment', 'debit', 250000, 'Souscription INV-2026-000001', '2026-05-10 10:00:02').lastInsertRowid);
  insertLedger.run('LDG-2026-000004', tx3, invId, 'USER_AVAILABLE', 'DEBIT', 250000, 0, 'Affectation vers INV-2026-000001', '2026-05-10 10:00:02');
  insertLedger.run('LDG-2026-000005', tx3, invId, 'USER_INVESTED', 'CREDIT', 250000, 250000, 'Capital engagé INV-2026-000001', '2026-05-10 10:00:02');

  const tx4 = Number(insertTx.run('TRX-2026-000004', invId, inv1Id, null, 'refund', 'credit', 250000, 'Dénouement à l’échéance INV-2026-000001 (Capital)', '2026-11-06 09:00:00').lastInsertRowid);
  insertLedger.run('LDG-2026-000006', tx4, invId, 'USER_INVESTED', 'DEBIT', 250000, 0, 'Clôture à l’échéance INV-2026-000001', '2026-11-06 09:00:00');
  insertLedger.run('LDG-2026-000007', tx4, invId, 'USER_AVAILABLE', 'CREDIT', 250000, 250000, 'Mise à disposition capital échu INV-2026-000001', '2026-11-06 09:00:00');

  // Tx 5-7: Active investment TMoney
  const tx5 = Number(insertTx.run('TRX-2026-000005', invId, inv2Id, Number(pay2.lastInsertRowid), 'deposit', 'credit', 508500, 'Dépôt confirmé TMoney (+228 91 23 45 67)', '2026-10-17 14:20:00').lastInsertRowid);
  insertLedger.run('LDG-2026-000008', tx5, invId, 'USER_AVAILABLE', 'CREDIT', 508500, 758500, 'Réception paiement TMoney TMN-EXT-441908', '2026-10-17 14:20:00');

  const tx6 = Number(insertTx.run('TRX-2026-000006', invId, inv2Id, Number(pay2.lastInsertRowid), 'fee', 'debit', 8500, 'Frais de structuration (IM-INFRA-TG)', '2026-10-17 14:20:01').lastInsertRowid);
  insertLedger.run('LDG-2026-000009', tx6, invId, 'USER_AVAILABLE', 'DEBIT', 8500, 750000, 'Prélèvement frais de dossier', '2026-10-17 14:20:01');
  insertLedger.run('LDG-2026-000010', tx6, invId, 'PLATFORM_FEES', 'CREDIT', 8500, 11500, 'Produit frais de gestion plateforme', '2026-10-17 14:20:01');

  const tx7 = Number(insertTx.run('TRX-2026-000007', invId, inv2Id, Number(pay2.lastInsertRowid), 'investment', 'debit', 500000, 'Souscription INV-2026-000002', '2026-10-17 14:20:02').lastInsertRowid);
  insertLedger.run('LDG-2026-000011', tx7, invId, 'USER_AVAILABLE', 'DEBIT', 500000, 250000, 'Affectation vers INV-2026-000002', '2026-10-17 14:20:02');
  insertLedger.run('LDG-2026-000012', tx7, invId, 'USER_INVESTED', 'CREDIT', 500000, 500000, 'Capital engagé INV-2026-000002', '2026-10-17 14:20:02');

  // Seed Notifications & Documents
  const insertNotif = db.prepare('INSERT INTO notifications (user_id, title, message, category, is_read, action_url) VALUES (?, ?, ?, ?, ?, ?)');
  insertNotif.run(invId, 'Bienvenue sur InvestMarket', 'Votre compte investisseur est actif et prêt pour vos opérations.', 'account', 1, '/dashboard');
  insertNotif.run(invId, 'Investissement arrivé à échéance', 'L’opération INV-2026-000001 (250 000 FCFA) est arrivée à terme. Le relevé d’échéance est disponible.', 'maturity', 0, '/dashboard/investissements');
  insertNotif.run(invId, 'Transaction confirmée', 'Votre souscription INV-2026-000002 de 500 000 FCFA via TMoney a été enregistrée.', 'payment', 0, '/dashboard/transactions');

  const insertDoc = db.prepare('INSERT INTO documents (reference, user_id, investment_id, plan_id, title, doc_type, content_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertDoc.run('DOC-2026-000001', invId, inv1Id, plan1.id, 'Relevé d’échéance — INV-2026-000001', 'statement', JSON.stringify({
    reference: 'INV-2026-000001',
    planName: 'Obligations & Trésorerie UEMOA',
    amount: 250000,
    fee: 3000,
    currency: 'XOF',
    status: 'Arrivé à échéance — Capital restitué sur solde disponible',
    settledAt: '2026-11-06',
  }));
  insertDoc.run('DOC-2026-000002', invId, inv2Id, plan2.id, 'Reçu de souscription — INV-2026-000002', 'receipt', JSON.stringify({
    reference: 'INV-2026-000002',
    planName: 'Infrastructures Logistiques & Énergie Solaire',
    amount: 500000,
    fee: 8500,
    totalPaid: 508500,
    provider: 'TMoney (Togocom)',
    externalRef: 'TMN-EXT-441908',
    currency: 'XOF',
  }));

  // Seed CMS Content
  const insertCms = db.prepare('INSERT INTO cms_contents (key, section, title, content_json, updated_by) VALUES (?, ?, ?, ?, ?)');
  insertCms.run('site_identity', 'Général', 'Identité & Coordonnées', JSON.stringify({
    brandName: 'InvestMarket',
    tagline: 'Une plateforme d’investissement pensée pour une gestion transparente et structurée.',
    email: 'contact@investmarket.tg',
    phone: '+228 22 21 00 00',
    address: 'Boulevard du 13 Janvier, Quartier Administratif, Lomé, Togo',
    announcement: 'Les souscriptions sont ouvertes en FCFA (XOF) via TMoney (93736916) et Flooz (97172729).',
  }), adminId);

  insertCms.run('risk_warning', 'Conformité', 'Avertissement sur les risques', JSON.stringify({
    bannerText: 'Avertissement : tout investissement comporte des risques, y compris un risque de perte partielle ou totale en capital et d’illiquidité. Les performances éventuelles présentées ne sont jamais garanties.',
    fullText: 'InvestMarket présente des opportunités d’investissement structurées soumises aux aléas économiques, sectoriels et de marché. Avant toute souscription, l’investisseur doit vérifier l’adéquation du produit à sa situation financière, lire les conditions contractuelles et comprendre que ni le capital ni le rendement ne sont garantis sauf mention légale expresse contraire.',
  }), adminId);

  insertCms.run('about_content', 'À propos', 'Présentation d’InvestMarket', JSON.stringify({
    whoWeAre: 'InvestMarket est une plateforme technologique et financière basée à Lomé (Togo), dédiée à la structuration, la distribution transparente et le suivi rigoureux d’opportunités d’investissement en Afrique de l’Ouest (zone UEMOA).',
    mission: 'Rendre l’investissement structuré accessible, lisible et traçable pour les épargnants et investisseurs qualifiés grâce aux solutions de paiement locales (Flooz, TMoney) et à une gouvernance documentaire stricte.',
    vision: 'Bâtir un standard régional de confiance où chaque franc CFA engagé repose sur un contrat clair, un registre comptable vérifiable et une transparence totale sur les risques comme sur les frais.',
    sectors: ['Titres publics et trésorerie UEMOA', 'Infrastructures logistiques et énergie solaire', 'Immobilier commercial et locatif encadré', 'Chaînes de valeur agro-industrielles'],
    approach: 'Sélection rigoureuse des dossiers, ségrégation des flux financiers, traçabilité des transactions et suivi calendaire automatisé jusqu’à l’échéance.',
    commitments: 'Traçabilité complète par grand livre financier, journal d’audit immuable, aucune promesse de gain irréaliste et protection stricte des données personnelles.',
  }), adminId);

  insertCms.run('faq_items', 'FAQ', 'Questions Fréquentes', JSON.stringify([
    {
      q: 'Quels moyens de paiement sont acceptés sur InvestMarket ?',
      a: 'Les souscriptions sont principalement réglées en FCFA (XOF) via Flooz (97172729) et TMoney (93736916). Le virement bancaire UEMOA est également pris en charge et l’architecture permet d’intégrer ultérieurement d’autres moyens de paiement.',
    },
    {
      q: 'Les rendements affichés sont-ils garantis ?',
      a: 'Non. Conformément aux règles de transparence d’InvestMarket, aucune performance n’est garantie. Les fourchettes indicatives éventuellement présentées s’accompagnent systématiquement des facteurs de risque et des conditions contractuelles applicables.',
    },
    {
      q: 'Comment fonctionne un dépôt par TMoney ou Flooz ?',
      a: 'Vous effectuez votre transfert directement vers le numéro officiel TMoney (93736916) ou Flooz (97172729), puis vous saisissez la référence SMS du transfert. L’équipe Finance valide la réception pour activer votre investissement ou créditer votre solde.',
    },
    {
      q: 'Puis-je suivre mes frais et mes mouvements financiers ?',
      a: 'Oui. Chaque opération (dépôt, frais, souscription, échéance, retrait) génère une écriture traçable dans votre historique et un justificatif consultable dans vos documents.',
    },
  ]), adminId);

  insertCms.run('legal_texts', 'Juridique', 'Mentions & Conditions', JSON.stringify({
    terms: 'Les présentes Conditions Générales régissent l’utilisation de la plateforme InvestMarket. Toute souscription vaut acceptation sans réserve des conditions particulières du produit sélectionné, de la grille tarifaire en FCFA (XOF) et des avertissements sur les risques. Avant toute collecte réelle de fonds auprès du public, la structure émettrice s’assure de l’obtention des visas et agréments réglementaires requis dans la juridiction UEMOA.',
    privacy: 'Les données personnelles sont collectées exclusivement pour la gestion du compte et l’exécution traçable des opérations financières. Elles sont chiffrées et accessibles uniquement aux personnels habilités.',
  }), adminId);

  // Initial audit log
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_email, actor_role, action, entity_type, entity_id, details_json, result, ip_address)
    VALUES (?, 'system@investmarket.tg', 'super_admin', 'SYSTEM_BOOTSTRAP', 'database', 'init', '{"message":"Initialisation du schéma relationnel InvestMarket"}', 'succès', '127.0.0.1')
  `).run(adminId);
}

function ensureAdminRolesAndSettings(): void {
  // Ensure offer_manager and auditor roles exist even on migrated DBs
  const ensureRole = (code: string, name: string, desc: string, permsList: string[]) => {
    let role = db.prepare('SELECT id FROM roles WHERE code = ?').get(code) as { id: number } | undefined;
    if (!role) {
      const res = db.prepare('INSERT INTO roles (code, name, description) VALUES (?, ?, ?)').run(code, name, desc);
      role = { id: Number(res.lastInsertRowid) };
    }
    for (const pCode of permsList) {
      const p = db.prepare('SELECT id FROM permissions WHERE code = ?').get(pCode) as { id: number } | undefined;
      if (p) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(role.id, p.id);
      }
    }
  };

  ensureRole('offer_manager', "Gestionnaire d'offres", 'Accès uniquement aux offres et contenus associés.', ['admin:dashboard', 'offers:manage', 'cms:edit']);
  ensureRole('auditor', 'Auditeur', 'Accès en lecture aux journaux d’audit, grand livre et rapports.', ['admin:dashboard', 'audit:read', 'ledger:read', 'reports:export']);

  // Ensure finance@investmarket.tg exists on pre-existing migrated DBs
  const hasFinance = db.prepare("SELECT id FROM users WHERE lower(email) = 'finance@investmarket.tg'").get();
  if (!hasFinance) {
    const finRole = db.prepare("SELECT id FROM roles WHERE code = 'finance'").get() as { id: number } | undefined;
    const superAdmin = db.prepare("SELECT id FROM users WHERE lower(email) = 'admin@investmarket.tg'").get() as { id: number } | undefined;
    if (finRole) {
      const finRes = db.prepare(`
        INSERT INTO users (email, phone, password_hash, role_id, email_verified, phone_verified, two_factor_enabled, status)
        VALUES ('finance@investmarket.tg', '+22890000003', ?, ?, 1, 1, 0, 'active')
      `).run(hashPassword('Finance@2026!'), finRole.id);
      const finId = Number(finRes.lastInsertRowid);
      db.prepare(`
        INSERT INTO profiles (user_id, first_name, last_name, birth_date, address, city, country, profession)
        VALUES (?, 'Yao', 'Tettekpo', '1987-02-22', 'Boulevard du Mono', 'Lomé', 'Togo', 'Responsable Trésorerie & Finance')
      `).run(finId);
      db.prepare('INSERT INTO admin_users (user_id, department, pin_hash, assigned_by) VALUES (?, ?, ?, ?)').run(
        finId,
        'Finance & Trésorerie',
        hashPassword('7391'),
        superAdmin?.id || finId
      );
    }
  }

  // Ensure existing seeded admins have personal hashed PINs if missing
  const admins = db.prepare(`
    SELECT a.id, a.pin_hash, u.email FROM admin_users a JOIN users u ON u.id = a.user_id
  `).all() as Array<{ id: number; pin_hash: string | null; email: string }>;
  for (const a of admins) {
    if (!a.pin_hash) {
      const defaultPin = a.email.includes('compliance') ? '4589' : a.email.includes('finance') ? '7391' : '2026';
      db.prepare('UPDATE admin_users SET pin_hash = ? WHERE id = ?').run(hashPassword(defaultPin), a.id);
    }
  }

  // Ensure platform_settings exists in cms_contents
  const hasSettings = db.prepare("SELECT key FROM cms_contents WHERE key = 'platform_settings'").get();
  if (!hasSettings) {
    db.prepare(`
      INSERT INTO cms_contents (key, section, title, content_json)
      VALUES ('platform_settings', 'Paramètres', 'Paramètres généraux et maintenance', ?)
    `).run(JSON.stringify({
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
    }));
  }

  // Clean up any pre-existing KYC texts in migrated DBs
  db.prepare(`UPDATE roles SET description = 'Contrôles de conformité, suspension de comptes et journal d’audit.' WHERE code = 'compliance'`).run();
  db.prepare(`UPDATE investment_plans SET conditions_text = 'Souscription ouverte aux comptes InvestMarket actifs. Engagement contractuel sur la durée choisie.' WHERE conditions_text LIKE '%KYC%' OR conditions_text LIKE '%vérification d’identité%'`).run();
  db.prepare(`UPDATE investments SET conditions_snapshot = 'Conditions acceptées à la souscription.' WHERE conditions_snapshot LIKE '%KYC%'`).run();
  db.prepare(`UPDATE notifications SET message = 'Votre compte investisseur est actif et prêt pour vos opérations.', action_url = '/dashboard' WHERE message LIKE '%KYC%' OR action_url = '/verification'`).run();

  const siteIdRow = db.prepare("SELECT content_json FROM cms_contents WHERE key = 'site_identity'").get() as { content_json: string } | undefined;
  if (siteIdRow && siteIdRow.content_json.includes('KYC')) {
    const parsed = JSON.parse(siteIdRow.content_json);
    parsed.announcement = 'Les souscriptions sont ouvertes en FCFA (XOF) via TMoney (93736916) et Flooz (97172729).';
    db.prepare("UPDATE cms_contents SET content_json = ? WHERE key = 'site_identity'").run(JSON.stringify(parsed));
  }

  const aboutRow = db.prepare("SELECT content_json FROM cms_contents WHERE key = 'about_content'").get() as { content_json: string } | undefined;
  if (aboutRow && (aboutRow.content_json.includes('KYC') || aboutRow.content_json.includes('vérification systématique'))) {
    const parsed = JSON.parse(aboutRow.content_json);
    parsed.approach = 'Sélection rigoureuse des dossiers, ségrégation des flux financiers, traçabilité des transactions et suivi calendaire automatisé jusqu’à l’échéance.';
    db.prepare("UPDATE cms_contents SET content_json = ? WHERE key = 'about_content'").run(JSON.stringify(parsed));
  }

  const faqRow = db.prepare("SELECT content_json FROM cms_contents WHERE key = 'faq_items'").get() as { content_json: string } | undefined;
  if (faqRow && (faqRow.content_json.includes('KYC') || faqRow.content_json.includes('cryptographique'))) {
    const cleanedFaq = [
      {
        q: 'Quels moyens de paiement sont acceptés sur InvestMarket ?',
        a: 'Les souscriptions sont principalement réglées en FCFA (XOF) via Flooz (97172729) et TMoney (93736916). Le virement bancaire UEMOA est également pris en charge.',
      },
      {
        q: 'Les rendements affichés sont-ils garantis ?',
        a: 'Non. Conformément aux règles de transparence d’InvestMarket, aucune performance n’est garantie. Les fourchettes indicatives éventuellement présentées s’accompagnent systématiquement des facteurs de risque et des conditions contractuelles applicables.',
      },
      {
        q: 'Comment fonctionne un dépôt par TMoney ou Flooz ?',
        a: 'Vous effectuez votre transfert directement vers le numéro officiel TMoney (93736916) ou Flooz (97172729), puis vous saisissez la référence SMS du transfert. L’équipe Finance valide la réception pour activer votre investissement ou créditer votre solde.',
      },
      {
        q: 'Puis-je suivre mes frais et mes mouvements financiers ?',
        a: 'Oui. Chaque opération (dépôt, frais, souscription, échéance, retrait) génère une écriture traçable dans votre historique et un justificatif consultable dans vos documents.',
      },
    ];
    db.prepare("UPDATE cms_contents SET content_json = ? WHERE key = 'faq_items'").run(JSON.stringify(cleanedFaq));
  }

  const legalRow = db.prepare("SELECT content_json FROM cms_contents WHERE key = 'legal_texts'").get() as { content_json: string } | undefined;
  if (legalRow && legalRow.content_json.includes('KYC')) {
    const parsed = JSON.parse(legalRow.content_json);
    parsed.privacy = 'Les données personnelles sont collectées exclusivement pour la gestion du compte et l’exécution traçable des opérations financières. Elles sont chiffrées et accessibles uniquement aux personnels habilités.';
    db.prepare("UPDATE cms_contents SET content_json = ? WHERE key = 'legal_texts'").run(JSON.stringify(parsed));
  }
}
