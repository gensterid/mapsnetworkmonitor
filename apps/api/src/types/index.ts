// Re-export types from schema
export type {
    User,
    NewUser,
    Session,
    Account,
    Router,
    NewRouter,
    RouterInterface,
    RouterMetric,
    Alert,
    NewAlert,
    NetwatchHost,
    RouterGroup,
    NewRouterGroup,
    AppSetting,
    AuditLog,
} from '../db/schema';

// API Response types
export interface ApiResponse<T> {
    data?: T;
    error?: string;
    message?: string;
    details?: unknown;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// User roles
export type UserRole = 'admin' | 'operator' | 'user';

// Router status
export type RouterStatus = 'online' | 'offline' | 'maintenance' | 'unknown';

// Alert types
export type AlertType =
    | 'status_change'
    | 'high_cpu'
    | 'high_memory'
    | 'high_disk'
    | 'interface_down'
    | 'netwatch_down'
    | 'threshold'
    | 'reboot';

export type AlertSeverity = 'info' | 'warning' | 'critical';
