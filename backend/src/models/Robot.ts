import { Check, Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from "typeorm";

import { RobotStatus } from "./enums.js";
import { RobotState } from "./RobotState.js";
import { Session } from "./Session.js";
import { Map } from "./Map.js";
import { Log } from "./Log.js";

@Entity({ name: "robots" })
@Index("IDX_robot_serial_unique", ["serialNumber"], { unique: true })
@Check("CHK_robot_name_not_empty", "length(name) > 0")
export class Robot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 64 })
  serialNumber!: string;

  @Column({ type: "varchar", length: 32 })
  modelVersion!: string;

  @Column({ type: "varchar", length: 32 })
  firmwareVersion!: string;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @Column({ type: "datetime", default: () => "CURRENT_TIMESTAMP" })
  lastSeenAt!: Date;

  @Column({ type: "simple-enum", enum: RobotStatus, default: RobotStatus.OFFLINE })
  status!: RobotStatus;

  @OneToMany(() => RobotState, (state) => state.robot)
  states!: RobotState[];

  @OneToMany(() => Session, (session) => session.robot)
  sessions!: Session[];

  @OneToMany(() => Map, (map) => map.robot)
  maps!: Map[];

  @OneToMany(() => Log, (log) => log.robot)
  logs!: Log[];
}

export default Robot;
