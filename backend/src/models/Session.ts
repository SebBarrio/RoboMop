import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn
} from "typeorm";

import { SessionStatus, SessionType } from "./enums.js";
import { Robot } from "./Robot.js";
import { Map } from "./Map.js";
import { RobotState } from "./RobotState.js";
import { Log } from "./Log.js";

@Entity({ name: "sessions" })
@Index("IDX_session_robot", ["robotId", "startedAt"])
@Check(
  "CHK_session_completed_after_start",
  "completedAt IS NULL OR completedAt >= startedAt"
)
export class Session {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  robotId!: string;

  @Column({ type: "uuid" })
  mapId!: string;

  @ManyToOne(() => Robot, (robot) => robot.sessions, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "robotId" })
  robot!: Robot;

  @ManyToOne(() => Map, (map) => map.sessions, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "mapId" })
  map!: Map;

  @Column({ type: "simple-enum", enum: SessionType })
  type!: SessionType;

  @Column({ type: "simple-enum", enum: SessionStatus })
  status!: SessionStatus;

  @Column({ type: "datetime", default: () => "CURRENT_TIMESTAMP" })
  startedAt!: Date;

  @Column({ type: "datetime", nullable: true })
  completedAt!: Date | null;

  @Column({ type: "simple-json" })
  statistics!: Record<string, unknown>;

  @OneToMany(() => RobotState, (state) => state.session)
  states!: RobotState[];

  @OneToMany(() => Log, (log) => log.session)
  logs!: Log[];
}

export default Session;
