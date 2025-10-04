import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema0001 implements MigrationInterface {
  name = "InitialSchema0001";

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // TODO: implement schema creation for robots, maps, sessions, zones, logs, robot states
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // TODO: implement schema teardown logic
  }
}
