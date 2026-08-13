require('./src/config/load-env').loadEnvFiles();

const DB_CHARSET = process.env.DB_CHARSET || 'utf8mb4';
const DB_COLLATION = process.env.DB_COLLATION || 'utf8mb4_unicode_ci';

function createPool(max = 10) {
  return {
    min: 2,
    max,
    afterCreate(connection, done) {
      connection.query(`SET NAMES ${DB_CHARSET} COLLATE ${DB_COLLATION}`, (error) => {
        done(error, connection);
      });
    }
  };
}

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'talkscape',
      charset: DB_CHARSET
    },
    pool: createPool(10),
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './src/db/seeds'
    }
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: DB_CHARSET
    },
    pool: createPool(20),
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations'
    }
  }
};
