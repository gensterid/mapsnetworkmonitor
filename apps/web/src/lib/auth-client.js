import { createAuthClient } from 'better-auth/react';

// Create the Better Auth client
// In production, use relative path (empty string) to go through Nginx proxy
// In development, use localhost:3001
const getBaseURL = () => {
    if (typeof window !== 'undefined') {
        // If running in browser and not on localhost, use relative path
        if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
            return ''; // Relative path - will use current origin
        }
    }
    return 'http://localhost:3001';
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
        isAdmin: user?.role === 'admin',
        isOperator: user?.role === 'operator' || user?.role === 'admin',
        isUser: true,
        isPending,
    };
}

export default authClient;
