import { createAuthClient } from 'better-auth/react';

// Create the Better Auth client
export const authClient = createAuthClient({
    baseURL: 'http://localhost:3001',
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
