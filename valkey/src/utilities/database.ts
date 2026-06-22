import { UniqueRef } from "@verto-fx/mysql-distributed-numericals";
import * as mysqlDialect from "mysql2";
import { Sequelize } from "sequelize-typescript";


export class DataBase {
  private static instance: Sequelize;

  public static getInstance() {
    return this.instance;
  }

  public static async connect(config: any): Promise<Sequelize> {
    if (!this.instance) {

      this.instance = new Sequelize({
        dialect: "mysql",
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        logging: false,
        dialectModule: mysqlDialect,
        operatorsAliases: {},
        pool: {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          idle: config.poolTimeout,
        },
        dialectOptions: {
          ssl: {
            rejectUnauthorized: true,
            ca: [config.certificate],
          },
        },
        models: [
          UniqueRef
        ],
      });
    }

    return this.instance;
  }
}
