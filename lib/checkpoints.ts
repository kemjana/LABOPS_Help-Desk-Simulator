// Multi-step (checkpoint) Hard tickets. Each checkpoint is graded on its own subset of the hidden checklist.
export interface Checkpoint { id: string; title: string; prompt: string; criteria: string[]; proof: boolean; pushback: string }
export const CHECKPOINTS: Record<string, Checkpoint[]> = {
  'ad-logon-restrictions': [
    { id: 'c1', title: 'Fix the logon hours', prompt: 'Find out why {name} cannot sign in "at this time of day" and say what you changed.', criteria: ['hours'], proof: false, pushback: 'I still get the message about the time of day.' },
    { id: 'c2', title: 'Fix the workstation restriction', prompt: 'Now {name} gets a message about "this workstation". Find the second restriction and fix it.', criteria: ['ws'], proof: false, pushback: 'Another PC still says there are restrictions on where I can sign in.' },
    { id: 'c3', title: 'Verify with least privilege', prompt: 'Confirm the fix, keep it as narrow as possible, and paste proof from your lab.', criteria: ['least'], proof: true, pushback: 'It works but you gave me far more access than I need. Can you narrow it?' },
  ],
  'gpo-kiosk-loopback': [
    { id: 'c1', title: 'Explain why nothing happens', prompt: 'Why are the user settings in the kiosk computers GPO ignored?', criteria: ['why'], proof: false, pushback: 'I do not understand why the settings do nothing.' },
    { id: 'c2', title: 'Fix it and verify', prompt: 'Make the settings apply to whoever signs in on a kiosk. Say which mode you chose and why, and paste proof.', criteria: ['loop', 'mode'], proof: true, pushback: 'The kiosk is still wide open to staff.' },
  ],
  'dhcp-not-authorized': [
    { id: 'c1', title: 'Explain the problem', prompt: 'The DHCP service is running and the scope is active, yet nobody gets an address. Why?', criteria: ['why'], proof: false, pushback: 'Everything looks fine on the server, but I still have no address.' },
    { id: 'c2', title: 'Fix it', prompt: 'Apply the fix on the DHCP server and say exactly what you did.', criteria: ['auth'], proof: false, pushback: 'The console still shows the server with a red arrow.' },
    { id: 'c3', title: 'Verify from a client', prompt: 'Prove that a client gets a lease and that the server is registered. Paste proof from your lab.', criteria: ['verify'], proof: true, pushback: 'My laptop still has no address. How do we know it is fixed?' },
  ],
  'fs-nested-group-access': [
    { id: 'c1', title: 'Find the access path', prompt: 'Find out how {name} still reaches the folder after leaving the group.', criteria: ['nest'], proof: false, pushback: 'I can still open the folder, so the path has not been found.' },
    { id: 'c2', title: 'Close it properly', prompt: 'Remove the access in the right place without breaking others.', criteria: ['fix'], proof: false, pushback: 'Other people lost access too, or I can still get in.' },
    { id: 'c3', title: 'Make it take effect', prompt: 'What must happen before {name} is tested again? Paste proof from your lab.', criteria: ['token'], proof: true, pushback: 'I tested again right away and still got in.' },
  ],
  'sec-phishing-compromise': [
    { id: 'c1', title: 'Contain', prompt: 'Stop the damage now. What do you do first, and how do you end existing sessions?', criteria: ['contain'], proof: false, pushback: 'Strange sign-ins for my account are still showing up.' },
    { id: 'c2', title: 'Investigate', prompt: 'Review logs and check whether other accounts or computers are affected.', criteria: ['logs', 'scope'], proof: false, pushback: 'We still do not know what the attacker did or who else is affected.' },
    { id: 'c3', title: 'Report', prompt: 'Write the short timeline and the advice for the user. Paste a log or command output from your lab.', criteria: ['doc'], proof: true, pushback: 'My manager asked for a written timeline and I do not have one.' },
  ],
};
export const cpsFor = (bp: string) => CHECKPOINTS[bp] ?? null;
