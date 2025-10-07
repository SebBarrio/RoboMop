import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Map } from './Map';

/**
 * RestrictedZone Entity
 * Represents user-defined no-go areas on a map
 */
@Entity('restricted_zones')
export class RestrictedZone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  mapId!: string;

  @Column({ length: 100, nullable: true })
  name?: string;

  @Column({ type: 'json' })
  geometry!: {
    type: 'Polygon';
    coordinates: Array<Array<{ x: number; y: number }>>;
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Relationships
  @ManyToOne(() => Map, (map) => map.zones)
  @JoinColumn({ name: 'mapId' })
  map?: Map;
}

