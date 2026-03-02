import {
    pgTable,
    uuid,
    text,
    decimal,
    timestamp,
    index,
} from 'drizzle-orm/pg-core';
import { routers } from './routers.js';
import { tenants } from './tenants.js';

/**
 * Topology Nodes table
 * Represents a device placed on a specific router's schematic canvas.
 */
export const topologyNodes = pgTable('topology_nodes', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),

    // The device being placed (can be a Router ID, OLT ID, or Netwatch ID)
    nodeId: uuid('node_id'), // Now nullable
    nodeType: text('node_type').notNull(), // 'router', 'olt', 'netwatch', 'switch'

    // Custom fields for unmapped nodes
    customName: text('custom_name'),
    customHost: text('custom_host'),
    customType: text('custom_type'),

    // Schematic positions (independent of geo-coordinates)
    x: decimal('x', { precision: 10, scale: 2 }).notNull().default('0'),
    y: decimal('y', { precision: 10, scale: 2 }).notNull().default('0'),

    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    routerIdIdx: index('topology_nodes_router_id_idx').on(table.routerId),
    nodeIdIdx: index('topology_nodes_node_id_idx').on(table.nodeId),
    tenantIdIdx: index('topology_nodes_tenant_id_idx').on(table.tenantId),
}));

/**
 * Topology Links table
 * Represents a manual connection between two nodes on a schematic canvas.
 */
export const topologyLinks = pgTable('topology_links', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),

    // IDs of the devices (matching nodeId in topologyNodes)
    sourceNodeId: uuid('source_node_id').notNull(),
    targetNodeId: uuid('target_node_id').notNull(),

    // Manual port names
    sourceInterface: text('source_interface'),
    targetInterface: text('target_interface'),
    pathOffset: decimal('path_offset', { precision: 10, scale: 2 }).default('0'),
    animationType: text('animation_type').default('pulse'), // 'pulse', 'dash', 'none'

    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    routerIdIdx: index('topology_links_router_id_idx').on(table.routerId),
    sourceNodeIdx: index('topology_links_source_idx').on(table.sourceNodeId),
    targetNodeIdx: index('topology_links_target_idx').on(table.targetNodeId),
    tenantIdIdx: index('topology_links_tenant_id_idx').on(table.tenantId),
}));
