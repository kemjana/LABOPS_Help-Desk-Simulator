'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import NavTabs from '@/components/NavTabs';
import PasswordScript from '@/components/PasswordScript';
import { LabSettings } from '@/components/Modals';
import type { AppState } from '@/components/types';
import { api, ApiError } from '@/lib/api-client';
import { ensureSession } from '@/lib/supabase-browser';

function Cmd({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (<div className="guide-ex" style={{ margin: '6px 0' }}><pre className="code-block mono" style={{ flex: 1, margin: 0, maxHeight: 'none' }}>{text}</pre>
    <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* ignore */ } }}>{ok ? 'Copied' : 'Copy'}</button></div>);
}

export default function Setup() {
  const router = useRouter();
  const [s, setS] = useState<AppState | null>(null); const [err, setErr] = useState(''); const [edit, setEdit] = useState(false);
  const load = useCallback(async () => { try { setS(await api<AppState>('/api/state')); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not load.'); } }, []);
  useEffect(() => { (async () => { if (!(await ensureSession(false))) { router.replace('/'); return; } await load(); })(); }, [router, load]);
  if (!s) return <div className="center">{err ? <p className="alert error">{err}</p> : <p>Loading...</p>}</div>;
  const e = s.env; const prog = e.setup_progress || {}; const doneCount = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => prog[String(n)]).length;
  const light = e.lab_mode === 'lightweight'; const dn = e.domain_name.split('.').map((p) => `DC=${p}`).join(','); const nb = e.domain_name.split('.')[0].toUpperCase();
  const prefix = e.subnet_cidr.split('/')[0].split('.').slice(0, 3).join('.'); const scope = `${prefix}.0`;
  async function mark(n: number, v: boolean) {
    setS((p) => (p ? { ...p, env: { ...p.env, setup_progress: { ...(p.env.setup_progress || {}), [String(n)]: v } } } : p)); // show the tick immediately
    try { await api('/api/lab/progress', { method: 'PUT', body: { step: n, done: v } }); await load(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not save.'); await load(); } }
  const steps: { t: string; body: React.ReactNode }[] = [
    { t: 'Plan the lab', body: (<><p>Your lab values (tickets and checks use these):</p>
      <ul><li>Domain: <b className="mono">{e.domain_name}</b>, subnet <b className="mono">{e.subnet_cidr}</b>, gateway <b className="mono">{e.gateway_ip}</b></li><li>DC01 (domain controller): <b className="mono">{e.dc_ip}</b>{light ? ' (also holds the file shares)' : ''}</li>{!light && <li>FS01 (file server): <b className="mono">{e.fs_ip}</b></li>}<li>WS01 (client PC): gets an address from DHCP</li></ul>
      <p><b>Mode:</b> {light ? 'Lightweight = 1 server + 1 client, about 8 GB of free RAM.' : 'Full enterprise = DC01 + FS01 + WS01, about 12 GB of free RAM.'}</p>
      <button className="btn sm" onClick={() => setEdit(true)}>Edit lab values</button>
      <p className="muted small">Use a domain like corp.local for learning only. It is a sandbox name, never for a real company.</p></>) },
    { t: 'Hypervisor (VirtualBox)', body: (<ol><li>Install VirtualBox from virtualbox.org.</li><li>Download the Windows Server 2022 <b>evaluation</b> ISO (Microsoft Evaluation Center, free for 180 days) and a Windows 10 or 11 ISO.</li>
      <li>For each VM: <b>Settings &gt; Network &gt; Adapter 1 &gt; Internal Network</b>, name it <span className="mono">labnet</span>, so your lab is isolated. (Optional: Adapter 2 = NAT for internet.)</li>
      <li>After installing Windows, use <b>Devices &gt; Insert Guest Additions CD</b>, install it, then <b>Devices &gt; Shared Clipboard &gt; Bidirectional</b>. This lets you copy and paste scripts into the VM.</li>
      <li>Optional: a <b>Shared Folder</b> to move .ps1 files into the VM.</li></ol>) },
    { t: 'Windows Server (DC01)', body: (<><ol><li>Create a VM named DC01: 4 GB RAM, 2 CPUs, 50 GB disk. Install <b>Windows Server 2022 Standard (Desktop Experience)</b>.</li><li>Open PowerShell as Administrator. Find your adapter name:</li></ol>
      <Cmd text="Get-NetAdapter" />
      <p>Then rename the server and set a fixed IP (replace <span className="mono">Ethernet</span> with your adapter name):</p>
      <Cmd text={`Rename-Computer -NewName DC01 -Restart`} />
      <Cmd text={`New-NetIPAddress -InterfaceAlias 'Ethernet' -IPAddress ${e.dc_ip} -PrefixLength ${e.subnet_cidr.split('/')[1]} -DefaultGateway ${e.gateway_ip}\nSet-DnsClientServerAddress -InterfaceAlias 'Ethernet' -ServerAddresses 127.0.0.1`} />
      {!light && <p>Enterprise mode: repeat this for FS01 with IP <span className="mono">{e.fs_ip}</span> (DNS = {e.dc_ip}) after DC01 is ready, then <span className="mono">Install-WindowsFeature FS-FileServer</span>.</p>}</>) },
    { t: 'DNS and DHCP', body: (<><p>First install the roles and make DC01 a domain controller (the server restarts):</p>
      <Cmd text={`Install-WindowsFeature AD-Domain-Services,DNS,DHCP -IncludeManagementTools\nInstall-ADDSForest -DomainName ${e.domain_name} -DomainNetbiosName ${nb} -InstallDns -Force`} />
      <p>After the restart, sign in as <span className="mono">{nb}\Administrator</span> and set up DHCP:</p>
      <Cmd text={`Add-DhcpServerInDC -DnsName DC01.${e.domain_name} -IPAddress ${e.dc_ip}\nAdd-DhcpServerv4Scope -Name 'LabOps Scope' -StartRange ${prefix}.100 -EndRange ${prefix}.200 -SubnetMask 255.255.255.0 -State Active\nSet-DhcpServerv4OptionValue -ScopeId ${scope} -DnsServer ${e.dc_ip} -Router ${e.gateway_ip} -DnsDomain ${e.domain_name}`} />
      <p className="muted small">Install-ADDSForest asks for a recovery (DSRM) password. Use a lab-only one. These commands follow Microsoft's documentation; if your screen shows a different message, read it, it usually says what to fix.</p></>) },
    { t: 'OUs, groups and the company roster', body: (<><p>This creates <b>OU=Corp Users</b>, one OU and one group (GG-Department) per department, and the 12 fictional employees.</p>
      <PasswordScript /><p>Copy the downloaded file into DC01, open PowerShell as Administrator and run it. You can change who is active on the <a href="/roster">Roster page</a> and run it again.</p></>) },
    { t: 'Domain join (WS01)', body: (<><ol><li>Create a VM named WS01 (Windows 10 or 11, 2-4 GB RAM) on the same <span className="mono">labnet</span> network. It gets an address from your DHCP server.</li><li>In PowerShell (Admin) on WS01:</li></ol>
      <Cmd text={`Rename-Computer -NewName WS01\nAdd-Computer -DomainName ${e.domain_name} -Credential ${nb}\\Administrator -Restart`} />
      <p>Sign in as one of your fictional users, for example <span className="mono">{nb}\cmendoza</span> with the lab password.</p></>) },
    { t: 'Group Policy', body: (<><p>On DC01 create a small test policy and link it to the users OU:</p>
      <Cmd text={`New-GPO -Name 'LabOps Baseline' | New-GPLink -Target 'OU=Corp Users,${dn}'`} />
      <p>Then on WS01 run <span className="mono">gpupdate /force</span> and <span className="mono">gpresult /r</span> to see the policy applied. Open <b>Group Policy Management</b> on DC01 to explore.</p></>) },
    { t: 'Test and verify', body: (<ul><li>On WS01: <span className="mono">ipconfig /all</span> shows DNS server {e.dc_ip}</li><li><span className="mono">nslookup dc01.{e.domain_name}</span> answers {e.dc_ip}</li><li>You can sign in on WS01 as a roster user</li><li><span className="mono">gpresult /r</span> lists the LabOps Baseline policy</li><li><b>Take a snapshot</b> of every VM and name it <span className="mono">Clean lab</span></li></ul>) },
    { t: 'Document the lab', body: (<><p>Write this down (a notes app is fine). It helps when you troubleshoot and in interviews:</p>
      <Cmd text={`LAB: ${e.lab_name}\nDomain: ${e.domain_name}  Subnet: ${e.subnet_cidr}  Gateway: ${e.gateway_ip}\nDC01: ${e.dc_ip}  ${light ? '(also file shares)' : `FS01: ${e.fs_ip}`}\nHypervisor: VirtualBox   Snapshots: Clean lab\nLab-only password: (store somewhere private, never reuse)`} />
      <p className="muted small">Phase 3 will export your fixes as a runbook and lab journal.</p></>) },
  ];
  return (
    <div className="page">
      <header className="topbar"><div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><Logo /><NavTabs current="setup" /></div><div className="topbar-right"><ThemeToggle /></div></header>
      <main className="hero" style={{ paddingTop: 24 }}>
        <h1 style={{ fontSize: 28 }}>Lab setup</h1>
        <p className="lead" style={{ fontSize: 16 }}>Only needed for <b>My own VM</b> mode. The <b>Pre-built lab</b> needs no setup. Work through the 9 steps; tick each one when done.</p>
        <div className="bar" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={9} aria-label="Setup progress" style={{ margin: '8px 0 14px' }}><i style={{ width: `${(doneCount / 9) * 100}%` }} /></div>
        <p className="muted small" style={{ marginBottom: 10 }}>{doneCount} of 9 steps done{e.setup_completed ? ' - your lab is ready!' : ''}</p>
        {err && <p className="alert error" role="alert">{err}</p>}
        {steps.map((st, i) => (
          <details key={i} className={`step ${prog[String(i + 1)] ? 'done' : ''}`} open={i === 0}>
            <summary><span className="num">{prog[String(i + 1)] ? '\u2713' : i + 1}</span>{st.t}</summary>
            <div className="body">{st.body}
              <div className="row-actions"><label className="switch"><input type="checkbox" checked={!!prog[String(i + 1)]} onChange={(ev) => mark(i + 1, ev.target.checked)} /> Mark step {i + 1} as done</label></div></div>
          </details>))}
        <p className="muted small">I wrote these steps from Microsoft's public documentation but could not run them on real Windows here. If a command fails, read its message and use Get-Help on that command.</p>
      </main>
      {edit && <LabSettings env={e} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); await load(); }} />}
    </div>
  );
}
