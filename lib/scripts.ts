// PowerShell script generator for "My own VM" mode.
// RULES: scripts come from FIXED templates only (never from Gemini). Every value is validated with a strict
// pattern AND escaped as a single-quoted PowerShell string, so a value can never become code.
import { HttpError } from './http';

export interface ScriptCtx {
  ticketCode: string; domain: string; netbios: string; dn: string; dcIp: string; prefix: string; scopeId: string;
  user: string; targetUser: string; targetDept: string; newName: string; newUser: string; dept: string; fshost: string; title: string;
}
export interface ScriptStep { vm: 'DC01' | 'WS01'; title: string; filename: string; body: string }
export interface ScriptDef { prepare: (c: ScriptCtx) => ScriptStep[]; undo: (c: ScriptCtx) => ScriptStep[]; objects: string; note?: string }

const RX: Record<keyof ScriptCtx, RegExp> = {
  ticketCode: /^INC-\d{4,5}$/, domain: /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?)+$/i, netbios: /^[A-Za-z0-9-]{1,15}$/,
  dn: /^(DC=[A-Za-z0-9-]+)(,DC=[A-Za-z0-9-]+)+$/, dcIp: /^\d{1,3}(\.\d{1,3}){3}$/, prefix: /^\d{1,3}(\.\d{1,3}){2}$/, scopeId: /^\d{1,3}(\.\d{1,3}){3}$/,
  user: /^[A-Za-z0-9._-]{1,20}$/, targetUser: /^[A-Za-z0-9._-]{1,20}$/, targetDept: /^[A-Za-z]{2,20}$/, newName: /^[A-Za-z][A-Za-z .'-]{1,38}$/, newUser: /^[A-Za-z0-9._-]{1,20}$/,
  dept: /^[A-Za-z]{2,20}$/, fshost: /^[A-Za-z0-9-]{1,15}$/, title: /^[A-Za-z0-9 ,.'()-]{1,60}$/,
};
export function validateCtx(c: ScriptCtx): ScriptCtx {
  for (const k of Object.keys(RX) as (keyof ScriptCtx)[]) if (!RX[k].test(String(c[k]))) throw new HttpError(400, `Cannot build a script: the value for ${k} is not safe or valid. Check Lab settings.`, 'script_value');
  return c;
}
/** Single-quoted PowerShell literal: only ' needs escaping (doubled). */
export const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

const header = (c: ScriptCtx, kind: 'PREPARE' | 'UNDO', vm: string, objects: string, extra = '') => `<#
  LABOPS ${kind} SCRIPT  |  ${c.ticketCode}  |  ${c.title}
  RUN ON: ${vm}   (open PowerShell as Administrator)
  LAB ONLY: this changes ${objects}.
  It only touches the fictional lab objects named in this file. Never run it on a real company network.${extra}
  Tip: reading this file gives away how the problem was created. Run it first, read it after you finish the ticket.
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
`;
const adGuard = (c: ScriptCtx) => `Import-Module ActiveDirectory
$lab = (Get-ADDomain).DNSRoot
if ($lab -ne ${q(c.domain)}) { throw "Wrong domain '$lab'. This script is only for ${c.domain}." }
`;
const wsGuard = (c: ScriptCtx) => `if ($env:USERDNSDOMAIN -ne ${q(c.domain.toUpperCase())}) { throw "This computer is not joined to ${c.domain}. Join it first (setup wizard step 6)." }
`;
const confirm = (body: string) => `$answer = Read-Host 'This is a lab-only change. Type YES to continue'
if ($answer -ne 'YES') {
  Write-Host 'Cancelled. Nothing was changed.'
} else {
${body.split('\n').map((l) => (l ? '  ' + l : l)).join('\n')}
}
`;
const step = (c: ScriptCtx, vm: 'DC01' | 'WS01', kind: 'prepare' | 'undo', n: number, title: string, body: string): ScriptStep => ({ vm, title, filename: `${c.ticketCode}-${kind}-${n}-${vm}.ps1`, body });
const userGuard = (c: ScriptCtx, who: string) => `$u = Get-ADUser -Identity ${q(who)} -Properties DistinguishedName
if ($u.DistinguishedName -notlike ${q('*OU=Corp Users,' + c.dn)}) { throw 'This account is not a lab user under OU=Corp Users. Stopping.' }
`;
const noUndo = (c: ScriptCtx, msg: string): ScriptStep[] => [step(c, 'DC01', 'undo', 1, 'Nothing to undo', `Write-Host ${q(msg)}\n`)];

export const SCRIPTS: Record<string, ScriptDef> = {
  'ad-password-reset': {
    objects: 'the password of one lab user',
    prepare: (c) => [step(c, 'DC01', 'prepare', 1, `Make ${c.user} forget their password`, header(c, 'PREPARE', 'DC01', `the password of lab user ${c.user}`) + adGuard(c) +
      confirm(`${userGuard(c, c.user)}$pw = 'Lab!' + [guid]::NewGuid().ToString('N')\nSet-ADAccountPassword -Identity $u -Reset -NewPassword (ConvertTo-SecureString $pw -AsPlainText -Force)\nSet-ADUser -Identity $u -Enabled $true -ChangePasswordAtLogon $false\nUnlock-ADAccount -Identity $u\nWrite-Host ${q(`Done. ${c.user} no longer knows their password. Now work ticket ${c.ticketCode}.`)}`))],
    undo: (c) => noUndo(c, `A password reset cannot be reversed, and that is fine. ${c.user} just keeps whatever password you set. Nothing to undo.`),
  },
  'ad-account-expired': {
    objects: 'the account expiry date of one lab user',
    prepare: (c) => [step(c, 'DC01', 'prepare', 1, `Expire the account of ${c.user}`, header(c, 'PREPARE', 'DC01', `the account expiry date of lab user ${c.user}`) + adGuard(c) +
      confirm(`${userGuard(c, c.user)}Set-ADAccountExpiration -Identity $u -DateTime (Get-Date).AddDays(-1)\nWrite-Host ${q(`Done. The account of ${c.user} expired yesterday. Now work ticket ${c.ticketCode}.`)}`))],
    undo: (c) => [step(c, 'DC01', 'undo', 1, `Clear the expiry of ${c.user}`, header(c, 'UNDO', 'DC01', `the account expiry date of lab user ${c.user}`) + adGuard(c) +
      confirm(`${userGuard(c, c.user)}Clear-ADAccountExpiration -Identity $u\nWrite-Host 'Done. The account no longer expires.'`))],
  },
  'ad-onboarding-new-hire': {
    objects: 'nothing (it only checks that the OU and group exist and the new user does not yet exist)',
    prepare: (c) => [step(c, 'DC01', 'prepare', 1, 'Check the lab is ready for the new hire', header(c, 'PREPARE', 'DC01', 'nothing (read-only check)') + adGuard(c) +
      `$ou = ${q(`OU=${c.dept},OU=Corp Users,${c.dn}`)}\nif (-not (Get-ADOrganizationalUnit -Filter "DistinguishedName -eq '$ou'")) { throw "OU for ${c.dept} not found. Run Sync-LabRoster.ps1 first." }\nif (-not (Get-ADGroup -Filter "Name -eq ${q('GG-' + c.dept).replace(/'/g, "'")}")) { throw "Group GG-${c.dept} not found. Run Sync-LabRoster.ps1 first." }\nif (Get-ADUser -Filter "SamAccountName -eq ${q(c.newUser)}") { throw "${c.newUser} already exists. Run the undo script first." }\nWrite-Host ${q(`Ready. ${c.newName} (${c.newUser}) does not exist yet. Now work ticket ${c.ticketCode}.`)}\n`)],
    undo: (c) => [step(c, 'DC01', 'undo', 1, `Remove the new account ${c.newUser}`, header(c, 'UNDO', 'DC01', `the lab user ${c.newUser} that you created`) + adGuard(c) +
      confirm(`$u = Get-ADUser -Filter "SamAccountName -eq ${q(c.newUser)}" -Properties DistinguishedName\nif (-not $u) { Write-Host 'Nothing to remove.' }\nelseif ($u.DistinguishedName -notlike ${q('*,' + c.dn)}) { throw 'Unexpected location. Stopping.' }\nelse { Remove-ADUser -Identity $u -Confirm:$true; Write-Host 'Removed.' }`))],
  },
  'ad-offboarding': {
    objects: 'one lab user (enabled, OU and group membership)',
    prepare: (c) => [step(c, 'DC01', 'prepare', 1, `Make ${c.targetUser} an active employee`, header(c, 'PREPARE', 'DC01', `lab user ${c.targetUser}`) + adGuard(c) +
      confirm(`${userGuard(c, c.targetUser).replace('OU=Corp Users', 'OU=Corp Users')}Enable-ADAccount -Identity $u\nAdd-ADGroupMember -Identity ${q('GG-' + c.targetDept)} -Members $u\nWrite-Host ${q(`Done. ${c.targetUser} is active in GG-${c.targetDept}. Now work ticket ${c.ticketCode}.`)}`))],
    undo: (c) => [step(c, 'DC01', 'undo', 1, `Restore ${c.targetUser}`, header(c, 'UNDO', 'DC01', `lab user ${c.targetUser}`) + adGuard(c) +
      confirm(`$u = Get-ADUser -Identity ${q(c.targetUser)}\nif ($u.DistinguishedName -notlike ${q('*,' + c.dn)}) { throw 'Unexpected location. Stopping.' }\nEnable-ADAccount -Identity $u\nMove-ADObject -Identity $u.DistinguishedName -TargetPath ${q(`OU=${c.targetDept},OU=Corp Users,${c.dn}`)}\nAdd-ADGroupMember -Identity ${q('GG-' + c.targetDept)} -Members $u.SamAccountName\nWrite-Host 'Restored.'`))],
  },
  'dns-apipa': {
    objects: 'the DHCP Server service on DC01 and the network lease on WS01',
    prepare: (c) => [
      step(c, 'DC01', 'prepare', 1, 'Stop the DHCP Server service', header(c, 'PREPARE', 'DC01', 'the DHCP Server service') + confirm(`Stop-Service -Name DHCPServer -Force\nWrite-Host 'DHCP Server stopped. Now run step 2 on WS01.'`)),
      step(c, 'WS01', 'prepare', 2, 'Drop the client lease', header(c, 'PREPARE', 'WS01', 'the network lease of this computer') + confirm(`ipconfig /release | Out-Null\nipconfig /renew\nWrite-Host ${q(`The client could not get a lease. Now work ticket ${c.ticketCode}.`)}`)),
    ],
    undo: (c) => [
      step(c, 'DC01', 'undo', 1, 'Start the DHCP Server service', header(c, 'UNDO', 'DC01', 'the DHCP Server service') + confirm(`Start-Service -Name DHCPServer\nWrite-Host 'DHCP Server started.'`)),
      step(c, 'WS01', 'undo', 2, 'Renew the client lease', header(c, 'UNDO', 'WS01', 'the network lease of this computer') + confirm(`ipconfig /renew\nWrite-Host 'Done.'`)),
    ],
  },
  'dns-wrong-client-dns': {
    objects: 'DHCP option 006 (DNS servers) of one scope on DC01 and the lease on WS01',
    prepare: (c) => [
      step(c, 'DC01', 'prepare', 1, 'Hand out a public DNS server', header(c, 'PREPARE', 'DC01', `DHCP option 006 of scope ${c.scopeId}`) + `$scope = ${q(c.scopeId)}\nif (-not (Get-DhcpServerv4Scope -ScopeId $scope -ErrorAction SilentlyContinue)) { throw "Scope $scope does not exist. Create it first (setup wizard step 4)." }\n` +
        confirm(`Set-DhcpServerv4OptionValue -ScopeId $scope -DnsServer 8.8.8.8\nWrite-Host 'Scope now hands out 8.8.8.8. Now run step 2 on WS01.'`)),
      step(c, 'WS01', 'prepare', 2, 'Renew the lease', header(c, 'PREPARE', 'WS01', 'the network lease of this computer') + confirm(`ipconfig /renew | Out-Null\nipconfig /flushdns | Out-Null\nWrite-Host ${q(`Done. Now work ticket ${c.ticketCode}.`)}`)),
    ],
    undo: (c) => [
      step(c, 'DC01', 'undo', 1, 'Point the scope back at the domain controller', header(c, 'UNDO', 'DC01', `DHCP option 006 of scope ${c.scopeId}`) + confirm(`Set-DhcpServerv4OptionValue -ScopeId ${q(c.scopeId)} -DnsServer ${q(c.dcIp)}\nWrite-Host 'Done.'`)),
      step(c, 'WS01', 'undo', 2, 'Renew the lease', header(c, 'UNDO', 'WS01', 'the network lease of this computer') + confirm(`Set-DnsClientServerAddress -InterfaceAlias (Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1 -ExpandProperty Name) -ResetServerAddresses\nipconfig /renew | Out-Null\nWrite-Host 'Done.'`)),
    ],
  },
  'ad-lockout-stale-creds': {
    objects: 'the domain lockout policy, one lab user, and one saved credential on WS01',
    prepare: (c) => [
      step(c, 'DC01', 'prepare', 1, 'Turn on account lockout (3 bad tries)', header(c, 'PREPARE', 'DC01', 'the domain lockout policy (lab-wide) and lab user ' + c.user, '\n  NOTE: this turns on lockout for the whole lab domain until you run the undo script.') + adGuard(c) +
        confirm(`Set-ADDefaultDomainPasswordPolicy -Identity ${q(c.domain)} -LockoutThreshold 3 -LockoutDuration 00:30:00 -LockoutObservationWindow 00:30:00\nWrite-Host 'Lockout policy is on. Now run step 2 on WS01.'`)),
      step(c, 'WS01', 'prepare', 2, 'Save an old password and fail 4 sign-ins', header(c, 'PREPARE', 'WS01', `a saved credential on this computer and the lockout of lab user ${c.user}`) + wsGuard(c) +
        confirm(`cmdkey /add:${c.fshost} /user:${c.netbios}\\${c.user} /pass:'OldPassw0rd!x' | Out-Null\nAdd-Type -AssemblyName System.DirectoryServices.AccountManagement\n$ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext('Domain', ${q(c.domain)})\n1..4 | ForEach-Object { [void]$ctx.ValidateCredentials(${q(c.user)}, 'WrongPassw0rd!x') }\nWrite-Host ${q(`Done. ${c.user} should now be locked out. Now work ticket ${c.ticketCode}.`)}`)),
    ],
    undo: (c) => [
      step(c, 'DC01', 'undo', 1, 'Unlock the user and turn lockout back off', header(c, 'UNDO', 'DC01', 'the domain lockout policy and lab user ' + c.user) + adGuard(c) +
        confirm(`${userGuard(c, c.user)}Unlock-ADAccount -Identity $u\nSet-ADDefaultDomainPasswordPolicy -Identity ${q(c.domain)} -LockoutThreshold 0\nWrite-Host 'Done.'`)),
      step(c, 'WS01', 'undo', 2, 'Remove the saved credential', header(c, 'UNDO', 'WS01', 'a saved credential on this computer') + confirm(`cmdkey /delete:${c.fshost}\nWrite-Host 'Done.'`)),
    ],
  },
};

/** Sync-LabRoster.ps1: fixed template; only fictional users; lab-only password chosen by the learner. */
export interface RosterUserIn { full_name: string; username: string; department: string; job_title: string; is_active: boolean }
export function rosterScript(domain: string, dn: string, roster: RosterUserIn[], password: string): string {
  if (!RX.domain.test(domain) || !RX.dn.test(dn)) throw new HttpError(400, 'Lab domain is not valid.', 'script_value');
  for (const r of roster) if (!RX.user.test(r.username) || !/^[A-Za-z][A-Za-z .'-]{1,38}$/.test(r.full_name) || !RX.dept.test(r.department) || !/^[A-Za-z0-9 .'-]{1,40}$/.test(r.job_title)) throw new HttpError(400, `Roster entry ${r.username} is not safe to put in a script.`, 'script_value');
  const rows = roster.map((r) => `  @{ Name = ${q(r.full_name)}; Sam = ${q(r.username)}; Dept = ${q(r.department)}; Title = ${q(r.job_title)}; Active = ${r.is_active ? '$true' : '$false'} }`).join(',\n');
  const depts = Array.from(new Set(roster.map((r) => r.department)));
  return `<#
  LABOPS Sync-LabRoster.ps1
  RUN ON: DC01   (open PowerShell as Administrator)
  LAB ONLY: creates ${roster.length} FICTIONAL employees, department OUs and groups in ${domain}.
  Every user gets the lab-only password you chose in LabOps. NEVER reuse a real password.
  Safe to run again: existing objects are skipped, and Active/Disabled follows your Roster page.
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory
if ((Get-ADDomain).DNSRoot -ne ${q(domain)}) { throw "Wrong domain. This script is only for ${domain}." }
$dn = ${q(dn)}
$answer = Read-Host 'This creates fictional lab users. Type YES to continue'
if ($answer -ne 'YES') {
  Write-Host 'Cancelled. Nothing was changed.'
} else {
  $pw = ConvertTo-SecureString ${q(password)} -AsPlainText -Force
  $root = "OU=Corp Users,$dn"
  if (-not (Get-ADOrganizationalUnit -Filter "DistinguishedName -eq '$root'")) { New-ADOrganizationalUnit -Name 'Corp Users' -Path $dn -ProtectedFromAccidentalDeletion $false }
  $disabledOu = "OU=Disabled Users,$dn"
  if (-not (Get-ADOrganizationalUnit -Filter "DistinguishedName -eq '$disabledOu'")) { New-ADOrganizationalUnit -Name 'Disabled Users' -Path $dn -ProtectedFromAccidentalDeletion $false }
  foreach ($d in @(${depts.map((d) => q(d)).join(', ')})) {
    $ou = "OU=$d,$root"
    if (-not (Get-ADOrganizationalUnit -Filter "DistinguishedName -eq '$ou'")) { New-ADOrganizationalUnit -Name $d -Path $root -ProtectedFromAccidentalDeletion $false }
    if (-not (Get-ADGroup -Filter "Name -eq 'GG-$d'")) { New-ADGroup -Name "GG-$d" -GroupScope Global -GroupCategory Security -Path $ou }
  }
  $people = @(
${rows}
  )
  foreach ($p in $people) {
    $ou = "OU=$($p.Dept),$root"
    $existing = Get-ADUser -Filter "SamAccountName -eq '$($p.Sam)'" -ErrorAction SilentlyContinue
    if (-not $existing) {
      $parts = $p.Name.Split(' ')
      New-ADUser -Name $p.Name -SamAccountName $p.Sam -GivenName $parts[0] -Surname ($parts[1..($parts.Count - 1)] -join ' ') -UserPrincipalName "$($p.Sam)@${domain}" -Department $p.Dept -Title $p.Title -Path $ou -AccountPassword $pw -Enabled $p.Active -PasswordNeverExpires $true
      Add-ADGroupMember -Identity "GG-$($p.Dept)" -Members $p.Sam
      Write-Host "Created $($p.Sam)"
    } else {
      Set-ADUser -Identity $existing -Enabled $p.Active
      Write-Host "Exists: $($p.Sam) (Enabled = $($p.Active))"
    }
  }
  Write-Host 'Roster synced.'
}
`;
}
