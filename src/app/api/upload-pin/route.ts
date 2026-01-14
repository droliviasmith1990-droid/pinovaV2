// API Route: Upload Generated Pin
// POST /api/upload-pin
// Uploads generated pin image to Tebi S3 using streaming

import { NextRequest, NextResponse } from 'next/server';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { UploadPinMetadataSchema, validateRequest } from '@/lib/validations';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

// Route Segment Config: Increase body size limit to 10MB
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout for large uploads

// Debug logging - only in development
const DEBUG = process.env.NODE_ENV === 'development';
const log = (...args: unknown[]) => DEBUG && console.log(...args);

// Initialize Supabase client with cookie-based or header-based auth
async function getAuthenticatedSupabase(): Promise<SupabaseClient | null> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[upload-pin] Missing Supabase configuration');
        return null;
    }

    // Get auth token from cookies or Authorization header
    const cookieStore = await cookies();
    const headersStore = await headers();

    // Check for Authorization header (Bearer token)
    const authHeader = headersStore.get('authorization');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {
        global: {
            headers: {}
        }
    };

    if (authHeader) {
        // Use explicitly provided token
        options.global.headers['Authorization'] = authHeader;
    } else {
        // Fallback to cookies
        const allCookies = cookieStore.getAll();

        if (allCookies.length > 0) {
             options.global.headers['Cookie'] = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
        }
    }

    // Create client
    return createClient(supabaseUrl, supabaseAnonKey, options);
}

// Check if S3/Tebi is configured
function isTebiConfigured(): boolean {
    return !!(
        process.env.TEBI_ENDPOINT &&
        process.env.TEBI_ACCESS_KEY &&
        process.env.TEBI_SECRET_KEY &&
        process.env.TEBI_BUCKET
    );
}

// Create S3 client for Tebi
function createS3Client(): S3Client | null {
    if (!isTebiConfigured()) return null;

    let endpoint = process.env.TEBI_ENDPOINT!;
    // Ensure properly formatted endpoint
    if (!endpoint.startsWith('http')) {
        endpoint = `https://${endpoint}`;
    }

    return new S3Client({
        endpoint,
        region: 'us-east-1',
        credentials: {
            accessKeyId: process.env.TEBI_ACCESS_KEY!,
            secretAccessKey: process.env.TEBI_SECRET_KEY!,
        },
        forcePathStyle: true,
    });
}

export async function POST(request: NextRequest) {
    log('[upload-pin] Route handler started');

    try {
        // 1. Authenticate User
        const supabase = await getAuthenticatedSupabase();
        if (!supabase) {
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 503 }
            );
        }

        // Verify user session
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            log('[upload-pin] Auth failed:', authError?.message || 'No user session');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if Tebi is configured
        if (!isTebiConfigured()) {
            log('[upload-pin] Tebi not configured');
            return NextResponse.json(
                { error: 'Storage not configured', details: 'Missing TEBI environment variables' },
                { status: 503 }
            );
        }

        // Parse FormData
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const campaignId = formData.get('campaign_id') as string | null;
        const rowIndexStr = formData.get('row_index') as string | null;

        log('[upload-pin] Received:', { campaignId, rowIndexStr, hasFile: !!file, userId: user.id });

        // Validate file presence
        if (!file) {
            log('[upload-pin] Missing file');
            return NextResponse.json(
                { error: 'Missing required field: file' },
                { status: 400 }
            );
        }

        // Validate metadata with Zod schema
        const validation = validateRequest(UploadPinMetadataSchema, {
            campaign_id: campaignId,
            row_index: rowIndexStr,
        });

        if (!validation.success) {
            log('[upload-pin] Validation failed:', validation.error);
            return NextResponse.json(
                { error: 'Validation failed', details: validation.error },
                { status: 400 }
            );
        }

        const { campaign_id, row_index: rowIndex } = validation.data;

        // Optional: Verify campaign ownership?
        // This would require a DB call. For now, authentication is a massive improvement.
        // If we want strict security, we should check if `campaign_id` belongs to `user.id`.

        // Let's add ownership check if possible.
        // We have the `supabase` client with user context.
        // Assuming RLS is set up on 'campaigns', we can try to select it.
        const { data: campaign, error: campaignError } = await supabase
            .from('campaigns')
            .select('id')
            .eq('id', campaign_id)
            .eq('user_id', user.id) // Explicitly check ownership
            .single();

        if (campaignError || !campaign) {
             log('[upload-pin] Campaign verification failed:', campaignError?.message);
             return NextResponse.json(
                 { error: 'Campaign not found or access denied' },
                 { status: 403 }
             );
        }

        // Validate file size (max 10MB) - check before streaming
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            log('[upload-pin] File too large:', file.size);
            return NextResponse.json(
                { error: 'Image too large. Maximum size is 10MB.' },
                { status: 400 }
            );
        }

        // Create S3 client
        const s3Client = createS3Client();
        if (!s3Client) {
            log('[upload-pin] Failed to create S3 client');
            return NextResponse.json(
                { error: 'Failed to initialize storage client' },
                { status: 500 }
            );
        }

        // Generate S3 key
        // Use user.id in path to sandbox users?
        // Existing path: `pins/${campaign_id}/${rowIndex}-${timestamp}.png`
        // Since we verified campaign ownership, this is safe.
        const timestamp = Date.now();
        const key = `pins/${campaign_id}/${rowIndex}-${timestamp}.png`;
        const bucket = process.env.TEBI_BUCKET!;

        log('[upload-pin] Uploading to:', { bucket, key });

        // PERFORMANCE: Stream upload instead of buffering entire file in memory
        // Convert Web Stream to Node.js Readable stream for AWS SDK
        const fileStream = Readable.fromWeb(file.stream() as unknown as import('stream/web').ReadableStream);

        // Use @aws-sdk/lib-storage Upload for better streaming support
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: bucket,
                Key: key,
                Body: fileStream,
                ContentType: file.type || 'image/png',
                ACL: 'public-read',
                ContentLength: file.size, // Helps S3 know size upfront
            },
        });

        await upload.done();

        // Generate public URL
        const endpoint = process.env.TEBI_ENDPOINT || 's3.tebi.io';
        const baseUrl = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
        const url = `${baseUrl}/${bucket}/${key}`;

        log('[upload-pin] Upload successful:', url);

        return NextResponse.json({
            success: true,
            url,
            key,
            rowIndex,
        });
    } catch (error) {
        console.error('[upload-pin] Error:', error);
        return NextResponse.json(
            {
                error: 'Upload failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
