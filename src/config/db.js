import oracledb from "oracledb";
import dotenv from "dotenv";

dotenv.config();

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;
oracledb.fetchAsString = [oracledb.CLOB];

let pool;

export async function initDB() {
  try {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING,
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1
    });

    console.log("Pool de Oracle creado correctamente");
  } catch (error) {
    console.error("Error creando pool de Oracle:", error);
    throw error;
  }
}

export async function closeDB() {
  try {
    if (pool) {
      await pool.close(10);
      console.log("Pool de Oracle cerrado");
    }
  } catch (error) {
    console.error("Error cerrando pool:", error);
  }
}

export async function executeQuery(sql, binds = {}, options = {}) {
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: true,
      ...options
    });

    return result;
  } catch (error) {
    console.error("Error ejecutando query:", error);
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error("Error cerrando conexión:", closeError);
      }
    }
  }
}

export async function executeTransaction(callback) {
  let connection;

  try {
    connection = await pool.getConnection();

    const execute = (sql, binds = {}, options = {}) => {
      return connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false,
        ...options
      });
    };

    const result = await callback({ connection, execute });
    await connection.commit();

    return result;
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Error haciendo rollback:", rollbackError);
      }
    }

    console.error("Error ejecutando transaccion:", error);
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error("Error cerrando conexiÃ³n:", closeError);
      }
    }
  }
}
