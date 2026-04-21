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
    level: isProduction ? 'info' : 'debug',
    redact: {
        paths: [
            'password', '*.password', '**.*.password',
            'passwordEncrypted', '*.passwordEncrypted',
            'webPassword', '*.webPassword',
            'emailSmtpPassEncrypted',
            'token', '*.token',
            'webhookSecret', '*.webhookSecret',
            'BETTER_AUTH_SECRET',
            'ENCRYPTION_KEY',
            'DATABASE_URL',
            'secret', '*.secret',
            'aiApiKey', '*.aiApiKey'
        ],
        remove: false,
        censor: '[REDACTED]'
    },
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
