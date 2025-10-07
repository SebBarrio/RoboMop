import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Robot } from './Robot';
import { Session } from './Session';

/**
 * RobotState Entity
 * Represents robot operational state at a point in time
 * High-frequency updates (10 Hz for position)
 */
@Entity('robot_states')
export class RobotState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  robotId!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @Column({
    type: 'varchar',
    length: 20,
  })
  mode!: 'IDLE' | 'EXPLORATION' | 'CLEANING' | 'MANUAL' | 'RETURNING' | 'ERROR';

  @Column({ type: 'json' })
  position!: {
    x: number;
    y: number;
    theta: number;
    confidence: number;
  };

  @Column({ type: 'json' })
  velocity!: {
    linear: number;
    angular: number;
  };

  @Column({ type: 'float' })
  batteryLevel!: number;

  @Column({ type: 'float' })
  waterLevel!: number;

  @Column({ type: 'json' })
  motorCurrents!: {
    left: number;
    right: number;
  };

  @Column({ type: 'json', nullable: true })
  errors?: string[];

  @Column({ type: 'uuid', nullable: true })
  sessionId?: string;

  // Relationships
  @ManyToOne(() => Robot, (robot) => robot.states)
  @JoinColumn({ name: 'robotId' })
  robot?: Robot;

  @ManyToOne(() => Session, { nullable: true })
  @JoinColumn({ name: 'sessionId' })
  session?: Session;
}

