import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { AuthService } from '../auth/auth.service';

const ROOM_PREFIX = 'room_';

interface JoinRoomPayload {
  roomId: number;
}

interface SendMessagePayload {
  roomId: number;
  content: string;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    const decoded = this.authService.verifyToken(token);
    if (!decoded) {
      client.disconnect();
      return
    }

    client.data.userId = decoded.userId;
    client.data.username = decoded.username;
  }

  handleDisconnect(_client: Socket) {
    // intentionally empty - cleanup handled by Socket.IO
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: JoinRoomPayload, 
    @ConnectedSocket() client: Socket) {
    client.join(ROOM_PREFIX + data.roomId);
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: SendMessagePayload, 
    @ConnectedSocket() client: Socket) {
    const { userId, username } = client.data as { userId: number; username: string };
    const message = await this.chatService.saveMessage(data.roomId, userId, data.content);

    this.server.to(ROOM_PREFIX + data.roomId).emit('newMessage', {
      ...message,
      username,
    });
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: JoinRoomPayload, 
    @ConnectedSocket() client: Socket) {
    client.leave(ROOM_PREFIX + data.roomId);
  }
}
