import type { Socket } from "socket.io";

type StreamSubscriptions = Map<string, Set<string>>;

export class ConnectionRegistry {
  private readonly robotSockets = new Map<string, Socket>();
  private readonly robotSocketMap = new Map<Socket, string>();
  private readonly frontendSockets = new Set<Socket>();
  private readonly frontendSubscriptions = new Map<Socket, StreamSubscriptions>();
  private readonly robotSubscribers = new Map<string, Map<string, Set<Socket>>>();

  registerRobot(robotId: string, socket: Socket): void {
    const existing = this.robotSockets.get(robotId);
    if (existing && existing.id !== socket.id) {
      existing.disconnect(true);
    }

    this.robotSockets.set(robotId, socket);
    this.robotSocketMap.set(socket, robotId);
  }

  unregisterRobot(socket: Socket): void {
    const robotId = this.robotSocketMap.get(socket);
    if (!robotId) {
      return;
    }

    this.robotSockets.delete(robotId);
    this.robotSocketMap.delete(socket);
  }

  getRobotSocket(robotId: string): Socket | undefined {
    return this.robotSockets.get(robotId);
  }

  registerFrontend(socket: Socket): void {
    this.frontendSockets.add(socket);
  }

  unregisterFrontend(socket: Socket): void {
    if (!this.frontendSockets.has(socket)) {
      return;
    }

    const subscriptions = this.frontendSubscriptions.get(socket);
    if (subscriptions) {
      for (const [robotId, streams] of subscriptions.entries()) {
        for (const stream of streams) {
          this.removeSubscriber(robotId, stream, socket);
        }
      }
    }

    this.frontendSubscriptions.delete(socket);
    this.frontendSockets.delete(socket);
  }

  subscribe(socket: Socket, robotId: string, streams: readonly string[]): void {
    let socketSubscriptions = this.frontendSubscriptions.get(socket);
    if (!socketSubscriptions) {
      socketSubscriptions = new Map<string, Set<string>>();
      this.frontendSubscriptions.set(socket, socketSubscriptions);
    }

    let robotStreams = socketSubscriptions.get(robotId);
    if (!robotStreams) {
      robotStreams = new Set<string>();
      socketSubscriptions.set(robotId, robotStreams);
    }

    let streamMap = this.robotSubscribers.get(robotId);
    if (!streamMap) {
      streamMap = new Map<string, Set<Socket>>();
      this.robotSubscribers.set(robotId, streamMap);
    }

    for (const rawStream of streams) {
      const stream = rawStream.trim();
      if (!stream) {
        continue;
      }

      if (!robotStreams.has(stream)) {
        robotStreams.add(stream);
        let sockets = streamMap.get(stream);
        if (!sockets) {
          sockets = new Set<Socket>();
          streamMap.set(stream, sockets);
        }
        sockets.add(socket);
      }
    }
  }

  unsubscribe(socket: Socket, robotId: string, streams: readonly string[]): void {
    const socketSubscriptions = this.frontendSubscriptions.get(socket);
    if (!socketSubscriptions) {
      return;
    }

    const robotStreams = socketSubscriptions.get(robotId);
    if (!robotStreams) {
      return;
    }

    for (const rawStream of streams) {
      const stream = rawStream.trim();
      if (!stream) {
        continue;
      }

      if (robotStreams.has(stream)) {
        robotStreams.delete(stream);
        this.removeSubscriber(robotId, stream, socket);
      }
    }

    if (robotStreams.size === 0) {
      socketSubscriptions.delete(robotId);
    }
  }

  removeAllSubscriptions(socket: Socket): void {
    const socketSubscriptions = this.frontendSubscriptions.get(socket);
    if (!socketSubscriptions) {
      return;
    }

    for (const [robotId, streams] of socketSubscriptions.entries()) {
      for (const stream of streams) {
        this.removeSubscriber(robotId, stream, socket);
      }
    }

    this.frontendSubscriptions.delete(socket);
  }

  emitToRobotStream(robotId: string, stream: string, event: string, payload: unknown): void {
    const streamMap = this.robotSubscribers.get(robotId);
    if (!streamMap) {
      return;
    }

    const sockets = streamMap.get(stream);
    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      socket.emit(event, payload);
    }
  }

  broadcastToRobot(robotId: string, event: string, payload: unknown): void {
    const streamMap = this.robotSubscribers.get(robotId);
    if (!streamMap) {
      return;
    }

    const delivered = new Set<Socket>();

    for (const sockets of streamMap.values()) {
      for (const socket of sockets) {
        if (delivered.has(socket)) {
          continue;
        }
        delivered.add(socket);
        socket.emit(event, payload);
      }
    }
  }

  notifyFrontend(event: string, payload: unknown): void {
    for (const socket of this.frontendSockets) {
      socket.emit(event, payload);
    }
  }

  private removeSubscriber(robotId: string, stream: string, socket: Socket): void {
    const streamMap = this.robotSubscribers.get(robotId);
    if (!streamMap) {
      return;
    }

    const sockets = streamMap.get(stream);
    if (!sockets) {
      return;
    }

    sockets.delete(socket);

    if (sockets.size === 0) {
      streamMap.delete(stream);
    }

    if (streamMap.size === 0) {
      this.robotSubscribers.delete(robotId);
    }
  }
}

export default ConnectionRegistry;
