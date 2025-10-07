import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { RobotState } from './RobotState';
import { Session } from './Session';

/**
 * Robot Entity
 * Represents a physical robot instance
 * Implements data model from data-model.md
 */
@Entity('robots')
export class Robot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 50 })
  serialNumber!: string;

  @Column({ length: 20 })
  modelVersion!: string;

  @Column({ length: 20 })
  firmwareVersion!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  lastSeenAt!: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'OFFLINE',
  })
  status!: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'MAINTENANCE';

  // Relationships
  @OneToMany(() => RobotState, (state) => state.robot)
  states?: RobotState[];

  @OneToMany(() => Session, (session) => session.robot)
  sessions?: Session[];
}

