import { routerActionService } from '../router-action.service.js';
import {
    getPppProfiles, addPppProfile,
    inspectIsolirFirewall, setupIsolirFirewall,
    type PppProfile, type IsolirFirewallStatus,
} from '../../lib/mikrotik/billing.js';
import { logger } from '../../lib/logger.js';

/**
 * Auto-detect + auto-setup helpers for the billing module.
 *
 * - listPppProfiles: probe MikroTik for existing PPP profiles so the UI can
 *   render a dropdown instead of asking the operator to type a profile name
 *   that may not exist.
 *
 * - getIsolirReadiness: combine profile check + firewall check in one call.
 *
 * - autoCreateIsolir: create a missing isolir profile + firewall redirect
 *   in one go. Idempotent, safe to re-run.
 */

export interface IsolirReadiness {
    profileExists: boolean;
    profileName: string;
    rateLimit?: string | null;
    profiles: PppProfile[];
    firewall: IsolirFirewallStatus;
}

export const mikrotikSetupService = {
    async listPppProfiles(routerId: string, tenantId?: string): Promise<PppProfile[]> {
        const api = await routerActionService.getRouterConnection(routerId, tenantId);
        return getPppProfiles(api);
    },

    /**
     * Check whether the configured isolir profile + firewall walled-garden
     * is already in place on the router.
     */
    async getIsolirReadiness(routerId: string, profileName: string = 'pppoe-isolir', listName: string = 'isolir', tenantId?: string): Promise<IsolirReadiness> {
        const api = await routerActionService.getRouterConnection(routerId, tenantId);
        const profiles = await getPppProfiles(api);
        const found = profiles.find(p => p.name === profileName);
        const firewall = await inspectIsolirFirewall(api, listName);
        return {
            profileExists: !!found,
            profileName,
            rateLimit: found?.rateLimit || null,
            profiles,
            firewall,
        };
    },

    /**
     * Create the isolir profile (if missing) + firewall pieces (if missing).
     * Operator can pass:
     *   - profileName: name of profile to ensure (default 'pppoe-isolir')
     *   - rateLimit:   throttle, default '256k/256k'
     *   - addressListName: firewall address-list name (default 'isolir')
     *   - redirectIp:  billing host IP for HTTP redirect
     *   - redirectPort:default 80
     *   - addWalledGarden: also drop non-HTTP traffic from isolir users
     */
    async autoCreateIsolir(routerId: string, opts: {
        profileName?: string;
        rateLimit?: string;
        remoteAddress?: string;          // pool name or static range
        addressListName?: string;
        redirectIp?: string;
        redirectPort?: number;
        addWalledGarden?: boolean;
    } = {}, tenantId?: string): Promise<{
        profile: { created: boolean; name: string; id?: string | null };
        firewall: { addressListId: string | null; natRedirectId: string | null; filterAllowId: string | null; filterDropId: string | null };
    }> {
        const api = await routerActionService.getRouterConnection(routerId, tenantId);
        const profileName = opts.profileName || 'pppoe-isolir';
        const listName = opts.addressListName || 'isolir';

        // 1. Ensure profile exists
        const profiles = await getPppProfiles(api);
        const existing = profiles.find(p => p.name === profileName);
        let profileId: string | null | undefined = existing?.id;
        let createdProfile = false;
        if (!existing) {
            try {
                profileId = await addPppProfile(api, {
                    name: profileName,
                    rateLimit: opts.rateLimit || '256k/256k',
                    remoteAddress: opts.remoteAddress,
                    addressList: listName,
                    onlyOne: 'yes',
                    comment: 'auto-created by billing system',
                });
                createdProfile = true;
                logger.info({ routerId, profileName }, 'auto-created isolir PPP profile');
            } catch (e: any) {
                throw new Error(`Gagal buat profile ${profileName}: ${e?.message || e}`);
            }
        }

        // 2. Firewall pieces (only if redirectIp provided)
        let firewallResult: {
            addressListId: string | null;
            natRedirectId: string | null;
            filterAllowId: string | null;
            filterDropId: string | null;
        } = { addressListId: null, natRedirectId: null, filterAllowId: null, filterDropId: null };
        if (opts.redirectIp) {
            try {
                firewallResult = await setupIsolirFirewall(api, {
                    listName,
                    redirectIp: opts.redirectIp,
                    redirectPort: opts.redirectPort,
                    addWalledGarden: opts.addWalledGarden,
                });
            } catch (e: any) {
                logger.warn({ err: e?.message, routerId }, 'firewall setup failed (non-fatal — profile already created)');
            }
        }

        return {
            profile: { created: createdProfile, name: profileName, id: profileId },
            firewall: firewallResult,
        };
    },
};
