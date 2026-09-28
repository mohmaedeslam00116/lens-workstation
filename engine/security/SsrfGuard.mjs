import { lookup } from 'node:dns/promises';

/**
 * Private / reserved IPv4 CIDR ranges that MUST be blocked.
 * Each entry: { prefix (as 32-bit int), mask (as 32-bit int), label }.
 */
const BLOCKED_RANGES = [
  // Loopback 127.0.0.0/8
  { prefix: 0x7f000000, mask: 0xff000000, label: 'loopback' },
  // RFC 1918: 10.0.0.0/8
  { prefix: 0x0a000000, mask: 0xff000000, label: 'private-10' },
  // RFC 1918: 172.16.0.0/12
  { prefix: 0xac100000, mask: 0xfff00000, label: 'private-172' },
  // RFC 1918: 192.168.0.0/16
  { prefix: 0xc0a80000, mask: 0xffff0000, label: 'private-192' },
  // Link-local 169.254.0.0/16 (includes cloud metadata 169.254.169.254)
  { prefix: 0xa9fe0000, mask: 0xffff0000, label: 'link-local' },
  // Current network 0.0.0.0/8
  { prefix: 0x00000000, mask: 0xff000000, label: 'current-network' },
  // Shared address space 100.64.0.0/10 (carrier NAT)
  { prefix: 0x64400000, mask: 0xffc00000, label: 'shared-address' },
  // IETF Protocol Assignments 192.0.0.0/24
  { prefix: 0xc0000000, mask: 0xffffff00, label: 'ietf-protocol' },
  // Documentation 192.0.2.0/24 (TEST-NET-1)
  { prefix: 0xc0000200, mask: 0xffffff00, label: 'test-net-1' },
  // Documentation 198.51.100.0/24 (TEST-NET-2)
  { prefix: 0xc6336400, mask: 0xffffff00, label: 'test-net-2' },
  // Documentation 203.0.113.0/24 (TEST-NET-3)
  { prefix: 0xcb007100, mask: 0xffffff00, label: 'test-net-3' },
  // Broadcast 255.255.255.255/32
  { prefix: 0xffffffff, mask: 0xffffffff, label: 'broadcast' },
];

/**
 * Blocked IPv6 addresses (exact match).
 */
const BLOCKED_IPV6 = new Set([
  '::1',       // Loopback
  '::',        // Unspecified
  'fe80::1',   // Link-local
]);

/**
 * IPv6 prefixes to block.
 */
const BLOCKED_IPV6_PREFIXES = [
  'fe80:',   // Link-local
  'fc',      // Unique local (ULA) fc00::/7
  'fd',      // Unique local (ULA)
  '::ffff:', // IPv4-mapped IPv6
];

/**
 * Parse a dotted IPv4 string into a 32-bit unsigned integer.
 * Returns null for invalid addresses.
 */
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }

  // Convert to unsigned 32-bit
  return result >>> 0;
}

/**
 * Check if an IPv4 address (as 32-bit int) falls within any blocked range.
 */
function isBlockedIPv4(ipInt) {
  for (const range of BLOCKED_RANGES) {
    if (((ipInt & range.mask) >>> 0) === (range.prefix >>> 0)) {
      return { blocked: true, label: range.label };
    }
  }
  return { blocked: false };
}

/**
 * Check if an IPv6 address string is blocked.
 */
function isBlockedIPv6(ip) {
  const normalized = ip.toLowerCase();

  if (BLOCKED_IPV6.has(normalized)) {
    return { blocked: true, label: 'ipv6-reserved' };
  }

  for (const prefix of BLOCKED_IPV6_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return { blocked: true, label: 'ipv6-reserved' };
    }
  }

  return { blocked: false };
}

/**
 * SsrfGuard — Pre-flight DNS validation to prevent SSRF attacks.
 *
 * Before any outbound HTTP request, resolves the target hostname via DNS
 * and rejects requests that resolve to private, loopback, link-local,
 * or cloud metadata IP addresses.
 *
 * Usage:
 *   const guard = new SsrfGuard();
 *   await guard.validateUrl('https://example.com/page');    // OK
 *   await guard.validateUrl('http://127.0.0.1:8080/admin'); // throws
 *   await guard.validateUrl('http://169.254.169.254/meta'); // throws
 */
export class SsrfGuard {
  constructor(options = {}) {
    /** @type {number} DNS lookup timeout in ms */
    this.dnsTimeout = options.dnsTimeout ?? 5000;
    /** @type {Set<string>} Additional blocked hostnames */
    this.blockedHostnames = new Set(options.blockedHostnames ?? []);
    /** @type {Set<string>} Explicitly allowed hostnames (bypass DNS check) */
    this.allowedHostnames = new Set(options.allowedHostnames ?? []);
  }

  /**
   * Validate a URL is safe to fetch (not targeting private/reserved IPs).
   *
   * @param {string} url — The URL to validate.
   * @returns {Promise<{ safe: true, hostname: string, ip: string }>}
   * @throws {SsrfError} If the URL targets a blocked IP range.
   */
  async validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new SsrfError('Invalid URL: empty or non-string', { url });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new SsrfError(`Invalid URL: cannot parse "${url}"`, { url });
    }

    // Only allow http(s) schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new SsrfError(
        `Blocked scheme "${parsed.protocol}" — only http/https allowed`,
        { url, hostname: parsed.hostname }
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check explicit blocklist
    if (this.blockedHostnames.has(hostname)) {
      throw new SsrfError(
        `Hostname "${hostname}" is explicitly blocked`,
        { url, hostname }
      );
    }

    // Check explicit allowlist (bypass DNS check)
    if (this.allowedHostnames.has(hostname)) {
      return { safe: true, hostname, ip: 'allowed-bypass' };
    }

    // Check if hostname is already a raw IP (skip DNS lookup)
    const ipv4Int = ipv4ToInt(hostname);
    if (ipv4Int !== null) {
      const check = isBlockedIPv4(ipv4Int);
      if (check.blocked) {
        throw new SsrfError(
          `Blocked IP address ${hostname} (${check.label})`,
          { url, hostname, ip: hostname, label: check.label }
        );
      }
      return { safe: true, hostname, ip: hostname };
    }

    // Check raw IPv6 (hostname in brackets gets stripped by URL parser)
    if (hostname.includes(':')) {
      const check = isBlockedIPv6(hostname);
      if (check.blocked) {
        throw new SsrfError(
          `Blocked IPv6 address ${hostname} (${check.label})`,
          { url, hostname, ip: hostname, label: check.label }
        );
      }
      return { safe: true, hostname, ip: hostname };
    }

    // DNS resolution
    let address;
    try {
      const result = await lookup(hostname, { family: 0 });
      address = result.address;
    } catch (err) {
      throw new SsrfError(
        `DNS resolution failed for "${hostname}": ${err.message}`,
        { url, hostname, dnsError: err.code }
      );
    }

    // Validate resolved IP
    const ipv4Resolved = ipv4ToInt(address);
    if (ipv4Resolved !== null) {
      const check = isBlockedIPv4(ipv4Resolved);
      if (check.blocked) {
        throw new SsrfError(
          `Hostname "${hostname}" resolves to blocked IP ${address} (${check.label})`,
          { url, hostname, ip: address, label: check.label }
        );
      }
    } else {
      // IPv6 check
      const check = isBlockedIPv6(address);
      if (check.blocked) {
        throw new SsrfError(
          `Hostname "${hostname}" resolves to blocked IPv6 ${address} (${check.label})`,
          { url, hostname, ip: address, label: check.label }
        );
      }
    }

    return { safe: true, hostname, ip: address };
  }

  /**
   * Convenience: safe fetch wrapper that validates the URL before fetching.
   *
   * @param {string} url
   * @param {RequestInit} [fetchOptions]
   * @returns {Promise<Response>}
   */
  async safeFetch(url, fetchOptions = {}) {
    await this.validateUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.dnsTimeout * 2);

    try {
      return await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        redirect: 'manual', // Prevent redirect to internal IPs
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Custom error class for SSRF violations.
 */
export class SsrfError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SsrfError';
    this.code = 'SSRF_BLOCKED';
    this.details = details;
  }
}

// Export helpers for testing
export { ipv4ToInt, isBlockedIPv4, isBlockedIPv6 };
