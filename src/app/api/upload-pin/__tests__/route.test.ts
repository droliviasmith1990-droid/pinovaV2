
import { POST } from '../route';
import { NextRequest } from 'next/server';

// Mock global fetch
const originalFetch = global.fetch;

// Mock next/headers
jest.mock('next/headers', () => ({
    cookies: jest.fn(),
    headers: jest.fn(),
}));

import { cookies, headers } from 'next/headers';

describe('POST /api/upload-pin Auth Check', () => {
    beforeAll(() => {
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should REJECT upload without auth (401 Unauthorized)', async () => {
        // Setup Mocks for Unauthenticated Request
        (cookies as jest.Mock).mockResolvedValue({
            getAll: () => [],
            get: () => null,
        });
        (headers as jest.Mock).mockResolvedValue({
            get: () => null,
        });

        // Mock request with file
        const formData = new FormData();
        const file = new File(['content'], 'test.png', { type: 'image/png' });
        formData.append('file', file);
        formData.append('campaign_id', '123');
        formData.append('row_index', '1');

        const req = new NextRequest('http://localhost:3000/api/upload-pin', {
            method: 'POST',
            body: formData,
        });

        // Mock Supabase Env Vars
        const originalEnv = process.env;
        process.env = {
            ...originalEnv,
            NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
            TEBI_ENDPOINT: 'https://tebi.io',
            TEBI_ACCESS_KEY: 'test',
            TEBI_SECRET_KEY: 'test',
            TEBI_BUCKET: 'test-bucket',
            NODE_ENV: 'test'
        };

        try {
            const res = await POST(req);

            // Should be 401 because no cookies/headers provided
            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error).toBe('Unauthorized');

        } finally {
            process.env = originalEnv;
        }
    });

    // TODO: We could add a test for "Authenticated but campaign ownership check fails" if we mock Supabase client return values.
    // That requires mocking createClient from @supabase/supabase-js.
});
