import { createAuthClient } from 'better-auth/react';

// Create the Better Auth client
// In production, use relative path (empty string) to go through Nginx proxy
// In development, use localhost:3001
const getBaseURL = () => {
    if (typeof window !== 'undefined') {
        // In local development, we want to use the Vite proxy (/api)
        // rather than hitting port 3002 directly. This ensures cookies are
        // sent correctly from the web origin (e.g., port 5173).
        // note: better-auth requires a full URL with protocol and path to the auth mount point
        return window.location.origin + '/api/auth';
    }
    return 'http://127.0.0.1:3001/api/auth';
};

export const authClient = createAuthClient({
    baseURL: getBaseURL(),
});

// Export auth methods for easy access
export const {
    signIn,
    signUp,
    signOut,
    useSession,
    getSession,
} = authClient;

/**
 * Custom hook to check if user is authenticated
 */
export function useAuth() {
    const { data: session, isPending, error } = useSession();

    return {
        user: session?.user || null,
        session: session?.session || null,
        isAuthenticated: !!session?.user,
        isLoading: isPending,
        error,
    };
}

/**
 * Custom hook to check user role
 */
export function useRole() {
    const { data: session, isPending } = useSession();
    const user = session?.user || null;

    return {
        role: user?.role || 'user',
        isSuperAdmin: user?.role === 'superadmin',
        isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
        isOperator: user?.role === 'operator' || user?.role === 'admin' || user?.role === 'superadmin',
        isUser: true,
        isPending,
    };
}

export default authClient;
