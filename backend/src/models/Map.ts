import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Robot } from './Robot';
import { RestrictedZone } from './RestrictedZone';
import { Session } from './Session';

/**
 * Map Entity
 * Represents spatial map of the environment
 * Uses occupancy grid representation
 */
@Entity('maps')
export class Map {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  robotId!: string;

  @Column({ length: 100, nullable: true })
  name?: string;

  @Column({ type: 'float' })
  resolution!: number; // meters per grid cell (typically 0.05)

  @Column({ type: 'int' })
  width!: number; // grid width in cells

  @Column({ type: 'int' })
  height!: number; // grid height in cells

  @Column({ type: 'json' })
  origin!: {
    x: number;
    y: number;
    theta: number;
  };

  @Column({ type: 'blob', nullable: true })
  data?: Buffer; // Binary occupancy grid data

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'float', default: 0 })
  completionPercentage!: number;

  // Relationships
  @ManyToOne(() => Robot)
  @JoinColumn({ name: 'robotId' })
  robot?: Robot;

  @OneToMany(() => RestrictedZone, (zone) => zone.map)
  zones?: RestrictedZone[];

  @OneToMany(() => Session, (session) => session.map)
  sessions?: Session[];
}

