import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { Message } from './entities/message.entity';
import { PaginatedMessages } from './chat.types';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  async getRooms(): Promise<Room[]> {
    return this.roomRepository.find();
  }

  async createRoom(name: string, description: string | undefined, userId: number): Promise<Room> {
    const existing = await this.roomRepository.findOne({ where: { name } });
    if (existing) return existing;
    const room = this.roomRepository.create({ name, description, createdBy: userId });
    return this.roomRepository.save(room);
  }

  async getMessages(roomId: number, page: number, limit: number): Promise<PaginatedMessages> {
    const [messages, total] = await this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.user', 'user')
      .where('message.roomId = :roomId', { roomId })
      .orderBy('message.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: messages.map(msg => ({
        id: msg.id,
        roomId: msg.roomId,
        userId: msg.userId,
        content: msg.content,
        username: msg.user?.username ?? 'unknown',
        createdAt: msg.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  async saveMessage(roomId: number, userId: number, content: string): Promise<Message> {
    const message = this.messageRepository.create({ roomId, userId, content});
    return this.messageRepository.save(message);
  }

  async deleteMessage(messageId: number, userId: number): Promise<boolean> {
    const msg = await this.messageRepository.findOne({ where: { id: messageId } });
    if (!msg) return false;
    if (msg.userId !== userId) return false;
    await this.messageRepository.delete(messageId);
    return true;
  }
}
