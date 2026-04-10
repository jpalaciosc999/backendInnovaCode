import { executeQuery } from "../../config/db.js";

/* =======================
   GET ALL
======================= */
export const getBitacora = async (req, res) => {
  try {
    const result = await executeQuery(`
      SELECT 
        BIT_ID,
        BIT_ACCION,
        BIT_TABLA_AFECTADA,
        BIT_ID_REGISTRO,
        DBMS_LOB.SUBSTR(BIT_DESCRIPCION, 4000, 1) AS BIT_DESCRIPCION,
        DBMS_LOB.SUBSTR(BIT_VALOR_ANTERIOR, 4000, 1) AS BIT_VALOR_ANTERIOR,
        DBMS_LOB.SUBSTR(BIT_VALOR_NUEVO, 4000, 1) AS BIT_VALOR_NUEVO,
        BIT_IP_USUARIO,
        BIT_FECHA
      FROM EMP_BITACORA
      ORDER BY BIT_ID DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({
      message: "Error obteniendo bitácora"
    });
  }
};

/* =======================
   GET BY ID
======================= */
export const getBitacoraById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery(
      `
      SELECT 
        BIT_ID,
        BIT_ACCION,
        BIT_TABLA_AFECTADA,
        BIT_ID_REGISTRO,
        DBMS_LOB.SUBSTR(BIT_DESCRIPCION, 4000, 1) AS BIT_DESCRIPCION,
        DBMS_LOB.SUBSTR(BIT_VALOR_ANTERIOR, 4000, 1) AS BIT_VALOR_ANTERIOR,
        DBMS_LOB.SUBSTR(BIT_VALOR_NUEVO, 4000, 1) AS BIT_VALOR_NUEVO,
        BIT_IP_USUARIO,
        BIT_FECHA
      FROM EMP_BITACORA
      WHERE BIT_ID = :id
      `,
      { id: Number(id) }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Bitácora no encontrada"
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({
      message: "Error obteniendo bitácora"
    });
  }
};

/* =======================
   CREATE
======================= */
export const createBitacora = async (req, res) => {
  try {
    const {
      bit_accion,
      bit_tabla_afectada,
      bit_id_registro,
      bit_descripcion,
      bit_valor_anterior,
      bit_valor_nuevo,
      bit_ip_usuario
    } = req.body;

    await executeQuery(
      `
      INSERT INTO EMP_BITACORA (
        BIT_ID,
        BIT_ACCION,
        BIT_TABLA_AFECTADA,
        BIT_ID_REGISTRO,
        BIT_DESCRIPCION,
        BIT_VALOR_ANTERIOR,
        BIT_VALOR_NUEVO,
        BIT_IP_USUARIO,
        BIT_FECHA
      ) VALUES (
        SEQ_BITACORA.NEXTVAL,
        :bit_accion,
        :bit_tabla_afectada,
        :bit_id_registro,
        :bit_descripcion,
        :bit_valor_anterior,
        :bit_valor_nuevo,
        :bit_ip_usuario,
        SYSDATE
      )
      `,
      {
        bit_accion,
        bit_tabla_afectada,
        bit_id_registro,
        bit_descripcion,
        bit_valor_anterior,
        bit_valor_nuevo,
        bit_ip_usuario
      }
    );

    res.status(201).json({
      message: "Bitácora creada correctamente"
    });

  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({
      message: "Error creando bitácora"
    });
  }
};

/* =======================
   UPDATE
======================= */
export const updateBitacora = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      bit_accion,
      bit_tabla_afectada,
      bit_id_registro,
      bit_descripcion,
      bit_valor_anterior,
      bit_valor_nuevo,
      bit_ip_usuario
    } = req.body;

    const result = await executeQuery(
      `
      UPDATE EMP_BITACORA
      SET
        BIT_ACCION = :bit_accion,
        BIT_TABLA_AFECTADA = :bit_tabla_afectada,
        BIT_ID_REGISTRO = :bit_id_registro,
        BIT_DESCRIPCION = :bit_descripcion,
        BIT_VALOR_ANTERIOR = :bit_valor_anterior,
        BIT_VALOR_NUEVO = :bit_valor_nuevo,
        BIT_IP_USUARIO = :bit_ip_usuario
      WHERE BIT_ID = :id
      `,
      {
        id: Number(id),
        bit_accion,
        bit_tabla_afectada,
        bit_id_registro,
        bit_descripcion,
        bit_valor_anterior,
        bit_valor_nuevo,
        bit_ip_usuario
      }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Bitácora no encontrada"
      });
    }

    res.json({
      message: "Bitácora actualizada correctamente"
    });

  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({
      message: "Error actualizando bitácora"
    });
  }
};

/* =======================
   DELETE
======================= */
export const deleteBitacora = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery(
      `DELETE FROM EMP_BITACORA WHERE BIT_ID = :id`,
      { id: Number(id) }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Bitácora no encontrada"
      });
    }

    res.json({
      message: "Bitácora eliminada correctamente"
    });

  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({
      message: "Error eliminando bitácora"
    });
  }
};