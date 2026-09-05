// src/validator.js
// Classifies a shell command's risk level and blocks outright-dangerous patterns.
// This is the layer that keeps "AI runs commands on your machine" from being reckless.

const HARD_BLOCK_PATTERNS = [
  /\brm\s+-rf\s+\/(\s|$)/,           // rm -rf /
  /\brm\s+-rf\s+~\/?\s*$/,           // rm -rf ~
  /\bmkfs\b/,                        // formatting a filesystem
  /\bdd\s+.*of=\/dev\/(sd|nvme|hd)/, // dd writing directly to a disk device
  /:\(\)\{.*\};:/,                   // fork bomb
  /\bcurl\b.*\|\s*(sudo\s+)?bash\b/, // curl | bash
  /\bwget\b.*\|\s*(sudo\s+)?bash\b/, // wget | bash
  />\s*\/dev\/sd[a-z]/,              // overwriting a raw disk device
  /\bchmod\s+-R\s+777\s+\//,         // recursive world-writable from root
  /Remove-Item\s+.*-Recurse.*(-Force)?\s+['"]?[A-Za-z]:\\?\s*['"]?$/i, // deleting a whole drive root (C:\)
  /Format-Volume\b/i,                // formatting a drive
  /\biex\s*\(.*Invoke-WebRequest/i,  // PowerShell "curl | iex" equivalent
  /\biwr\b.*\|\s*iex\b/i,
];

const HIGH_RISK_PATTERNS = [
  /\bsudo\b/,
  /\brm\s+-rf?\b/,
  /\bgit\s+push\s+--force\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bdrop\s+(table|database)\b/i,
  /\bnpm\s+publish\b/,
  /\bkill\s+-9\b/,
  /\bshutdown\b|\breboot\b/,
  /Remove-Item\s+.*-Recurse/i,       // PowerShell recursive delete
  /Stop-Computer\b|Restart-Computer\b/i,
  /Set-ExecutionPolicy\b/i,
];

const MEDIUM_RISK_PATTERNS = [
  /\bnpm\s+install\b/,
  /\bnpm\s+uninstall\b/,
  /\bapt(-get)?\s+(install|remove)\b/,
  /\bgit\s+checkout\b/,
  /\bmv\b/,
  /\bcp\s+-r\b/,
  /\bmkdir\b/,
  /\btouch\b/,
  /New-Item\b/i,
  /Copy-Item\s+.*-Recurse/i,
  /Move-Item\b/i,
];

/**
 * Classifies a single command's risk level.
 * Hard-block checks always execute first as an early return and win over allowlists.
 *
 * @param {string} command
 * @param {{ allowlist?: RegExp[], denylist?: RegExp[] }} [config]
 * @returns {{ level: 'blocked'|'high'|'medium'|'low', reason?: string }}
 */
export function classifyCommand(command, config = {}) {
  const cmd = command.trim();

  // 1. HARD-BLOCK CHECK: Built-in HARD_BLOCK_PATTERNS + custom config.denylist.
  // Hard-block ALWAYS wins and early-returns 'blocked', regardless of allowlist.
  const denylistPatterns = [
    ...HARD_BLOCK_PATTERNS,
    ...(config.denylist || []),
  ];

  for (const pattern of denylistPatterns) {
    if (pattern.test(cmd)) {
      return {
        level: 'blocked',
        reason: `Matches a hard-blocked or custom denylisted pattern: ${pattern}`,
      };
    }
  }

  // 2. ALLOWLIST CHECK: Custom config.allowlist lowers risk to 'low'.
  // Can only lower risk from high/medium/low; hard-blocks have already returned above.
  for (const pattern of config.allowlist || []) {
    if (pattern.test(cmd)) {
      return {
        level: 'low',
        reason: 'Pre-approved via custom allowlist pattern.',
      };
    }
  }

  // 3. HIGH RISK CHECK
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(cmd)) {
      return { level: 'high', reason: 'Potentially destructive or irreversible action.' };
    }
  }

  // 4. MEDIUM RISK CHECK
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(cmd)) {
      return { level: 'medium', reason: 'Modifies files, packages, or project state.' };
    }
  }

  return { level: 'low' };
}

/**
 * Validate an entire plan (array of step objects with a `command` field).
 * Returns the plan annotated with risk info, plus a flag if anything is hard-blocked.
 *
 * @param {Array} steps
 * @param {{ allowlist?: RegExp[], denylist?: RegExp[] }} [config]
 * @returns {{ steps: Array, hasBlocked: boolean }}
 */
export function validatePlan(steps, config = {}) {
  let hasBlocked = false;
  const annotated = steps.map((step) => {
    const classification = classifyCommand(step.command, config);
    if (classification.level === 'blocked') hasBlocked = true;
    return { ...step, risk: classification.level, riskReason: classification.reason };
  });

  return { steps: annotated, hasBlocked };
}
