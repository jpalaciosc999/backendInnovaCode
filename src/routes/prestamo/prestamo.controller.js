import { executeQuery } from "../../config/db.js";

export async function getPrestamos(req, res) {
  try {
    const sql = `
      SELECT
        PRE_ID,
        PRE_MONTO_TOTAL,
        PRE_INTERES,
        PRE_PLAZO,
        PRE_CUOTA_MENSUAL,
        PRE_SALDO_PENDIENTE,
        PRE_FECHA_INICIO,
        PRE_ESTADO
      FROM EMP_PRESTAMO
      ORDER BY PRE_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo préstamos",
      error: error.message
    });
  }
}

export async function getPrestamoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        PRE_ID,
        PRE_MONTO_TOTAL,
        PRE_INTERES,
        PRE_PLAZO,
        PRE_CUOTA_MENSUAL,
        PRE_SALDO_PENDIENTE,
        PRE_FECHA_INICIO,
        PRE_ESTADO
      FROM EMP_PRESTAMO
      WHERE PRE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Préstamo no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo préstamo",
      error: error.message
    });
  }
}

export async function createPrestamo(req, res) {
  try {
    const {
      pre_monto_total,
      pre_interes,
      pre_plazo,
      pre_cuota_mensual,
      pre_saldo_pendiente,
      pre_fecha_inicio,
      pre_estado
    } = req.body;

    const sql = `
      INSERT INTO EMP_PRESTAMO (
        PRE_ID,
        PRE_MONTO_TOTAL,
        PRE_INTERES,
        PRE_PLAZO,
        PRE_CUOTA_MENSUAL,
        PRE_SALDO_PENDIENTE,
        PRE_FECHA_INICIO,
        PRE_ESTADO
      )
      VALUES (
        EMP_PRESTAMO_SEQ.NEXTVAL,
        :pre_monto_total,
        :pre_interes,
        :pre_plazo,
        :pre_cuota_mensual,
        :pre_saldo_pendiente,
        TO_DATE(:pre_fecha_inicio, 'YYYY-MM-DD'),
        :pre_estado
      )
    `;

    await executeQuery(sql, {
      pre_monto_total,
      pre_interes,
      pre_plazo,
      pre_cuota_mensual,
      pre_saldo_pendiente,
      pre_fecha_inicio,
      pre_estado
    });

    res.status(201).json({ message: "Préstamo creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando préstamo",
      error: error.message
    });
  }
}

export async function updatePrestamo(req, res) {
  try {
    const { id } = req.params;
    const {
      pre_monto_total,
      pre_interes,
      pre_plazo,
      pre_cuota_mensual,
      pre_saldo_pendiente,
      pre_fecha_inicio,
      pre_estado
    } = req.body;

    const sql = `
      UPDATE EMP_PRESTAMO
      SET
        PRE_MONTO_TOTAL = :pre_monto_total,
        PRE_INTERES = :pre_interes,
        PRE_PLAZO = :pre_plazo,
        PRE_CUOTA_MENSUAL = :pre_cuota_mensual,
        PRE_SALDO_PENDIENTE = :pre_saldo_pendiente,
        PRE_FECHA_INICIO = TO_DATE(:pre_fecha_inicio, 'YYYY-MM-DD'),
        PRE_ESTADO = :pre_estado
      WHERE PRE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      pre_monto_total,
      pre_interes,
      pre_plazo,
      pre_cuota_mensual,
      pre_saldo_pendiente,
      pre_fecha_inicio,
      pre_estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Préstamo no encontrado" });
    }

    res.json({ message: "Préstamo actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando préstamo",
      error: error.message
    });
  }
}

export async function deletePrestamo(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_PRESTAMO
      WHERE PRE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Préstamo no encontrado" });
    }

    res.json({ message: "Préstamo eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando préstamo",
      error: error.message
    });
  }
}