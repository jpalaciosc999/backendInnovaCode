import { executeQuery } from "../../config/db.js";

export async function getBitacoras(req, res) {
  try {
    const sql = `
      SELECT
        BIT_ID, BIT_ACCION, BIT_TABLA_AFECTADA, BIT_ID_REGISTRO,
        BIT_DESCRIPCION, BIT_VALOR_ANTERIOR, BIT_VALOR_NUEVO,
        BIT_IP_USUARIO, BIT_FECHA
      FROM BITACORA
      ORDER BY BIT_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo bitácoras", error: error.message });
  }
}

export async function getBitacoraById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        BIT_ID, BIT_ACCION, BIT_TABLA_AFECTADA, BIT_ID_REGISTRO,
        BIT_DESCRIPCION, BIT_VALOR_ANTERIOR, BIT_VALOR_NUEVO,
        BIT_IP_USUARIO, BIT_FECHA
      FROM BITACORA
      WHERE BIT_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Bitácora no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo bitácora", error: error.message });
  }
}

export async function createBitacora(req, res) {
  try {
    const {
      bit_accion,
      bit_tabla_afectada,
      bit_id_registro,
      bit_descripcion,
      bit_valor_anterior,
      bit_valor_nuevo,
      bit_ip_usuario,
      bit_fecha
    } = req.body;

    const sql = `
      INSERT INTO BITACORA (
        BIT_ID, BIT_ACCION, BIT_TABLA_AFECTADA, BIT_ID_REGISTRO,
        BIT_DESCRIPCION, BIT_VALOR_ANTERIOR, BIT_VALOR_NUEVO,
        BIT_IP_USUARIO, BIT_FECHA
      )
      VALUES (
        BITACORA_SEQ.NEXTVAL, :bit_accion, :bit_tabla_afectada, :bit_id_registro,
        :bit_descripcion, :bit_valor_anterior, :bit_valor_nuevo,
        :bit_ip_usuario, TO_DATE(:bit_fecha, 'YYYY-MM-DD')
      )
    `;

    await executeQuery(sql, {
      bit_accion,
      bit_tabla_afectada,
      bit_id_registro,
      bit_descripcion,
      bit_valor_anterior,
      bit_valor_nuevo,
      bit_ip_usuario,
      bit_fecha
    });

    res.status(201).json({ message: "Bitácora creada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando bitácora", error: error.message });
  }
}

export async function updateBitacora(req, res) {
  try {
    const { id } = req.params;
    const {
      bit_accion,
      bit_tabla_afectada,
      bit_id_registro,
      bit_descripcion,
      bit_valor_anterior,
      bit_valor_nuevo,
      bit_ip_usuario,
      bit_fecha
    } = req.body;

    const sql = `
      UPDATE BITACORA
      SET
        BIT_ACCION = :bit_accion,
        BIT_TABLA_AFECTADA = :bit_tabla_afectada,
        BIT_ID_REGISTRO = :bit_id_registro,
        BIT_DESCRIPCION = :bit_descripcion,
        BIT_VALOR_ANTERIOR = :bit_valor_anterior,
        BIT_VALOR_NUEVO = :bit_valor_nuevo,
        BIT_IP_USUARIO = :bit_ip_usuario,
        BIT_FECHA = TO_DATE(:bit_fecha, 'YYYY-MM-DD')
      WHERE BIT_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      bit_accion,
      bit_tabla_afectada,
      bit_id_registro,
      bit_descripcion,
      bit_valor_anterior,
      bit_valor_nuevo,
      bit_ip_usuario,
      bit_fecha
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Bitácora no encontrada" });
    }

    res.json({ message: "Bitácora actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando bitácora", error: error.message });
  }
}

export async function deleteBitacora(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM BITACORA
      WHERE BIT_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Bitácora no encontrada" });
    }

    res.json({ message: "Bitácora eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando bitácora", error: error.message });
  }
}