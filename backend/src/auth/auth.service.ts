import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

// Runtime guard - throws if missing at startup
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

// TypeScript now knows it's a string, not string | undefined
const JWT_SECRET = process.env.JWT_SECRET!;

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async register(username: string, password: string): Promise<{ token: string; userId: number}> {
    const hashed = await this.hashPassword(password);
    const user = this.userRepository.create({ username, password: hashed });
    const saved = await this.userRepository.save(user);
    const token = jwt.sign({ userId: saved.id, username }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    return { token, userId: saved.id };
  }

  async login(username: string, password: string): Promise<{ token: string; userId: number } | null> {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) return null;
  
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return null;

    const token = jwt.sign(
      { userId: user.id, username }, 
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    return { token, userId: user.id };
  }

  verifyToken(token: string): { userId: number; username: string } | null {
    try {
      return jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    } catch {
      return null;
    }
  }
}
