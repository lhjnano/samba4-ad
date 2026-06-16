// ── Auth ───────────────────────────────────────────
export interface UserInfo {
  username: string;
  display_name: string;
  email: string | null;
  role: string;
  groups: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserInfo;
}

// ── Setup ──────────────────────────────────────────
export interface SetupStatus {
  provisioned: boolean;
  domain_name?: string;
  netbios_name?: string;
  server_role?: string;
  forest_level?: string;
 realm_dns?: string;
}

export interface ProvisionRequest {
  domain_name: string;
  netbios_name: string;
  admin_password: string;
  dns_forwarder?: string;
}

export interface ProvisionResult {
  success: boolean;
  message: string;
  domain_name?: string;
  netbios_name?: string;
  steps?: ProvisionStep[];
}

export interface ProvisionStep {
  name: string;
  status: "pending" | "running" | "done" | "failed";
  message?: string;
}

// ── Dashboard ──────────────────────────────────────
export interface DashboardStats {
  total_users: number;
  active_users: number;
  total_groups: number;
  total_computers: number;
  total_ous: number;
  total_gpos: number;
  domain_functional_level: string;
  forest_functional_level: string;
  domain_controllers: string[];
}

export interface LoginTrendPoint {
  date: string;
  count: number;
}

export interface OUDistribution {
  ou: string;
  user_count: number;
}

export interface RecentAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
}

export interface SystemHealth {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  uptime: string;
}

export interface ServicesStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  port?: number;
  detail?: string;
}

// ── Users ──────────────────────────────────────────
export interface ADUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  department: string;
  title: string;
  enabled: boolean;
  locked: boolean;
  ou: string;
  last_logon: string | null;
  created_at: string;
  member_of: string[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Groups ─────────────────────────────────────────
export interface ADGroup {
  id: string;
  name: string;
  description: string;
  group_type: string;
  scope: string;
  member_count: number;
  ou: string;
  created_at: string;
}

// ── Computers ──────────────────────────────────────
export interface ADComputer {
  id: string;
  hostname: string;
  os: string;
  ou: string;
  enabled: boolean;
  last_logon: string | null;
  ip_address: string | null;
}

// ── OUs ────────────────────────────────────────────
export interface ADOU {
  id: string;
  name: string;
  dn: string;
  description: string;
  child_ous: number;
  user_count: number;
  computer_count: number;
  gpo_links: string[];
}

// ── GPOs ───────────────────────────────────────────
export interface GPO {
  id: string;
  name: string;
  dn: string;
  description: string;
  status: "enabled" | "disabled" | "all_settings_disabled";
  links: string[];
  created: string;
  modified: string;
  computer_version: number;
  user_version: number;
}

// ── Domain Policy ──────────────────────────────────
export interface DomainPolicy {
  complex_passwords: boolean;
  min_password_length: number;
  password_history: number;
  max_password_age_days: number;
  min_password_age_days: number;
  account_lockout_threshold: number;
  account_lockout_duration_minutes: number;
  reset_lockout_after_minutes: number;
}

// ── DNS ────────────────────────────────────────────
export interface DNSZone {
  name: string;
  zone_type: string;
  serial: number;
  records: DNSRecord[];
}

export interface DNSRecord {
  name: string;
  type: string;
  value: string;
  ttl: number;
}
