import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, numeric, uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const usd = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' });

export const settings = pgTable('settings', {
  id: integer('id').primaryKey(), // always 1: one seeded demo brand
  dailyLimitUsd: usd('daily_limit_usd').notNull(),
});

export const apiTokens = pgTable('api_tokens', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['extension', 'agent'] }).notNull(),
  scopes: text('scopes').array().notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  affiliateId: uuid('affiliate_id'), // set for AI-agent affiliate tokens
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: created(),
});

export const pairingCodes = pgTable('pairing_codes', {
  code: text('code').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const purchases = pgTable('purchases', {
  id: id(),
  item: text('item', { enum: ['image', 'video', 'compare'] }).notNull(),
  priceUsd: usd('price_usd').notNull(),
  status: text('status', { enum: ['paid', 'pending_approval', 'failed'] }).notNull(),
  qatomPurchaseId: text('qatom_purchase_id'),
  receiptId: text('receipt_id'),
  receiptUrl: text('receipt_url'),
  reason: text('reason'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  input: jsonb('input').notNull(), // what to analyze once paid
  createdAt: created(),
});

export const analyses = pgTable('analyses', {
  id: id(),
  creativeHash: text('creative_hash').notNull(),
  item: text('item').notNull(),
  creativeUrl: text('creative_url').notNull(),
  result: jsonb('result_json').notNull(),
  purchaseId: uuid('purchase_id'),
  receiptId: text('receipt_id'),
  receiptUrl: text('receipt_url'),
  priceUsd: usd('price_usd').notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex('analyses_hash_item').on(t.creativeHash, t.item)]);

export const blockedEvents = pgTable('blocked_events', {
  id: id(),
  caller: text('caller').notNull(),
  reason: text('reason').notNull(),
  detail: jsonb('detail_json'),
  createdAt: created(),
});

export const affiliateOffers = pgTable('affiliate_offers', {
  id: id(),
  name: text('name').notNull(),
  creativeUrl: text('creative_url').notNull(),
  creativeType: text('creative_type', { enum: ['image', 'video'] }).notNull().default('image'),
  analysisId: uuid('analysis_id'),
  neuralScore: integer('neural_score'),
  landingUrl: text('landing_url'), // null = this app's demo store
  cpcUsd: usd('cpc_usd').notNull().default(0),
  cpaUsd: usd('cpa_usd').notNull().default(0),
  revsharePct: usd('revshare_pct').notNull().default(0),
  payoutMode: text('payout_mode', { enum: ['hold', 'instant', 'batch'] }).notNull().default('hold'),
  holdMinutes: integer('hold_minutes').notNull().default(2),
  dailyCapPerAffiliateUsd: usd('daily_cap_per_affiliate_usd').notNull().default(50),
  totalBudgetUsd: usd('total_budget_usd').notNull().default(500),
  webhookSecret: text('webhook_secret').notNull(),
  status: text('status', { enum: ['active', 'paused'] }).notNull().default('active'),
  createdAt: created(),
});

export const affiliates = pgTable('affiliates', {
  id: id(),
  type: text('type', { enum: ['creator', 'agency', 'agent'] }).notNull(),
  displayName: text('display_name').notNull(),
  qatomAccountId: text('qatom_account_id'),
  verified: boolean('verified').notNull().default(false),
  createdAt: created(),
});

export const affiliateLinks = pgTable('affiliate_links', {
  id: id(),
  offerId: uuid('offer_id').notNull().references(() => affiliateOffers.id),
  affiliateId: uuid('affiliate_id').notNull().references(() => affiliates.id),
  code: text('code').notNull().unique(),
  createdAt: created(),
});

export const affiliateEvents = pgTable('affiliate_events', {
  id: id(),
  linkId: uuid('link_id').notNull().references(() => affiliateLinks.id),
  offerId: uuid('offer_id').notNull(),
  type: text('type', { enum: ['click', 'qualified_click', 'conversion', 'refund'] }).notNull(),
  visitorHash: text('visitor_hash'),
  orderId: text('order_id'),
  orderValueUsd: usd('order_value_usd'),
  isNewCustomer: boolean('is_new_customer'),
  dwellMs: integer('dwell_ms'),
  createdAt: created(),
}, (t) => [uniqueIndex('events_offer_order_type').on(t.offerId, t.orderId, t.type)]);

export const affiliateEarnings = pgTable('affiliate_earnings', {
  id: id(),
  eventId: uuid('event_id').notNull(),
  affiliateId: uuid('affiliate_id').notNull(),
  offerId: uuid('offer_id').notNull(),
  kind: text('kind', { enum: ['cpc', 'cpa', 'revshare', 'clawback'] }).notNull(),
  amountUsd: usd('amount_usd').notNull(),
  status: text('status', { enum: ['pending_hold', 'payable', 'paid', 'clawed_back', 'blocked'] }).notNull(),
  releaseAt: timestamp('release_at', { withTimezone: true }),
  payoutId: uuid('payout_id'),
  createdAt: created(),
});

export const affiliatePayouts = pgTable('affiliate_payouts', {
  id: id(),
  affiliateId: uuid('affiliate_id').notNull(),
  amountUsd: usd('amount_usd').notNull(),
  qatomReceiptId: text('qatom_receipt_id'),
  receiptUrl: text('receipt_url'),
  status: text('status', { enum: ['pending_approval', 'paid', 'failed'] }).notNull(),
  createdAt: created(),
});
