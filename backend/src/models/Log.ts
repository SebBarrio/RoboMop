import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { LogLevel } from "./enums.js";
import { Robot } from "./Robot.js";
import { Session } from "./Session.js";

@Entity({ name: "logs" })
@Index("IDX_log_robot", ["robotId", "timestamp"])
export class Log {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  sessionId!: string | null;

  @Column({ type: "uuid" })
  robotId!: string;

  @ManyToOne(() => Session, (session) => session.logs, {
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "sessionId" })
  session!: Session | null;

  @ManyToOne(() => Robot, (robot) => robot.logs, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "robotId" })
  robot!: Robot;

  @Column({ type: "datetime", default: () => "CURRENT_TIMESTAMP" })
  timestamp!: Date;

  @Column({ type: "simple-enum", enum: LogLevel })
  level!: LogLevel;

  @Column({ type: "varchar", length: 50 })
  module!: string;

  @Column({ type: "varchar", length: 500 })
  message!: string;

  @Column({ type: "simple-json", nullable: true })
  data!: Record<string, unknown> | null;
}

export default Log;
