import * as WebSocket from 'ws';

export function socketSend(socket: WebSocket, data: unknown): void {
  // Stringify the payload and send to the socket
  const json = JSON.stringify(data);
  socket.send(json);
}