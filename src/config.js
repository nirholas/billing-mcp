// Centralized env + HTTP base for the billing MCP.
//
// This server is the account-economics surface: an agent reads its OWN plan
// quotas, metered usage, invoices, receipts, and earnings. Every one of those
// reads is private and account-scoped, so they authenticate with your three.ws
// session token (THREE_WS_SESSION) — the same `__Host-sid` cookie a signed-in
// browser carries. The API resolves the calling user from it and returns only
// that user's billing data. The single public read (get_fee_info) needs nothing.
//
// We never hold a baked-in key and we never sign anything: this server only
// reads. Without THREE_WS_SESSION the billing reads cannot resolve a user, so it
// is a required credential for everything except the public fee rate.

export function env(key, fallback) {
	const v = process.env[key];
	return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

// Base URL of the three.ws API. Override only when self-hosting or pointing at a
// preview deployment.
export const THREE_WS_BASE = env('THREE_WS_BASE', 'https://three.ws').replace(/\/+$/, '');

// Per-request timeout (ms). These are live reads (usage roll-ups, reconciliation
// joins) — generous enough to ride out a cold edge, fast in practice.
export const HTTP_TIMEOUT_MS = (() => {
	const raw = env('THREE_WS_TIMEOUT_MS');
	if (raw === undefined) return 20000;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw Object.assign(new Error(`THREE_WS_TIMEOUT_MS must be a positive number (got "${raw}")`), {
			code: 'bad_config',
		});
	}
	return n;
})();

// Session token for the account-scoped billing reads. This is the value of the
// `__Host-sid` cookie from a signed-in three.ws browser session; the API reads it
// to resolve the calling user and return only their plan, usage, invoices, and
// receipts. Required for every read except the public fee rate. Treat it like a
// password.
export const THREE_WS_SESSION = env('THREE_WS_SESSION', '');

// Identifies this client to the API in request logs.
export const USER_AGENT = '@three-ws/billing-mcp';
