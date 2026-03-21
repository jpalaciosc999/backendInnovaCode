import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER PERIODOS
======================= */
export async function getPeriodos(req, res) {
  try {
    const sql = `SELECT * FROM NOM_PERIODO`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo periodos",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getPeriodoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_PERIODO
      WHERE PER_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Periodo no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo periodo",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createPeriodo(req, res) {
  try {
    const {
      fecha_inicio,
      fecha_fin,
      fecha_pago,
      estado
    } = req.body;

    const sql = `
      INSERT INTO NOM_PERIODO (
        PER_ID,
        PER_FECHA_INICIO,
        PER_FECHA_FIN,
        PER_FECHA_PAGO,
        PER_ESTADO
      ) VALUES (
        NOM_PERIODO_SEQ.NEXTVAL,
        :fecha_inicio,
        :fecha_fin,
        :fecha_pago,
        :estado
      )
    `;

    await executeQuery(sql, {
      fecha_inicio,
      fecha_fin,
      fecha_pago,
      estado
    });

    res.status(201).json({
      message: "Periodo creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando periodo",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updatePeriodo(req, res) {
  try {
    const { id } = req.params;
    const {
      fecha_inicio,
      fecha_fin,
      fecha_pago,
      estado
    } = req.body;

    const sql = `
      UPDATE NOM_PERIODO
      SET 
        PER_FECHA_INICIO = :fecha_inicio,
        PER_FECHA_FIN = :fecha_fin,
        PER_FECHA_PAGO = :fecha_pago,
        PER_ESTADO = :estado
      WHERE PER_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      fecha_inicio,
      fecha_fin,
      fecha_pago,
      estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Periodo no encontrado"
      });
    }

    res.json({
      message: "Periodo actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando periodo",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deletePeriodo(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_PERIODO
      WHERE PER_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Periodo no encontrado"
      });
    }

    res.json({
      message: "Periodo eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando periodo",
      error: error.message
    });
  }
}