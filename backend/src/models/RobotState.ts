import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { RobotMode } from "./enums.js";
import { Position, Velocity, MotorCurrents } from "./embeddables.js";
import { Robot } from "./Robot.js";
import { Session } from "./Session.js";

@Entity({ name: "robot_states" })
@Index("IDX_robot_state_robot", ["robotId", "timestamp"])
@Check("CHK_state_battery_range", "batteryLevel >= 0 AND batteryLevel <= 100")
@Check("CHK_state_water_range", "waterLevel >= 0 AND waterLevel <= 100")
export class RobotState {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  robotId!: string;

  @Column({ type: "uuid", nullable: true })
  sessionId!: string | null;

  @ManyToOne(() => Robot, (robot) => robot.states, {
    onDelete: "CASCADE"
  })
  @JoinColumn({ name: "robotId" })
  robot!: Robot;

  @ManyToOne(() => Session, (session) => session.states, {
    onDelete: "SET NULL"
  })
  @JoinColumn({ name: "sessionId" })
  session!: Session | null;

  @Column({ type: "datetime", default: () => "CURRENT_TIMESTAMP" })
  timestamp!: Date;

  @Column({ type: "simple-enum", enum: RobotMode })
  mode!: RobotMode;

  @Column(() => Position)
  position!: Position;

  @Column(() => Velocity)
  velocity!: Velocity;

  @Column(() => MotorCurrents)
  motorCurrents!: MotorCurrents;

  @Column({ type: "float" })
  batteryLevel!: number;

  @Column({ type: "float" })
  waterLevel!: number;

  @Column({ type: "simple-json", nullable: true })
  errors!: string[] | null;
}

export default RobotState;
