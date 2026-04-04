import axios from 'axios';
import { db } from '../db/index.js';
import { notificationGroups, routers, routerNetwatch, type Alert } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

// System timezone: reads from env TZ, falls back to user schema default
const SYSTEM_TIMEZONE = process.env.TZ || 'Asia/Makassar';

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
                parse_mode: 'HTML',
            };

            if (threadId) {
                payload.message_thread_id = threadId;
            }

            await axios.post(url, payload);
            logger.info({ chatId, threadId }, 'Telegram message sent successfully');
        } catch (error: any) {
            logger.error({
                err: error?.response?.data || error?.message,
                chatId,
                messageSnippet: message.substring(0, 100)
            }, 'Failed to send Telegram message');
        }
    }

    /**
     * Escape HTML special characters for Telegram HTML mode
     */
    private escapeHtml(text: string): string {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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

            logger.debug({ to, isGroup, endpoint, payload }, '[WHATSAPP] Sending message');

            const headers: any = {
                'Content-Type': 'application/json'
            };

            if (key) {
                headers['Authorization'] = `Bearer ${key}`;
            }

            const response = await axios.post(endpoint, payload, { headers, timeout: 10000 });
            logger.info({ to, responseData: response.data }, '[WHATSAPP] Message sent successfully');
        } catch (error: any) {
            logger.error({
                err: error,
                to,
                responseData: error.response?.data,
                status: error.response?.status
            }, '[WHATSAPP] Failed to send message');
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
            const [router] = await db
                .select()
                .from(routers)
                .where(eq(routers.id, routerId));

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
                host: string | null;
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
            // Default uses HTML tags for Telegram stability
            const defaultTemplate = alert.type === 'netwatch_down'
                ? `{{icon}} <b>{{title}}</b>

📍 <b>Device:</b> {{device}}
🌐 <b>IP:</b> {{ip}}
📌 <b>Location:</b> {{location}}
🗺️ <b>Maps:</b> {{maps_link}}
⏰ <b>Time:</b> {{time}}`
                : `{{icon}} <b>{{title}}</b>

{{message}}

📍 <b>Device:</b> {{device}}
🌐 <b>IP:</b> {{ip}}
📌 <b>Location:</b> {{location}}
🗺️ <b>Maps:</b> {{maps_link}}
⏰ <b>Time:</b> {{time}}`;

            const rawTemplate = group.messageTemplate || defaultTemplate;

            // Format time
            const timeStr = new Date().toLocaleString('id-ID', {
                timeZone: SYSTEM_TIMEZONE,
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

            // Escape all dynamic values for HTML
            const e = (val: any) => {
                if (val === null || val === undefined || val === '') return '-';
                return this.escapeHtml(String(val));
            };

            const message = rawTemplate
                .replace(/{{icon}}/g, icon)
                .replace(/{{title}}/g, e(alert.title))
                .replace(/{{message}}/g, e(alert.message || ''))
                .replace(/{{device}}/g, e(deviceName))
                .replace(/{{ip}}/g, e(deviceIp))
                .replace(/{{location}}/g, e(deviceLocation))
                .replace(/{{coordinates}}/g, e(coordinates))
                .replace(/{{maps_link}}/g, e(mapsLink))
                .replace(/{{time}}/g, e(timeStr))
                .replace(/{{severity}}/g, e(alert.severity))
                .replace(/{{netwatch_host}}/g, e(netwatchData?.host || '-'))
                .replace(/{{netwatch_name}}/g, e(netwatchData?.name || '-'));

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
                // WhatsApp uses *bold* instead of <b>
                const waMessage = message
                    .replace(/<b>/g, '*')
                    .replace(/<\/b>/g, '*')
                    .replace(/<i>/g, '_')
                    .replace(/<\/i>/g, '_')
                    // Simple unescape for WA as it doesn't need HTML entities
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#039;/g, "'");

                await this.sendWhatsapp(
                    group.whatsappUrl,
                    group.whatsappTo,
                    waMessage,
                    group.whatsappKey || undefined
                );
            }

        } catch (error) {
            logger.error({ err: error, alertId: alert.id }, 'Error in notifyAlert');
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
            host: string | null;
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
                timeZone: SYSTEM_TIMEZONE,
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

            // Escape dynamic values
            const e = (val: any) => this.escapeHtml(String(val || ''));

            // Build escalation message (HTML format)
            const message = `🔴 <b>[ALERT #${escalationLevel}] ${e(deviceName)} masih DOWN</b>

⏱️ <b>Downtime:</b> ${e(downtimeDuration)}

📍 <b>Device:</b> ${e(deviceName)}
🌐 <b>IP:</b> ${e(deviceIp)}
📌 <b>Location:</b> ${e(deviceLocation)}
🗺️ <b>Maps:</b> ${e(mapsLink)}
⏰ <b>Time:</b> ${e(timeStr)}`;

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
                // Simple conversion to WA format
                const waMessage = message
                    .replace(/<b>/g, '*')
                    .replace(/<\/b>/g, '*')
                    // Simple unescape
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#039;/g, "'");

                await this.sendWhatsapp(
                    group.whatsappUrl,
                    group.whatsappTo,
                    waMessage,
                    group.whatsappKey || undefined
                );
            }

            logger.info({ deviceName: router.name, escalationLevel }, '[NOTIFICATION] Escalation notification sent');
        } catch (error) {
            logger.error({ err: error, deviceName: router.name, escalationLevel }, 'Error in sendEscalationNotification');
        }
    }
}

export const notificationService = new NotificationService();
