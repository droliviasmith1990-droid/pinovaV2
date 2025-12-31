
import dns from 'node:dns';

// Use promises API for cleaner async/await usage
const { lookup } = dns.promises;

/**
 * Checks if an IP address is a private or internal IP.
 * @param ip The IP address to check.
 * @returns True if the IP is private/internal, false otherwise.
 */
function isPrivateIp(ip: string): boolean {
    // Handle IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1)
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    const parts = ip.split('.').map(Number);

    // Check for IPv4 format
    if (parts.length === 4) {
        // 127.0.0.0/8 (Loopback)
        if (parts[0] === 127) return true;

        // 10.0.0.0/8 (Private network)
        if (parts[0] === 10) return true;

        // 172.16.0.0/12 (Private network)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

        // 192.168.0.0/16 (Private network)
        if (parts[0] === 192 && parts[1] === 168) return true;

        // 169.254.0.0/16 (Link-local)
        if (parts[0] === 169 && parts[1] === 254) return true;

        // 0.0.0.0/8 (Current network)
        if (parts[0] === 0) return true;
    }

    // Simple check for IPv6 loopback and unique local address (ULA)
    // ::1 (Loopback)
    // fc00::/7 (ULA - Private)
    // fe80::/10 (Link-local)
    if (ip === '::1' || ip === '::' ||
        ip.toLowerCase().startsWith('fc') ||
        ip.toLowerCase().startsWith('fd') ||
        ip.toLowerCase().startsWith('fe80:')) {
        return true;
    }

    return false;
}

/**
 * Validates if a hostname resolves to a safe (public) IP address.
 * Throws an error if the hostname resolves to a private IP or fails resolution.
 * @param hostname The hostname to check.
 */
export async function validateSafeHost(hostname: string): Promise<void> {
    try {
        const result = await lookup(hostname);
        const address = typeof result === 'string' ? result : result.address;

        if (isPrivateIp(address)) {
            throw new Error(`Access to private IP ${address} is forbidden`);
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('forbidden')) {
            throw error;
        }
        // Re-throw DNS errors
        throw error;
    }
}
