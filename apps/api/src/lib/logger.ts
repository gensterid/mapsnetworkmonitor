import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const safeErrSerializer = (err: any) => {
    if (!err) return err;
    if (typeof err === 'string') return { message: err };
    return {
        type: err.type || err.name || 'Error',
        message: err.message || String(err),
        stack: err.stack,
        code: err.code,
        status: err.status || err.response?.status,
    };
};

export const logger = pino({
    level: 'debug',
    serializers: {
        err: safeErrSerializer,
        error: safeErrSerializer,
        reason: safeErrSerializer,
    },
    transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
});


export default logger;
