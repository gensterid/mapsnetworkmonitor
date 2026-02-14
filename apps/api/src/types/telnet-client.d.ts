declare module 'telnet-client' {
    export class Telnet {
        constructor();
        connect(options: any): Promise<void>;
        exec(command: string, options?: any): Promise<string>;
        send(data: string, options?: any): Promise<string>;
        end(): Promise<void>;
        destroy(): Promise<void>;
        on(event: string, callback: (...args: any[]) => void): void;
    }
}
