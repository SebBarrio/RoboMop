import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { Origin } from "./embeddables.js";
import { Robot } from "./Robot.js";
import { RestrictedZone } from "./RestrictedZone.js";
import { Session } from "./Session.js";

@Entity({ name: "maps" })
@Index("IDX_map_robot", ["robotId", "createdAt"])
@Check("CHK_map_resolution_range", "resolution >= 0.01 AND resolution <= 0.1")
@Check("CHK_map_width_range", "width >= 100 AND width <= 10000")
@Check("CHK_map_height_range", "height >= 100 AND height <= 10000")
@Check("CHK_map_completion_range", "completionPercentage >= 0 AND completionPercentage <= 100")
export class Map {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  robotId!: string;

  @ManyToOne(() => Robot, (robot) => robot.maps, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "robotId" })
  robot!: Robot;

  @Column({ type: "varchar", length: 100, nullable: true })
  name!: string | null;

  @Column({ type: "float" })
  resolution!: number;

  @Column({ type: "integer" })
  width!: number;

  @Column({ type: "integer" })
  height!: number;

  @Column(() => Origin)
  origin!: Origin;

  @Column({ type: "blob" })
  data!: Buffer;

  @Column({ type: "simple-json", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;

  @Column({ type: "float", default: 0 })
  completionPercentage!: number;

  @OneToMany(() => RestrictedZone, (zone) => zone.map)
  restrictedZones!: RestrictedZone[];

  @OneToMany(() => Session, (session) => session.map)
  sessions!: Session[];
}

export default Map;
