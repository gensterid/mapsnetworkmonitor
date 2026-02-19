import { useSettings } from './useSettings';
import { useCurrentUser } from './useUsers';

/**
 * Custom hook to derive the active timezone for the application.
 * Priority:
 * 1. Current User's Profile Setting
 * 2. Application General Setting
 * 3. Browser's Detected Timezone
 * 4. Fallback: 'Asia/Jakarta'
 */
export function useAppTimezone() {
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const timezone = currentUser?.timezone ||
        settings?.timezone ||
        browserTimezone ||
        'Asia/Jakarta';

    return timezone;
}
