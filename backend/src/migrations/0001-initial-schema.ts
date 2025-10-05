import { Table, TableForeignKey, type MigrationInterface, type QueryRunner } from "typeorm";

export class InitialSchema0001 implements MigrationInterface {
  name = "InitialSchema0001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const driverType = queryRunner.connection.options.type;
    const isPostgres = driverType === "postgres";

    const uuidType = isPostgres ? "uuid" : "varchar";
    const timestampType = isPostgres ? "timestamptz" : "datetime";
    const jsonType = isPostgres ? "jsonb" : "text";
    const blobType = isPostgres ? "bytea" : "blob";
    const floatType = isPostgres ? "double precision" : "real";
    const defaultTimestamp = isPostgres ? "now()" : "CURRENT_TIMESTAMP";

    await queryRunner.createTable(
      new Table({
        name: "robots",
        columns: [
          {
            name: "id",
            type: uuidType,
            isPrimary: true,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: false
          },
          {
            name: "serial_number",
            type: "varchar",
            length: "100",
            isNullable: false,
            isUnique: true
          },
          {
            name: "model_version",
            type: "varchar",
            length: "32",
            isNullable: false
          },
          {
            name: "firmware_version",
            type: "varchar",
            length: "32",
            isNullable: false
          },
          {
            name: "created_at",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "last_seen_at",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "status",
            type: "varchar",
            length: "20",
            isNullable: false
          }
        ]
      })
    );

    await queryRunner.createTable(
      new Table({
        name: "maps",
        columns: [
          {
            name: "id",
            type: uuidType,
            isPrimary: true,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "robot_id",
            type: uuidType,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: true
          },
          {
            name: "resolution",
            type: floatType,
            isNullable: false
          },
          {
            name: "width",
            type: "integer",
            isNullable: false
          },
          {
            name: "height",
            type: "integer",
            isNullable: false
          },
          {
            name: "origin",
            type: jsonType,
            isNullable: false
          },
          {
            name: "data",
            type: blobType,
            isNullable: false
          },
          {
            name: "metadata",
            type: jsonType,
            isNullable: true
          },
          {
            name: "created_at",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "updated_at",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "completion_percentage",
            type: floatType,
            isNullable: false,
            default: "0"
          }
        ]
      })
    );

    await queryRunner.createForeignKey(
      "maps",
      new TableForeignKey({
        columnNames: ["robot_id"],
        referencedTableName: "robots",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE"
      })
    );

    await queryRunner.createTable(
      new Table({
        name: "sessions",
        columns: [
          {
            name: "id",
            type: uuidType,
            isPrimary: true,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "robot_id",
            type: uuidType,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "map_id",
            type: uuidType,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "type",
            type: "varchar",
            length: "20",
            isNullable: false
          },
          {
            name: "status",
            type: "varchar",
            length: "20",
            isNullable: false
          },
          {
            name: "started_at",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "completed_at",
            type: timestampType,
            isNullable: true
          },
          {
            name: "statistics",
            type: jsonType,
            isNullable: false
          }
        ]
      })
    );

    await queryRunner.createForeignKeys("sessions", [
      new TableForeignKey({
        columnNames: ["robot_id"],
        referencedTableName: "robots",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE"
      }),
      new TableForeignKey({
        columnNames: ["map_id"],
        referencedTableName: "maps",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE"
      })
    ]);

    await queryRunner.createTable(
      new Table({
        name: "robot_states",
        columns: [
          {
            name: "id",
            type: uuidType,
            isPrimary: true,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "robot_id",
            type: uuidType,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "session_id",
            type: uuidType,
            isNullable: true,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "timestamp",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "mode",
            type: "varchar",
            length: "20",
            isNullable: false
          },
          {
            name: "position",
            type: jsonType,
            isNullable: false
          },
          {
            name: "velocity",
            type: jsonType,
            isNullable: false
          },
          {
            name: "battery_level",
            type: floatType,
            isNullable: false
          },
          {
            name: "water_level",
            type: floatType,
            isNullable: false
          },
          {
            name: "motor_currents",
            type: jsonType,
            isNullable: false
          },
          {
            name: "errors",
            type: jsonType,
            isNullable: true
          }
        ]
      })
    );

    await queryRunner.createForeignKeys("robot_states", [
      new TableForeignKey({
        columnNames: ["robot_id"],
        referencedTableName: "robots",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE"
      }),
      new TableForeignKey({
        columnNames: ["session_id"],
        referencedTableName: "sessions",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL"
      })
    ]);

    await queryRunner.createTable(
      new Table({
        name: "restricted_zones",
        columns: [
          {
            name: "id",
            type: uuidType,
            isPrimary: true,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "map_id",
            type: uuidType,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: true
          },
          {
            name: "geometry",
            type: jsonType,
            isNullable: false
          },
          {
            name: "created_at",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "updated_at",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          }
        ]
      })
    );

    await queryRunner.createForeignKey(
      "restricted_zones",
      new TableForeignKey({
        columnNames: ["map_id"],
        referencedTableName: "maps",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE"
      })
    );

    await queryRunner.createTable(
      new Table({
        name: "logs",
        columns: [
          {
            name: "id",
            type: uuidType,
            isPrimary: true,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "robot_id",
            type: uuidType,
            isNullable: false,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "session_id",
            type: uuidType,
            isNullable: true,
            length: isPostgres ? undefined : "36"
          },
          {
            name: "timestamp",
            type: timestampType,
            isNullable: false,
            default: defaultTimestamp
          },
          {
            name: "level",
            type: "varchar",
            length: "20",
            isNullable: false
          },
          {
            name: "module",
            type: "varchar",
            length: "50",
            isNullable: false
          },
          {
            name: "message",
            type: "varchar",
            length: "500",
            isNullable: false
          },
          {
            name: "data",
            type: jsonType,
            isNullable: true
          }
        ]
      })
    );

    await queryRunner.createForeignKeys("logs", [
      new TableForeignKey({
        columnNames: ["robot_id"],
        referencedTableName: "robots",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE"
      }),
      new TableForeignKey({
        columnNames: ["session_id"],
        referencedTableName: "sessions",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL"
      })
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("logs");
    await queryRunner.dropTable("restricted_zones");
    await queryRunner.dropTable("robot_states");
    await queryRunner.dropTable("sessions");
    await queryRunner.dropTable("maps");
    await queryRunner.dropTable("robots");
  }
}
