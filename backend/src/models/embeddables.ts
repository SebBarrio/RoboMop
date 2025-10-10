import { Column } from "typeorm";

export class Position {
  @Column("float")
  x!: number;

  @Column("float")
  y!: number;

  @Column("float")
  theta!: number;

  @Column("float")
  confidence!: number;
}

export class Velocity {
  @Column("float")
  linear!: number;

  @Column("float")
  angular!: number;
}

export class MotorCurrents {
  @Column("float")
  left!: number;

  @Column("float")
  right!: number;
}

export class Origin {
  @Column("float")
  x!: number;

  @Column("float")
  y!: number;

  @Column("float")
  theta!: number;
}

export class PolygonPoint {
  @Column("float")
  x!: number;

  @Column("float")
  y!: number;
}
