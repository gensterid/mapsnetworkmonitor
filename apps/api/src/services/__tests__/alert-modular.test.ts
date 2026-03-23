import { describe, it, expect, vi, beforeEach } from 'vitest';
import { alertQueryService } from '../alert-query.service.js';
import { alertActionService } from '../alert-action.service.js';
import { isIssue } from '../alert-core.service.js';

// Mock drizzle-orm and db
vi.mock('drizzle-orm', async () => {
    const actual = await vi.importActual('drizzle-orm');
    return {
        ...actual,
        eq: vi.fn(),
        and: vi.fn(),
        desc: vi.fn(),
        asc: vi.fn(),
    };
});

vi.mock('../db/index.js', () => ({
    db: {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn(() => ({
                        limit: vi.fn(() => ({
                            offset: vi.fn(() => Promise.resolve([])),
                        })),
                    })),
                })),
            })),
        })),
        update: vi.fn(() => ({
            set: vi.fn(() => ({
                where: vi.fn(() => ({
                    returning: vi.fn(() => Promise.resolve([])),
                })),
            })),
        })),
    },
}));

describe('Alert Services Refactoring Tests', () => {
    describe('AlertQueryService', () => {
        it('should correctly identify issues', () => {
            const issueAlert = { type: 'high_cpu', severity: 'critical' } as any;
            const connectivityAlert = { type: 'status_change', severity: 'info' } as any;
            
            expect(isIssue(issueAlert.type, issueAlert.severity)).toBe(true);
            expect(isIssue(connectivityAlert.type, connectivityAlert.severity)).toBe(false);
        });
    });

    describe('AlertActionService', () => {
        it('should have the create method', () => {
            expect(typeof alertActionService.create).toBe('function');
        });

        it('should have the acknowledge method', () => {
            expect(typeof alertActionService.acknowledge).toBe('function');
        });
    });
});
