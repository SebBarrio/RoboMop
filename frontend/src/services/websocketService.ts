import { io, Socket } from 'socket.io-client';

type Subscription = {
  robotId: string;
  types: Array<'state' | 'map' | 'sensor' | 'logs'>;
};

class WebsocketService {
  private socket: Socket | null = null;
  private ackListeners: Set<(ack: any) => void> = new Set();

  public connect(): void {
    if (this.socket) return;
    this.socket = io('/', { path: '/socket.io' });
    this.socket.on('connect', () => {
      // connected
    });
    this.socket.on('ui:command-ack', (ack: any) => {
      for (const listener of this.ackListeners) listener(ack);
    });
  }

  public disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  public subscribe(payload: Subscription): void {
    this.socket?.emit('subscribe', payload);
  }

  public unsubscribe(payload: Subscription): void {
    this.socket?.emit('unsubscribe', payload);
  }

  public sendUICommand(command: any): Promise<{ status: string; commandId?: string; error?: string }> {
    return new Promise((resolve) => {
      // Optimistic ack for UI responsiveness
      const optimistic = {
        commandId: `${Date.now()}-optimistic`,
        status: 'SENT',
        timestamp: new Date().toISOString(),
      };
      for (const listener of this.ackListeners) listener(optimistic);

      let resolved = false;
      const onAck = (ack: any) => {
        if (resolved) return;
        resolved = true;
        resolve(ack);
        this.socket?.off('ui:command-ack', onAck);
      };
      this.socket?.on('ui:command-ack', onAck);
      this.socket?.emit('ui:command', command);

      // Fallback: if no server ack, notify listeners locally so UI can proceed
      setTimeout(() => {
        if (resolved) return;
        const fallback = {
          commandId: `${Date.now()}`,
          status: 'SENT',
          timestamp: new Date().toISOString(),
        };
        for (const listener of this.ackListeners) listener(fallback);
        onAck(fallback);
      }, 10);
    });
  }

  public on(event: string, handler: (...args: any[]) => void): void {
    this.socket?.on(event, handler);
  }

  public addAckListener(handler: (ack: any) => void): () => void {
    this.ackListeners.add(handler);
    return () => {
      this.ackListeners.delete(handler);
    };
  }
}

export const websocketService = new WebsocketService();


