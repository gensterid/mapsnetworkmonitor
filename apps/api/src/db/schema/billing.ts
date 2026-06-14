import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    bigint,
    boolean,
    numeric,
    jsonb,
    index,
    uniqueIndex,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { routers } from './routers.js';
import { users } from './users.js';

/**
 * Billing module schema (Phase A foundation).
 *
 * Tables:
 *   packages                  — sellable service templates
 *   customers                 — paying end-users
 *   subscriptions             — customer→package binding (PPPoE or recurring hotspot)
 *   invoices                  — generated bills
 *   payments                  — recorded payments (manual or gateway)
 *   voucher_batches           — group identifier for batch-generated hotspot vouchers
 *   vouchers                  — pre-generated hotspot voucher codes
 *   billing_router_settings   — per-router billing configuration (mode, isolir profile, gateways, WA)
 *   wa_notifications_log      — outbound WA notification audit trail
 *
 * Multi-tenant: every record carries tenant_id; queries must always filter
 * on it. router_id is also denormalised on most rows for fast per-router
 * dashboards and to enforce per-router billing settings.
 */

export const packageTypeEnum = pgEnum('billing_package_type', ['pppoe', 'hotspot']);
export const cycleTypeEnum = pgEnum('billing_cycle_type', ['monthly', 'duration']);
export const subscriptionStatusEnum = pgEnum('billing_subscription_status', [
    'active', 'isolir', 'expired', 'cancelled', 'suspended',
]);
export const billingModeEnum = pgEnum('billing_subscription_mode', [
    /** Tagihan setiap tanggal `billing_day` (mis. 1, 13, 25) — semua customer ditagih
     *  pada tanggal yang sama. Cocok kalau operator mau cohort billing bersamaan. */
    'anchor_day',
    /** Tagihan berbasis anniversary — tiap N bulan sejak pembayaran terakhir.
     *  Customer baru join 12 Mei → ditagih 12 Jun, 12 Jul, dst. Cocok kalau customer
     *  ingin siklus pribadi tanpa harus mundur ke awal bulan. */
    'anniversary',
]);
export const invoiceStatusEnum = pgEnum('billing_invoice_status', [
    'unpaid', 'paid', 'overdue', 'cancelled',
]);
export const paymentMethodEnum = pgEnum('billing_payment_method', [
    'manual_cash', 'manual_transfer', 'gateway_tripay', 'gateway_midtrans', 'gateway_xendit',
]);
export const voucherStatusEnum = pgEnum('billing_voucher_status', [
    'unused', 'active', 'expired', 'cancelled',
]);
export const hotspotModeEnum = pgEnum('billing_hotspot_mode', [
    'native', 'mikhmon_bridge', 'disabled',
]);
export const waProviderEnum = pgEnum('billing_wa_provider', [
    'fonnte', 'wablas', 'webhook', 'none',
]);
export const waNotifTypeEnum = pgEnum('billing_wa_notif_type', [
    'h_minus_1', 'due_day', 'overdue', 'isolir', 'voucher_expiry', 'payment_received', 'manual',
]);
export const waNotifStatusEnum = pgEnum('billing_wa_notif_status', [
    'queued', 'sent', 'failed',
]);

// ─────────────────────────────────────────────────────────────────────────
// packages
// ─────────────────────────────────────────────────────────────────────────
export const packages = pgTable('billing_packages', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id').references(() => routers.id, { onDelete: 'set null' }),

    name: text('name').notNull(),
    type: packageTypeEnum('type').notNull(),
    mikrotikProfile: text('mikrotik_profile').notNull(),

    price: numeric('price', { precision: 14, scale: 2 }).notNull().default('0'),

    cycleType: cycleTypeEnum('cycle_type').notNull(),
    /** months for cycle_type='monthly', seconds for cycle_type='duration' */
    cycleValue: integer('cycle_value').notNull().default(1),

    description: text('description'),
    active: boolean('active').notNull().default(true),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_pkg_tenant_idx').on(t.tenantId),
    routerIdx: index('billing_pkg_router_idx').on(t.routerId),
    typeIdx: index('billing_pkg_type_idx').on(t.type),
}));

// ─────────────────────────────────────────────────────────────────────────
// customers
// ─────────────────────────────────────────────────────────────────────────
export const customers = pgTable('billing_customers', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

    code: text('code').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),

    /** PIN for /member portal login. Default = last 4 of phone. */
    pinCode: text('pin_code'),

    notes: text('notes'),
    active: boolean('active').notNull().default(true),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_cust_tenant_idx').on(t.tenantId),
    codeUnq: uniqueIndex('billing_cust_tenant_code_unq').on(t.tenantId, t.code),
    phoneIdx: index('billing_cust_phone_idx').on(t.phone),
}));

// ─────────────────────────────────────────────────────────────────────────
// subscriptions
// ─────────────────────────────────────────────────────────────────────────
export const subscriptions = pgTable('billing_subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),
    routerId: uuid('router_id').notNull().references(() => routers.id, { onDelete: 'cascade' }),

    type: packageTypeEnum('type').notNull(),

    /** PPPoE username or hotspot voucher code — must be unique per router for the type */
    mikrotikIdentity: text('mikrotik_identity').notNull(),
    /** encrypted via lib/encryption (same key as router credentials) */
    mikrotikPasswordEncrypted: text('mikrotik_password_encrypted'),

    /** day of month (1-28) when invoice is generated; only meaningful for cycleType=monthly
     *  AND billing_mode='anchor_day'. Ignored in anniversary mode. */
    billingDay: integer('billing_day'),

    /** How nextDueAt is computed at each cycle:
     *  - anchor_day  → next billing_day in calendar (existing behavior, default)
     *  - anniversary → activatedAt/lastInvoicedAt + cycle_months bulan kalender */
    billingMode: billingModeEnum('billing_mode').notNull().default('anchor_day'),

    activatedAt: timestamp('activated_at'),
    /** for hotspot duration packages — when access expires */
    expiresAt: timestamp('expires_at'),

    status: subscriptionStatusEnum('status').notNull().default('active'),
    statusReason: text('status_reason'),

    /** when next invoice should be generated */
    nextDueAt: timestamp('next_due_at'),
    lastInvoicedAt: timestamp('last_invoiced_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_sub_tenant_idx').on(t.tenantId),
    customerIdx: index('billing_sub_customer_idx').on(t.customerId),
    routerIdx: index('billing_sub_router_idx').on(t.routerId),
    statusIdx: index('billing_sub_status_idx').on(t.status),
    nextDueIdx: index('billing_sub_next_due_idx').on(t.nextDueAt),
    expiresIdx: index('billing_sub_expires_idx').on(t.expiresAt),
    identityUnq: uniqueIndex('billing_sub_router_type_identity_unq')
        .on(t.routerId, t.type, t.mikrotikIdentity),
}));

// ─────────────────────────────────────────────────────────────────────────
// invoices
// ─────────────────────────────────────────────────────────────────────────
export const invoices = pgTable('billing_invoices', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id').references(() => routers.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    packageId: uuid('package_id').references(() => packages.id, { onDelete: 'set null' }),

    /** format: INV-YYYYMM-NNNN, unique per tenant */
    invoiceNumber: text('invoice_number').notNull(),

    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),

    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),

    status: invoiceStatusEnum('status').notNull().default('unpaid'),
    dueAt: timestamp('due_at').notNull(),
    paidAt: timestamp('paid_at'),

    notes: text('notes'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_inv_tenant_idx').on(t.tenantId),
    customerIdx: index('billing_inv_customer_idx').on(t.customerId),
    statusIdx: index('billing_inv_status_idx').on(t.status),
    dueAtIdx: index('billing_inv_due_at_idx').on(t.dueAt),
    numberUnq: uniqueIndex('billing_inv_tenant_number_unq').on(t.tenantId, t.invoiceNumber),
}));

// ─────────────────────────────────────────────────────────────────────────
// payments
// ─────────────────────────────────────────────────────────────────────────
export const payments = pgTable('billing_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),

    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum('method').notNull(),

    gatewayTxnId: text('gateway_txn_id'),
    gatewayPayload: jsonb('gateway_payload'),

    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    recordedAt: timestamp('recorded_at').notNull().defaultNow(),
    notes: text('notes'),
}, (t) => ({
    tenantIdx: index('billing_pay_tenant_idx').on(t.tenantId),
    invoiceIdx: index('billing_pay_invoice_idx').on(t.invoiceId),
    methodIdx: index('billing_pay_method_idx').on(t.method),
    gatewayTxnUnq: uniqueIndex('billing_pay_gateway_txn_unq').on(t.method, t.gatewayTxnId),
}));

// ─────────────────────────────────────────────────────────────────────────
// voucher_batches
// ─────────────────────────────────────────────────────────────────────────
export const voucherBatches = pgTable('billing_voucher_batches', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id').notNull().references(() => routers.id, { onDelete: 'cascade' }),
    packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),

    count: integer('count').notNull(),
    prefix: text('prefix'),
    notes: text('notes'),

    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_vb_tenant_idx').on(t.tenantId),
    routerIdx: index('billing_vb_router_idx').on(t.routerId),
}));

// ─────────────────────────────────────────────────────────────────────────
// vouchers
// ─────────────────────────────────────────────────────────────────────────
export const vouchers = pgTable('billing_vouchers', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id').notNull().references(() => routers.id, { onDelete: 'cascade' }),
    packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),
    batchId: uuid('batch_id').references(() => voucherBatches.id, { onDelete: 'set null' }),

    code: text('code').notNull(),
    pinCode: text('pin_code'),
    profile: text('profile').notNull(),
    /** snapshot of price at generation time */
    price: numeric('price', { precision: 14, scale: 2 }).notNull().default('0'),

    printedAt: timestamp('printed_at'),
    redeemedAt: timestamp('redeemed_at'),
    expiresAt: timestamp('expires_at'),

    status: voucherStatusEnum('status').notNull().default('unused'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_v_tenant_idx').on(t.tenantId),
    routerIdx: index('billing_v_router_idx').on(t.routerId),
    batchIdx: index('billing_v_batch_idx').on(t.batchId),
    statusIdx: index('billing_v_status_idx').on(t.status),
    codeUnq: uniqueIndex('billing_v_router_code_unq').on(t.routerId, t.code),
}));

// ─────────────────────────────────────────────────────────────────────────
// billing_router_settings (per-router config)
// ─────────────────────────────────────────────────────────────────────────
export const billingRouterSettings = pgTable('billing_router_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id').notNull().references(() => routers.id, { onDelete: 'cascade' }),

    pppoeBillingEnabled: boolean('pppoe_billing_enabled').notNull().default(false),
    hotspotMode: hotspotModeEnum('hotspot_mode').notNull().default('disabled'),

    isolirProfile: text('isolir_profile').default('pppoe-isolir'),
    isolirRedirectUrl: text('isolir_redirect_url'),
    isolirGraceDays: integer('isolir_grace_days').notNull().default(0),

    /** Jam mulai (0-23) untuk eksekusi cek isolir. App + scheduler MikroTik
     * skip auto-isolir kalau hour-of-day di luar [start, end].
     * Default 08:00-17:00 supaya tidak isolir tengah malam — customer komplain
     * bangun pagi internet mati. Operator boleh ubah ke 18-23 kalau prefer
     * isolir sore. */
    isolirCheckStartHour: integer('isolir_check_start_hour').notNull().default(8),
    isolirCheckEndHour: integer('isolir_check_end_hour').notNull().default(17),

    defaultBillingDay: integer('default_billing_day').notNull().default(1),

    waProvider: waProviderEnum('wa_provider').notNull().default('none'),
    /** provider-specific config (api key, sender, webhook url, etc) */
    waConfig: jsonb('wa_config'),

    waNotifHMinus1Enabled: boolean('wa_notif_h_minus_1_enabled').notNull().default(true),
    waNotifDueDayEnabled: boolean('wa_notif_due_day_enabled').notNull().default(true),
    waNotifOverdueEnabled: boolean('wa_notif_overdue_enabled').notNull().default(true),
    waNotifIsolirEnabled: boolean('wa_notif_isolir_enabled').notNull().default(true),

    gatewayTripayEnabled: boolean('gateway_tripay_enabled').notNull().default(false),
    gatewayMidtransEnabled: boolean('gateway_midtrans_enabled').notNull().default(false),
    gatewayXenditEnabled: boolean('gateway_xendit_enabled').notNull().default(false),
    /** gateway credentials per provider */
    gatewayConfig: jsonb('gateway_config'),

    invoiceFooterText: text('invoice_footer_text'),
    voucherTemplate: text('voucher_template').default('default'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_rs_tenant_idx').on(t.tenantId),
    routerUnq: uniqueIndex('billing_rs_router_unq').on(t.routerId),
}));

// ─────────────────────────────────────────────────────────────────────────
// wa_notifications_log
// ─────────────────────────────────────────────────────────────────────────
export const waNotificationsLog = pgTable('billing_wa_notifications_log', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id').references(() => routers.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    voucherId: uuid('voucher_id').references(() => vouchers.id, { onDelete: 'set null' }),

    toPhone: text('to_phone').notNull(),
    type: waNotifTypeEnum('type').notNull(),
    provider: waProviderEnum('provider').notNull(),

    status: waNotifStatusEnum('status').notNull().default('queued'),
    providerResponse: jsonb('provider_response'),
    error: text('error'),

    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('billing_wa_log_tenant_idx').on(t.tenantId),
    customerIdx: index('billing_wa_log_customer_idx').on(t.customerId),
    invoiceIdx: index('billing_wa_log_invoice_idx').on(t.invoiceId),
    statusIdx: index('billing_wa_log_status_idx').on(t.status),
    createdIdx: index('billing_wa_log_created_idx').on(t.createdAt),
}));

// ─────────────────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────────────────
export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Voucher = typeof vouchers.$inferSelect;
export type NewVoucher = typeof vouchers.$inferInsert;
export type VoucherBatch = typeof voucherBatches.$inferSelect;
export type NewVoucherBatch = typeof voucherBatches.$inferInsert;
export type BillingRouterSetting = typeof billingRouterSettings.$inferSelect;
export type NewBillingRouterSetting = typeof billingRouterSettings.$inferInsert;
export type WaNotificationLog = typeof waNotificationsLog.$inferSelect;
export type NewWaNotificationLog = typeof waNotificationsLog.$inferInsert;
