import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { Map } from "./Map.js";

export interface PolygonPoint {
  x: number;
  y: number;
}

export interface RestrictedZoneGeometry {
  type: "Polygon";
  coordinates: PolygonPoint[][];
}

@Entity({ name: "restricted_zones" })
export class RestrictedZone {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  mapId!: string;

  @ManyToOne(() => Map, (map) => map.restrictedZones, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "mapId" })
  map!: Map;

  @Column({ type: "varchar", length: 100, nullable: true })
  name!: string | null;

  @Column({ type: "simple-json" })
  geometry!: RestrictedZoneGeometry;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;
}

export default RestrictedZone;
