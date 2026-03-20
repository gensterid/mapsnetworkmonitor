import { Request, Response, NextFunction } from 'express';
import { metricsService } from '../services/metrics.service.js';

/**
 * Middleware to record HTTP request metrics
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();

    // Event listener for when the response is finished
    res.on('finish', () => {
        const duration = process.hrtime(start);
        const durationInSeconds = duration[0] + duration[1] / 1e9;

        // Path normalization (grouping dynamic routes like /api/routers/:id)
        let path = req.route ? req.baseUrl + req.route.path : req.path;
        
        // If no route was matched (e.g. 404 or middleware), 
        // strip potential UUIDs/IDs to prevent high cardinality in Prometheus
        if (!req.route) {
            path = path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '/:uuid');
            path = path.replace(/\/\d+/g, '/:id');
        }

        const labels = {
            method: req.method,
            route: path,
            status: res.statusCode.toString()
        };

        // Record metrics
        metricsService.httpRequestTotal.inc(labels);
        metricsService.httpRequestDuration.observe(labels, durationInSeconds);
    });

    next();
};
