## 2025-02-23 - SSRF in Proxy Endpoint
**Vulnerability:** The `proxy-image` API endpoint allowed fetching any URL, including internal IP addresses (SSRF), because it only validated the protocol (http/https) but not the destination IP.
**Learning:** `fetch` handles DNS resolution internally, making it easy to overlook SSRF risks. Validating just the URL string is insufficient; the resolved IP must be checked.
**Prevention:** Always resolve hostnames to IPs and check against a deny-list of private/internal ranges before making requests to user-supplied URLs.

## 2025-02-23 - Broken Access Control in File Upload
**Vulnerability:** The `upload-pin` API endpoint allows unauthenticated users to upload arbitrary files to the storage bucket, potentially overwriting data or exhausting storage.
**Learning:** Next.js API routes do not require authentication by default. Endpoints that perform sensitive actions (like file uploads) must explicitly verify the user's session or API key.
**Prevention:** Use a standardized authentication helper (like `getAuthenticatedSupabase`) at the beginning of every API route handler. Verify not just authentication, but also authorization (e.g., resource ownership).
