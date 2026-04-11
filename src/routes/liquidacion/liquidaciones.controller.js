import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER LIQUIDACIONES
======================= */
export async function getLiquidaciones(req, res) {
  try {
    const sql = `SELECT * FROM EMP_LIQUIDACIONES`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo liquidaciones",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getLiquidacionById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM EMP_LIQUIDACIONES
      WHERE LIQ_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Liquidación no encontrada"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo liquidación",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createLiquidacion(req, res) {
  try {
    const {
      fecha_retiro,
      tipo_retiro,
      dias_trabajado,
      indemnizacion,
      vacaciones_pagadas,
      aguinaldo_proporcional,
      bono14_proporcional,
      liquidacion,
      fecha_registro,
      emp_id
    } = req.body;

    const sql = `
      INSERT INTO EMP_LIQUIDACIONES (
        LIQ_ID,
        LIQ_FECHA_SALIDA,
        LIQ_TIPO_RETIRO,
        LIQ_DIAS_TRABAJADO,
        LIQ_INDEMNIZACION,
        LIQ_VACACIONES_PAGADAS,
        LIQ_AGUINALDO_PROPORCIONAL,
        LIQ_BONO14_PROPORCIONAL,
        LIQ_LIQUIDACION,
        LIQ_FECHA_REGISTRO,
        EMP_ID
      ) VALUES (
        SEQ_LIQUIDACION.NEXTVAL,
        TO_DATE(:fecha_retiro, 'YYYY-MM-DD'),
        :tipo_retiro,
        :dias_trabajado,
        :indemnizacion,
        :vacaciones_pagadas,
        :aguinaldo_proporcional,
        :bono14_proporcional,
        :liquidacion,
        TO_DATE(:fecha_registro, 'YYYY-MM-DD'),
        :emp_id
      )
    `;

    await executeQuery(sql, {
      fecha_retiro,
      tipo_retiro,
      dias_trabajado,
      indemnizacion,
      vacaciones_pagadas,
      aguinaldo_proporcional,
      bono14_proporcional,
      liquidacion,
      fecha_registro,
      emp_id
    });

    res.status(201).json({
      message: "Liquidación creada correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando liquidación",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateLiquidacion(req, res) {
  try {
    const { id } = req.params;

    const {
      fecha_retiro,
      tipo_retiro,
      dias_trabajado,
      indemnizacion,
      vacaciones_pagadas,
      aguinaldo_proporcional,
      bono14_proporcional,
      liquidacion,
      fecha_registro,
      emp_id
    } = req.body;

    const sql = `
      UPDATE EMP_LIQUIDACIONES
      SET 
        LIQ_FECHA_SALIDA = :fecha_retiro,
        LIQ_TIPO_RETIRO = :tipo_retiro,
        LIQ_DIAS_TRABAJADO = :dias_trabajado,
        LIQ_INDEMNIZACION = :indemnizacion,
        LIQ_VACACIONES_PAGADAS = :vacaciones_pagadas,
        LIQ_AGUINALDO_PROPORCIONAL = :aguinaldo_proporcional,
        LIQ_BONO14_PROPORCIONAL = :bono14_proporcional,
        LIQ_LIQUIDACION = :liquidacion,
        LIQ_FECHA_REGISTRO = :fecha_registro,
        EMP_ID = :emp_id
      WHERE LIQ_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      fecha_retiro,
      tipo_retiro,
      dias_trabajado,
      indemnizacion,
      vacaciones_pagadas,
      aguinaldo_proporcional,
      bono14_proporcional,
      liquidacion,
      fecha_registro,
      emp_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Liquidación no encontrada"
      });
    }

    res.json({
      message: "Liquidación actualizada correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando liquidación",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteLiquidacion(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_LIQUIDACIONES
      WHERE LIQ_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Liquidación no encontrada"
      });
    }

    res.json({
      message: "Liquidación eliminada correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando liquidación",
      error: error.message
    });
  }
}