// `get_revenue` — earnings for the agents you own: the income side of billing.
// Account-scoped (session). Read-only.
//
// Wraps GET /api/billing/revenue. Aggregates agent_revenue_events for your
// agents over a window into gross/fee/net totals, a per-skill breakdown, and a
// time series at day/week/month granularity. Also surfaces creator-subscription
// income (USD, settled directly to your wallet — kept separate from the
// withdrawable pool) and a reconciliation summary.

import { z } from 'zod';

import { apiRequest } from '../lib/api.js';

export const def = {
	name: 'get_revenue',
	title: 'My agents’ earnings (revenue + subscriptions)',
	annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
	description:
		'Earnings for the agents YOU own — the income side of your account economics (what you EARNED, vs what you ' +
		'were charged in query_usage). Returns `summary` (gross_total, fee_total, net_total in token atomics, ' +
		'plus payment_count, currency_mint, chain), `by_skill` (net_total + count per skill, top first), ' +
		'`timeseries` (net_total + count bucketed by granularity), `subscriptions` (creator-subscription income in ' +
		'USD — income_usd, payment_count, active_subscribers, plan_count — settled directly to your wallet, kept ' +
		'separate from the withdrawable pool so units never mix), `subscription_timeseries`, and `reconciliation`. ' +
		'Optional `agent_id` narrows to one agent; `from`/`to` set the window (default last 30 days); `granularity` ' +
		'is day | week | month (default day). Requires THREE_WS_SESSION. Read-only.',
	inputSchema: {
		agent_id: z
			.string()
			.uuid('agent_id must be a UUID')
			.optional()
			.describe('Limit to a single agent you own (UUID). Omit to aggregate across all your agents.'),
		from: z
			.string()
			.optional()
			.describe('Window start, ISO-8601. Defaults to 30 days ago.'),
		to: z
			.string()
			.optional()
			.describe('Window end, ISO-8601. Defaults to now.'),
		granularity: z
			.enum(['day', 'week', 'month'])
			.default('day')
			.describe('Time-series bucket size (default day).'),
	},
	async handler(args) {
		const data = await apiRequest('/api/billing/revenue', {
			auth: true,
			query: {
				agent_id: args?.agent_id,
				from: args?.from,
				to: args?.to,
				granularity: args?.granularity ?? 'day',
			},
		});

		return {
			ok: true,
			summary: data?.summary ?? null,
			by_skill: Array.isArray(data?.by_skill) ? data.by_skill : [],
			timeseries: Array.isArray(data?.timeseries) ? data.timeseries : [],
			subscriptions: data?.subscriptions ?? null,
			subscription_timeseries: Array.isArray(data?.subscription_timeseries) ? data.subscription_timeseries : [],
			reconciliation: data?.reconciliation ?? null,
		};
	},
};
