import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Robot } from './Robot';
import { Session } from './Session';

/**
 * Log Entity
 * Represents operational log entries for debugging and audit
 */
@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId?: string;

  @Column({ type: 'uuid' })
  robotId!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @Column({
    type: 'varchar',
    length: 20,
  })
  level!: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

  @Column({ length: 50 })
  module!: string;

  @Column({ length: 500 })
  message!: string;

  @Column({ type: 'json', nullable: true })
  data?: Record<string, unknown>;

  // Relationships
  @ManyToOne(() => Robot)
  @JoinColumn({ name: 'robotId' })
  robot?: Robot;

  @ManyToOne(() => Session, (session) => session.logs, { nullable: true })
  @JoinColumn({ name: 'sessionId' })
  session?: Session;
}

