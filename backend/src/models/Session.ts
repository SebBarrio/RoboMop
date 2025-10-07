import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Robot } from './Robot';
import { Map } from './Map';
import { Log } from './Log';
import { RobotState } from './RobotState';

/**
 * Session Entity
 * Represents a complete exploration or cleaning operation
 */
@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  robotId!: string;

  @Column({ type: 'uuid' })
  mapId!: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  type!: 'EXPLORATION' | 'CLEANING';

  @Column({
    type: 'varchar',
    length: 20,
  })
  status!: 'IN_PROGRESS' | 'COMPLETED' | 'INTERRUPTED' | 'FAILED';

  @CreateDateColumn()
  startedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date;

  @Column({ type: 'json' })
  statistics!: {
    distanceTraveled?: number;
    areaCovered?: number;
    duration?: number;
    batteryUsed?: number;
    waterUsed?: number;
    errorsEncountered?: number;
    averageSpeed?: number;
    completionReason?: string;
  };

  // Relationships
  @ManyToOne(() => Robot, (robot) => robot.sessions)
  @JoinColumn({ name: 'robotId' })
  robot?: Robot;

  @ManyToOne(() => Map, (map) => map.sessions)
  @JoinColumn({ name: 'mapId' })
  map?: Map;

  @OneToMany(() => Log, (log) => log.session)
  logs?: Log[];

  @OneToMany(() => RobotState, (state) => state.session)
  states?: RobotState[];
}

