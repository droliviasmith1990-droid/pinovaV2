
import { GET } from '../route';
import { NextRequest } from 'next/server';

// Mock global fetch
const originalFetch = global.fetch;

// Mock dns module
jest.mock('node:dns', () => {
    return {
        promises: {
            lookup: jest.fn(),
        },
        lookup: jest.fn(),
    };
});

// Import mocked dns to control implementation
// @ts-ignore
import { promises as dnsPromises } from 'node:dns';

describe('GET /api/proxy-image SSRF Vulnerability', () => {
    beforeAll(() => {
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock behavior for dns.promises.lookup
        (dnsPromises.lookup as jest.Mock).mockImplementation(async (hostname: string) => {
            if (hostname === 'localhost') return { address: '127.0.0.1', family: 4 };
            if (hostname === 'internal.com') return { address: '10.0.0.5', family: 4 };
            if (hostname === 'public.com') return { address: '93.184.216.34', family: 4 };
            if (hostname === 'ipv6-loopback') return { address: '::1', family: 6 };
            throw new Error(`ENOTFOUND ${hostname}`);
        });
    });

    it('should BLOCK fetching from localhost', async () => {
        // Mock successful fetch if it were to go through (it shouldn't)
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true, arrayBuffer: () => new ArrayBuffer(0), headers: new Headers() });

        const targetUrl = 'http://localhost:3000/secret-config';
        const req = new NextRequest(`http://localhost:3000/api/proxy-image?url=${encodeURIComponent(targetUrl)}`);

        const res = await GET(req);
        const data = await res.json();

        // Should NOT fetch
        expect(global.fetch).not.toHaveBeenCalled();
        // Should return 403
        expect(res.status).toBe(403);
        expect(data.error).toMatch(/forbidden/);
    });

    it('should BLOCK fetching from private IP 10.x.x.x', async () => {
        const targetUrl = 'http://internal.com/admin';
        const req = new NextRequest(`http://localhost:3000/api/proxy-image?url=${encodeURIComponent(targetUrl)}`);

        const res = await GET(req);

        expect(global.fetch).not.toHaveBeenCalled();
        expect(res.status).toBe(403);
    });

    it('should ALLOW fetching from public IP', async () => {
         (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            headers: {
                get: (header: string) => {
                    if (header === 'content-length') return '100';
                    if (header === 'content-type') return 'image/png';
                    return null;
                },
            },
            arrayBuffer: async () => new ArrayBuffer(10),
        });

        const targetUrl = 'http://public.com/image.png';
        const req = new NextRequest(`http://localhost:3000/api/proxy-image?url=${encodeURIComponent(targetUrl)}`);

        const res = await GET(req);

        expect(global.fetch).toHaveBeenCalledWith(targetUrl, expect.anything());
        expect(res.status).toBe(200);
    });
});
