import { AD_ACCOUNTS } from './ad-accounts';
import { GPO } from './gpo';
import { DNS_DHCP } from './dns-dhcp';
import { FILE_SHARES } from './file-shares';
import { SECURITY } from './security';
import type { Blueprint } from './types';

// SERVER ONLY. Never import this file from a component or page that runs in the browser.
export const BLUEPRINTS: Blueprint[] = [...AD_ACCOUNTS, ...GPO, ...DNS_DHCP, ...FILE_SHARES, ...SECURITY];
export const BLUEPRINT_VERSION = 1;
export const byId = (id: string) => BLUEPRINTS.find((b) => b.id === id) || null;
export const conceptLabel = (c: string) => c.replace(/-/g, ' ');
