import { describe, it, expect, vi } from 'vitest';
import { sanitizeMiddleware } from '../../middleware/sanitize.middleware.js';

vi.mock('../../lib/logger.js', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

describe('SanitizeMiddleware Unit Tests', () => {
    it('should sanitize HTML tags in req.body', () => {
        const req = {
            body: {
                username: '<script>alert("xss")</script>user1',
                bio: '<b>Hello</b>'
            },
            path: '/test'
        } as any;
        const res = {} as any;
        const next = vi.fn();

        sanitizeMiddleware(req, res, next);

        expect(req.body.username).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;user1');
        expect(req.body.bio).toBe('<b>Hello</b>'); // <b> is usually allowed by default xss but let's check
        expect(next).toHaveBeenCalled();
    });

    it('should recursively sanitize nested objects in req.body', () => {
        const req = {
            body: {
                profile: {
                    name: '<img src=x onerror=alert(1)>',
                }
            },
            path: '/test'
        } as any;
        const res = {} as any;
        const next = vi.fn();

        sanitizeMiddleware(req, res, next);

        expect(req.body.profile.name).toBe('<img src>');
        expect(next).toHaveBeenCalled();
    });

    it('should sanitize req.query parameters', () => {
        const req = {
            query: {
                search: '<script>void(0)</script>'
            },
            path: '/test'
        } as any;
        const res = {} as any;
        const next = vi.fn();

        sanitizeMiddleware(req, res, next);

        expect(req.query.search).toBe('&lt;script&gt;void(0)&lt;/script&gt;');
        expect(next).toHaveBeenCalled();
    });

    it('should sanitize req.params', () => {
        const req = {
            params: {
                id: '"><script>alert(1)</script>'
            },
            path: '/test'
        } as any;
        const res = {} as any;
        const next = vi.fn();

        sanitizeMiddleware(req, res, next);

        expect(req.params.id).toBe('"&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(next).toHaveBeenCalled();
    });

    it('should not throw if body/query/params are missing', () => {
        const req = { path: '/test' } as any;
        const res = {} as any;
        const next = vi.fn();

        expect(() => sanitizeMiddleware(req, res, next)).not.toThrow();
        expect(next).toHaveBeenCalled();
    });
});
