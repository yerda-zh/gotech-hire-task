import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string; // should have @Index() for query performance

  @Column()
  password: string; // should have @Exclude() to prevent accidental exposure

  @Column({ default: 'user' })
  role: string; // should be an enum

  @CreateDateColumn()
  createdAt: Date;
}
