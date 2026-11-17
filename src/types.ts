export interface PlanDuration {
  id: number;
  plan_id: number;
  label: string;
  duration_type: 'court' | 'moyen' | 'long';
  days: number;
  weeks: number;
  months: number;
  is_active: number;
}

export interface InvestmentPlan {
  id: number;
  code: string;
  name: string;
  slug: string;
  category: string;
  summary: string;
  description: string;
  objective: string;
  min_amount: number;
  max_amount: number;
  step_amount: number;
  daily_limit: number;
  user_limit: number;
  fee_percent: number;
  fee_fixed: number;
  risk_level: string;
  status: string;
  visibility: string;
  scheduled_start_at?: string | null;
  expires_at?: string | null;
  available_cap: number;
  allocated_cap: number;
  potential_rate_min: number | null;
  potential_rate_max: number | null;
  rate_disclaimer: string;
  conditions_text: string;
  exit_rules: string;
  renewal_rules: string;
  version: number;
  created_by_email?: string | null;
  updated_by_email?: string | null;
  created_at?: string;
  updated_at?: string;
  durations: PlanDuration[];
  versions?: Array<{ id: number; version: number; change_reason: string; created_at: string; changed_by_email?: string }>;
  documents?: Array<{ id: number; reference: string; title: string; doc_type: string; content_json?: string; created_at: string }>;
}

export interface PaymentProvider {
  code: string;
  name: string;
  country: string;
  currency: string;
  is_active: number;
  fee_percent: number;
  receiving_account?: string;
  receiving_name?: string;
  instructions: string;
  config_status: string;
}

export interface UserProfile {
  id: number;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  address?: string | null;
  city?: string | null;
  country: string;
  profession?: string | null;
  roleCode: string;
  roleName: string;
  permissions: string[];
  isAdminSession?: boolean;
  two_factor_enabled: number;
  unreadNotifications: number;
  status: string;
  created_at: string;
}

export interface CalculatorResult {
  plan: {
    id: number;
    code: string;
    name: string;
    slug: string;
    riskLevel: string;
    feePercent: number;
    feeFixed: number;
    conditionsText: string;
    exitRules: string;
    renewalRules: string;
    rateDisclaimer: string;
    dailyLimit: number;
    userLimit: number;
    remainingCap: number;
  };
  duration: {
    id: number;
    label: string;
    durationType: string;
    days: number;
    weeks: number;
    months: number;
  };
  amount: number;
  feeAmount: number;
  totalAmount: number;
  currency: string;
  estimatedStartDate: string;
  estimatedMaturityDate: string;
  potentialScenarioMin: number | null;
  potentialScenarioMax: number | null;
  disclaimer: string;
}

export interface PlatformSettings {
  companyName: string;
  logoText: string;
  logoUrl?: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  adminInactivityMinutes: number;
  maxLoginAttempts: number;
  dualApprovalThreshold: number;
  notificationsEnabled: boolean;
}

export interface CmsContents {
  site_identity?: {
    brandName: string;
    tagline: string;
    email: string;
    phone: string;
    address: string;
    announcement: string;
  };
  platform_settings?: PlatformSettings;
  risk_warning?: {
    bannerText: string;
    fullText: string;
  };
  about_content?: {
    whoWeAre: string;
    mission: string;
    vision: string;
    sectors: string[];
    approach: string;
    commitments: string;
  };
  faq_items?: Array<{ q: string; a: string }>;
  legal_texts?: {
    terms: string;
    privacy: string;
  };
}
