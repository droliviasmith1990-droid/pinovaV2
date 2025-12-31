## 2025-02-23 - SSRF in Proxy Endpoint
**Vulnerability:** The `proxy-image` API endpoint allowed fetching any URL, including internal IP addresses (SSRF), because it only validated the protocol (http/https) but not the destination IP.
**Learning:** `fetch` handles DNS resolution internally, making it easy to overlook SSRF risks. Validating just the URL string is insufficient; the resolved IP must be checked.
**Prevention:** Always resolve hostnames to IPs and check against a deny-list of private/internal ranges before making requests to user-supplied URLs.
