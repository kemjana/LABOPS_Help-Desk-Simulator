export type Category = 'AD_ACCOUNTS' | 'GPO' | 'DNS_DHCP' | 'FILE_SHARES' | 'SECURITY';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type LabMode = 'lightweight' | 'enterprise';
export type TicketStatus = 'open' | 'in_progress' | 'reopened' | 'resolved' | 'archived';
export const OPEN_STATUSES: TicketStatus[] = ['open', 'in_progress', 'reopened'];
export const CATEGORIES: Category[] = ['AD_ACCOUNTS', 'GPO', 'DNS_DHCP', 'FILE_SHARES', 'SECURITY'];
export const CATEGORY_LABEL: Record<Category, string> = {
  AD_ACCOUNTS: 'AD Accounts', GPO: 'Group Policy', DNS_DHCP: 'DNS / DHCP', FILE_SHARES: 'File Shares', SECURITY: 'Security',
};
export const TIER: Record<Difficulty, string> = { easy: 'Tier 1', medium: 'Tier 2', hard: 'Tier 3' };

export interface LabEnv {
  id: string; user_id: string; lab_name: string; domain_name: string; subnet_cidr: string;
  gateway_ip: string; dc_ip: string; fs_ip: string; lab_mode: LabMode;
  setup_completed: boolean; setup_progress: Record<string, boolean>;
}
export interface RosterUser {
  id: string; env_id: string; user_id: string; full_name: string; username: string;
  department: string; job_title: string; ou_path: string; is_active: boolean;
}
/** Everything the browser may see about a ticket. NEVER add expected_root_cause or rubric here. */
export interface PublicTicket {
  id: string; ticket_code: string; blueprint_id: string; category: Category; difficulty: Difficulty; tier: string;
  priority: string; points: number; suggested_minutes: number; requester_name: string; requester_username: string;
  department: string; affected_host: string; subject: string; description: string; proof_prompt: string;
  status: TicketStatus; attempts_count: number; max_hint_level: number; ai_feedback: string | null;
  reopen_message: string | null; points_awarded: number; play_mode: 'console' | 'vm' | null; solved_mode: 'console' | 'vm' | null; console_ready?: boolean; script_ready?: boolean; source: 'normal' | 'spaced'; checkpoints_done: string[]; exam_tags?: string[]; checkpoint_total?: number; season_no: number; created_at: string;
  started_at: string | null; resolved_at: string | null; reported: boolean;
}
export const PUBLIC_TICKET_COLUMNS =
  'id,ticket_code,blueprint_id,category,difficulty,tier,priority,points,suggested_minutes,requester_name,requester_username,department,affected_host,subject,description,proof_prompt,status,attempts_count,max_hint_level,ai_feedback,reopen_message,points_awarded,play_mode,solved_mode,source,checkpoints_done,season_no,created_at,started_at,resolved_at,reported';
