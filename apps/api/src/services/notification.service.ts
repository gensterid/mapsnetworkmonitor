import axios from 'axios';
import { db } from '../db/index.js';
import { notificationGroups, routers, routerNetwatch, type Alert } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

export class NotificationService {
    /**
     * Send Telegram Message
     */
    private async sendTelegram(token: string, chatId: string, message: string, threadId?: string) {
        try {
            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const payload: any = {
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
            };

            if (threadId) {
                payload.message_thread_id = threadId;
            }

            await axios.post(url, payload);
            console.log('Telegram message sent successfully');
        } catch (error) {
            console.error('Failed to send Telegram message:', error);
        }
    }

    /**
     * Send WhatsApp Message (aldinokemal/go-whatsapp-web-multidevice compatible)
     * Supports both personal chat (phone number) and group chat (group ID)
     */
    private async sendWhatsapp(url: string, to: string, message: string, key?: string) {
        try {
            // Remove trailing slash if present
            const baseUrl = url.replace(/\/$/, '');

            // Determine if this is a group or personal chat
            // Group IDs are typically longer and don't start with country code like 62
            const isGroup = to.length > 15 || to.includes('@g.us');

            let endpoint: string;
            let payload: any;

            if (isGroup) {
                // For groups: POST /send/message with group_id
                endpoint = `${baseUrl}/send/message`;
                payload = {
                    phone: to.replace('@g.us', '') + '@g.us', // Ensure proper format
                    message: message
                };
            } else {
                // For personal: POST /send/message with phone number  
                endpoint = `${baseUrl}/send/message`;
                payload = {
                    phone: to, // Phone number with country code
                    message: message
                };
            }

            console.log(`[WHATSAPP] Sending to ${to} (${isGroup ? 'group' : 'personal'}) via ${endpoint}`);
            console.log(`[WHATSAPP] Payload:`, JSON.stringify(payload));

            const headers: any = {
                'Content-Type': 'application/json'
            };

            if (key) {
                headers['Authorization'] = `Bearer ${key}`;
            }

            const response = await axios.post(endpoint, payload, { headers, timeout: 10000 });
            console.log('[WHATSAPP] Message sent successfully:', response.data);
        } catch (error: any) {
            console.error('[WHATSAPP] Failed to send message:', error.response?.data || error.message);
            // Log more details for debugging
            if (error.response) {
                console.error('[WHATSAPP] Status:', error.response.status);
                console.error('[WHATSAPP] Headers:', error.response.headers);
            }
        }
    }

    /**
     * Extract IP from alert message (e.g., "Netwatch host 192.168.1.1 (...)" -> "192.168.1.1")
     */
    private extractIpFromMessage(message: string): string | null {
        const ipMatch = message.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        return ipMatch ? ipMatch[1] : null;
    }

    /**
     * Notify Alert
     */
    async notifyAlert(alert: Alert, routerId: string) {
        try {
            // 1. Get Router to find Notification Group
            const router = await db.query.routers.findFirst({
                where: eq(routers.id, routerId),
                with: {
                    // We need to fetch the notification group.
                    // Since we defined the relation in schema but maybe not in relations,
                    // let's do a join or separate fetch if relations aren't set up.
                    // For safety, let's just fetch the group manually using the ID.
                } as any
            });

            if (!router || !router.notificationGroupId) {
                return; // No group assigned
            }

            // 2. Get Notification Group
            const [group] = await db
                .select()
                .from(notificationGroups)
                .where(eq(notificationGroups.id, router.notificationGroupId));

            if (!group) {
                return;
            }

            // 3. For netwatch alerts, try to get netwatch data
            let netwatchData: {
                name: string;
                host: string;
                latitude: string | null;
                longitude: string | null;
                location: string | null;
            } | null = null;

            if (alert.type === 'netwatch_down') {
                // Extract IP from alert message
                const netwatchIp = this.extractIpFromMessage(alert.message);
                if (netwatchIp) {
                    const [netwatch] = await db
                        .select()
                        .from(routerNetwatch)
                        .where(and(
                            eq(routerNetwatch.routerId, routerId),
                            eq(routerNetwatch.host, netwatchIp)
                        ));

                    if (netwatch) {
                        netwatchData = {
                            name: netwatch.name || netwatchIp,
                            host: netwatch.host,
                            latitude: netwatch.latitude,
                            longitude: netwatch.longitude,
                            location: netwatch.location,
                        };
                    }
                }
            }

            // 4. Format Message
            const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';

            // Default template - different for netwatch vs router alerts
            const defaultTemplate = alert.type === 'netwatch_down'
                ? `{{icon}} *{{title}}*

📍 *Device:* {{device}}
🌐 *IP:* {{ip}}
📌 *Location:* {{location}}
🗺️ *Maps:* {{maps_link}}
⏰ *Time:* {{time}}`
                : `{{icon}} *{{title}}*

{{message}}

📍 *Device:* {{device}}
🌐 *IP:* {{ip}}
📌 *Location:* {{location}}
🗺️ *Maps:* {{maps_link}}
⏰ *Time:* {{time}}`;

            const template = group.messageTemplate || defaultTemplate;

            // Format time
            const timeStr = new Date().toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                dateStyle: 'medium',
                timeStyle: 'medium'
            });

            // Determine which data to use (netwatch or router)
            const isNetwatchAlert = alert.type === 'netwatch_down' && netwatchData;

            const deviceName = isNetwatchAlert ? netwatchData!.name : router.name;
            const deviceIp = isNetwatchAlert ? netwatchData!.host : router.host;
            const deviceLocation = isNetwatchAlert
                ? (netwatchData!.location || router.location || '-')
                : (router.location || '-');

            // Coordinates - use netwatch coordinates if available, fallback to router
            const lat = isNetwatchAlert && netwatchData!.latitude
                ? netwatchData!.latitude
                : router.latitude;
            const lon = isNetwatchAlert && netwatchData!.longitude
                ? netwatchData!.longitude
                : router.longitude;

            const hasCoordinates = lat && lon;
            const coordinates = hasCoordinates ? `${lat}, ${lon}` : '-';
            const mapsLink = hasCoordinates
                ? `https://www.google.com/maps?q=${lat},${lon}`
                : '-';

            const message = template
                .replace(/{{icon}}/g, icon)
                .replace(/{{title}}/g, alert.title)
                .replace(/{{message}}/g, alert.message || '')
                .replace(/{{device}}/g, deviceName)
                .replace(/{{ip}}/g, deviceIp)
                .replace(/{{location}}/g, deviceLocation)
                .replace(/{{coordinates}}/g, coordinates)
                .replace(/{{maps_link}}/g, mapsLink)
                .replace(/{{time}}/g, timeStr)
                .replace(/{{severity}}/g, alert.severity)
                .replace(/{{netwatch_host}}/g, netwatchData?.host || '-')
                .replace(/{{netwatch_name}}/g, netwatchData?.name || '-');

            // 4. Send Telegram
            if (group.telegramEnabled && group.telegramBotToken && group.telegramChatId) {
                await this.sendTelegram(
                    group.telegramBotToken,
                    group.telegramChatId,
                    message,
                    group.telegramThreadId || undefined
                );
            }

            // 5. Send WhatsApp
            if (group.whatsappEnabled && group.whatsappUrl && group.whatsappTo) {
                // WhatsApp usually doesn't support markdown in the same way, but let's send it as is.
                // We might want to strip markdown asterisks for WA or keep them if WA supports bold.
                // WA supports *bold*, so it's fine.
                await this.sendWhatsapp(
                    group.whatsappUrl,
                    group.whatsappTo,
                    message,
                    group.whatsappKey || undefined
                );
            }

        } catch (error) {
            console.error('Error in notifyAlert:', error);
        }
    }

    /**
     * Send escalation notification for unresolved down alerts
     */
    async sendEscalationNotification(
        alert: Alert,
        router: {
            id: string;
            name: string;
            host: string;
            latitude?: string | null;
            longitude?: string | null;
            location?: string | null;
            notificationGroupId?: string | null;
        },
        escalationLevel: number,
        downtimeDuration: string,
        netwatchData?: {
            name: string;
            host: string;
            latitude: string | null;
            longitude: string | null;
            location: string | null;
        } | null
    ): Promise<void> {
        try {
            if (!router.notificationGroupId) {
                return; // No group assigned
            }

            // Get Notification Group
            const [group] = await db
                .select()
                .from(notificationGroups)
                .where(eq(notificationGroups.id, router.notificationGroupId));

            if (!group) {
                return;
            }

            // Format time
            const timeStr = new Date().toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                dateStyle: 'medium',
                timeStyle: 'medium'
            });

            // Determine device info
            const isNetwatchAlert = alert.type === 'netwatch_down' && netwatchData;
            const deviceName = isNetwatchAlert ? netwatchData!.name : router.name;
            const deviceIp = isNetwatchAlert ? netwatchData!.host : router.host;
            const deviceLocation = isNetwatchAlert
                ? (netwatchData!.location || router.location || '-')
                : (router.location || '-');

            // Coordinates
            const lat = isNetwatchAlert && netwatchData!.latitude
                ? netwatchData!.latitude
                : router.latitude;
            const lon = isNetwatchAlert && netwatchData!.longitude
                ? netwatchData!.longitude
                : router.longitude;

            const hasCoordinates = lat && lon;
            const mapsLink = hasCoordinates
                ? `https://www.google.com/maps?q=${lat},${lon}`
                : '-';

            // Build escalation message
            const message = `🔴 *[ALERT #${escalationLevel}] ${deviceName} masih DOWN*

⏱️ *Downtime:* ${downtimeDuration}

📍 *Device:* ${deviceName}
🌐 *IP:* ${deviceIp}
📌 *Location:* ${deviceLocation}
🗺️ *Maps:* ${mapsLink}
⏰ *Time:* ${timeStr}`;

            // Send Telegram
            if (group.telegramEnabled && group.telegramBotToken && group.telegramChatId) {
                await this.sendTelegram(
                    group.telegramBotToken,
                    group.telegramChatId,
                    message,
                    group.telegramThreadId || undefined
                );
            }

            // Send WhatsApp
            if (group.whatsappEnabled && group.whatsappUrl && group.whatsappTo) {
                await this.sendWhatsapp(
                    group.whatsappUrl,
                    group.whatsappTo,
                    message,
                    group.whatsappKey || undefined
                );
            }

            console.log(`[NOTIFICATION] Escalation notification sent for ${deviceName} (Level ${escalationLevel})`);
        } catch (error) {
            console.error('Error in sendEscalationNotification:', error);
        }
    }
}

export const notificationService = new NotificationService();
