import oracledb from "oracledb";
import dotenv from "dotenv";

dotenv.config();

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const blocks = [
  `
    DECLARE
      v_count NUMBER;
      v_start NUMBER;
    BEGIN
      SELECT COUNT(*)
      INTO v_count
      FROM USER_SEQUENCES
      WHERE SEQUENCE_NAME = 'EMP_NOMINA_SEQ';

      IF v_count = 0 THEN
        SELECT NVL(MAX(NOM_ID), 0) + 1
        INTO v_start
        FROM EMP_NOMINA;

        EXECUTE IMMEDIATE
          'CREATE SEQUENCE EMP_NOMINA_SEQ START WITH ' || v_start ||
          ' INCREMENT BY 1 NOCACHE NOCYCLE';
      END IF;
    END;
  `,
  `
    DECLARE
      v_count NUMBER;
      v_start NUMBER;
    BEGIN
      SELECT COUNT(*)
      INTO v_count
      FROM USER_SEQUENCES
      WHERE SEQUENCE_NAME = 'EMP_NOMINA_DETALLE_SEQ';

      IF v_count = 0 THEN
        SELECT NVL(MAX(DET_ID), 0) + 1
        INTO v_start
        FROM EMP_NOMINA_DETALLE;

        EXECUTE IMMEDIATE
          'CREATE SEQUENCE EMP_NOMINA_DETALLE_SEQ START WITH ' || v_start ||
          ' INCREMENT BY 1 NOCACHE NOCYCLE';
      END IF;
    END;
  `
];

let connection;

try {
  connection = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING
  });

  for (const block of blocks) {
    await connection.execute(block);
  }

  await connection.commit();

  const result = await connection.execute(`
    SELECT SEQUENCE_NAME, LAST_NUMBER
    FROM USER_SEQUENCES
    WHERE SEQUENCE_NAME IN ('EMP_NOMINA_SEQ', 'EMP_NOMINA_DETALLE_SEQ')
    ORDER BY SEQUENCE_NAME
  `);

  console.table(result.rows);
} finally {
  if (connection) {
    await connection.close();
  }
}
