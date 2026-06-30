// Real HTTP access to the three.ws API. No mocks, no fixtures — every call is
// a live request to THREE_WS_BASE. Errors are normalized into a single shape so
// tool handlers can surface a clean message + status to the MCP client.
//
// Account-scoped reads pass `auth: true`. Those endpoints resolve the caller
// from the three.ws session cookie, so we attach THREE_WS_SESSION as the
// `__Host-sid` cookie and fail fast with a clear message when it is absent —
// there is no second HTTP client, the auth lives here. The lone public read
// (fee rate) omits `auth` and works with no credential.

import { THREE_WS_BASE, HTTP_TIMEOUT_MS, USER_AGENT, THREE_WS_SESSION } from '../config.js';

/**
 * Call a three.ws HTTP endpoint and return its parsed JSON body.
 *
 * @param {string} path  Endpoint path beginning with `/` (e.g. `/api/billing/summary`).
 * @param {{ method?: string, query?: Record<string, unknown>, body?: unknown, auth?: boolean, accept?: string, raw?: boolean }} [opts]
 *   `auth: true` attaches the session cookie and requires THREE_WS_SESSION to be set.
 *   `raw: true` returns `{ status, contentType, text }` instead of parsing JSON (used for CSV export).
 * @returns {Promise<any>} Parsed JSON response, or the raw envelope when `raw` is set.
 * @throws {Error} with `.code` ('no_session' | 'timeout' | 'network_error' | 'upstream_error'),
 *   and on upstream errors `.status` + `.body`.
 */
export async function apiRequest(path, { method = 'GET', query, body, auth = false, accept = 'application/json', raw = false } = {}) {
	if (auth && !THREE_WS_SESSION) {
		throw Object.assign(
			new Error(
				`${path} is account-scoped and needs your three.ws session. Set THREE_WS_SESSION to the ` +
					'value of your `__Host-sid` cookie (copy it from a signed-in three.ws browser session).',
			),
			{ code: 'no_session', status: 401 },
		);
	}

	const url = new URL(`${THREE_WS_BASE}${path}`);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === '') continue;
			url.searchParams.set(key, String(value));
		}
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

	let res;
	try {
		res = await fetch(url, {
			method,
			headers: {
				accept,
				'user-agent': USER_AGENT,
				...(auth && THREE_WS_SESSION ? { cookie: `__Host-sid=${THREE_WS_SESSION}` } : {}),
				...(body !== undefined ? { 'content-type': 'application/json' } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		if (err?.name === 'AbortError') {
			throw Object.assign(new Error(`three.ws ${path} timed out after ${HTTP_TIMEOUT_MS}ms`), {
				code: 'timeout',
			});
		}
		throw Object.assign(new Error(`three.ws ${path} request failed: ${err?.message || err}`), {
			code: 'network_error',
		});
	}
	clearTimeout(timer);

	const text = await res.text();

	// Raw mode: hand back the body untouched (CSV export). Still normalize errors.
	if (raw) {
		if (!res.ok) {
			let data;
			try {
				data = text ? JSON.parse(text) : {};
			} catch {
				data = { raw: text };
			}
			const message = data?.message || data?.error || `three.ws ${path} returned HTTP ${res.status}`;
			throw Object.assign(new Error(message), { code: 'upstream_error', status: res.status, body: data });
		}
		return {
			status: res.status,
			contentType: res.headers.get('content-type') || '',
			disposition: res.headers.get('content-disposition') || '',
			text,
		};
	}

	let data;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = { raw: text };
	}

	if (!res.ok) {
		const message = data?.message || data?.error || `three.ws ${path} returned HTTP ${res.status}`;
		throw Object.assign(new Error(message), { code: 'upstream_error', status: res.status, body: data });
	}
	return data;
}
