// Concept labels, practice advice and exam-topic tags (topic-aligned only, not official exam content).
import { BLUEPRINTS } from './blueprints';
import type { Blueprint } from './blueprints/types';

export const humanConcept = (c: string) => ({ 'lab-proof': 'lab-specific evidence', 'lab-state': 'fixing the lab' } as Record<string, string>)[c] ?? c.replace(/-/g, ' ');

const PRACTICE: Record<string, string> = {
  'account-lockout': 'Practice unlocking accounts and checking why they lock (Get-ADUser -Properties LockedOut).',
  'lockout-source-tracing': 'Practice reading Security event 4740 on the domain controller to find the caller computer.',
  'stale-credentials': 'Practice finding saved passwords (cmdkey /list, Credential Manager) that keep retrying an old password.',
  'password-reset': 'Practice resetting a password with Set-ADAccountPassword -Reset.',
  'force-change-at-logon': 'Practice forcing a password change at next sign-in (ChangePasswordAtLogon).',
  'identity-verification': 'Say how you would verify who is asking before any reset: callback, manager approval, ticket.',
  'ou-placement': 'Practice finding and using the right OU path (Get-ADOrganizationalUnit).',
  'group-membership': 'Practice giving access through groups, not single users (Add-ADGroupMember).',
  'gpo-diagnostics': 'Practice gpresult /r, gpupdate /force and the Group Policy Results wizard.',
  'gpo-link-scope': 'Practice where a GPO is linked and which objects (users or computers) live under that OU.',
  'dhcp-options': 'Practice DHCP options: 003 router and 006 DNS servers.',
  'dhcp-renew-verify': 'Practice ipconfig /release, /renew and checking the new lease.',
  'apipa-meaning': 'Remember: 169.254.x.x means the client could not get a DHCP lease.',
  'client-dns-config': 'Practice reading ipconfig /all and fixing the DNS server of a domain-joined PC.',
  'dns-testing': 'Practice nslookup and Resolve-DnsName, and flushing the cache with ipconfig /flushdns.',
  'ntfs-vs-share-perms': 'Practice how share and NTFS permissions combine: the most restrictive wins.',
  'agdlp': 'Practice account > global group > domain local group > permission (AGDLP).',
  'token-refresh': 'Remember: group changes only reach the user after a new sign-in.',
  'failed-logon-analysis': 'Practice events 4625 and 4771 and finding the source of failed sign-ins.',
  'incident-containment': 'Practice the order: contain, investigate, report.',
  'least-privilege': 'Practice removing unneeded rights and using named admin accounts.',
};
export const practiceText = (c: string) => PRACTICE[c] ?? `Redo a ticket tagged "${humanConcept(c)}" and re-read its hints and the "In real Windows" note.`;

export const EXAM_NOTE = 'Exam tags show topic alignment only. LabOps is not official exam content and is not affiliated with CompTIA or Microsoft.';
const BY_CAT: Record<string, string[]> = {
  AD_ACCOUNTS: ['A+ Core 2', 'AZ-800'], GPO: ['AZ-800', 'A+ Core 2'], DNS_DHCP: ['Network+', 'AZ-800'], FILE_SHARES: ['A+ Core 2', 'AZ-800'], SECURITY: ['Security+', 'A+ Core 2'],
};
const OVERRIDE: Record<string, string[]> = { 'sec-phishing-compromise': ['Security+'], 'dns-apipa': ['Network+', 'A+ Core 2'], 'sec-failed-logon-spike': ['Security+', 'Network+'] };
export const examTags = (bp: Pick<Blueprint, 'id' | 'cat'>): string[] => OVERRIDE[bp.id] ?? BY_CAT[bp.cat];
export const EXAM_TAGS = ['A+ Core 2', 'Network+', 'Security+', 'AZ-800'];
export const blueprintsWithConcept = (c: string) => BLUEPRINTS.filter((b) => b.criteria.some((x) => x.concept === c));
