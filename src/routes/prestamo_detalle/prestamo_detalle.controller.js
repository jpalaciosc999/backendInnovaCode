import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER DETALLES
======================= */
export async function getPrestamoDetalles(req, res) {
  try {
    const sql = `SELECT * FROM NOM_PRESTAMO_DETALLE`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo detalle de préstamos",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getPrestamoDetalleById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_PRESTAMO_DETALLE
      WHERE PDE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Detalle de préstamo no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo detalle de préstamo",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createPrestamoDetalle(req, res) {
  try {
    const {
      numero_cuota,
      fecha_pago,
      monto,
      saldo_restante,
      estado,
      pre_id
    } = req.body;

    const sql = `
      INSERT INTO NOM_PRESTAMO_DETALLE (
        PDE_ID,
        PDE_NUMERO_CUOTA,
        PDE_FECHA_PAGO,
        PDE_MONTO,
        PDE_SALDO_RESTANTE,
        PDE_ESTADO,
        PRE_ID
      ) VALUES (
        NOM_PRESTAMO_DETALLE_SEQ.NEXTVAL,
        :numero_cuota,
        :fecha_pago,
        :monto,
        :saldo_restante,
        :estado,
        :pre_id
      )
    `;

    await executeQuery(sql, {
      numero_cuota,
      fecha_pago,
      monto,
      saldo_restante,
      estado,
      pre_id
    });

    res.status(201).json({
      message: "Detalle de préstamo creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando detalle de préstamo",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updatePrestamoDetalle(req, res) {
  try {
    const { id } = req.params;
    const {
      numero_cuota,
      fecha_pago,
      monto,
      saldo_restante,
      estado,
      pre_id
    } = req.body;

    const sql = `
      UPDATE NOM_PRESTAMO_DETALLE
      SET 
        PDE_NUMERO_CUOTA = :numero_cuota,
        PDE_FECHA_PAGO = :fecha_pago,
        PDE_MONTO = :monto,
        PDE_SALDO_RESTANTE = :saldo_restante,
        PDE_ESTADO = :estado,
        PRE_ID = :pre_id
      WHERE PDE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      numero_cuota,
      fecha_pago,
      monto,
      saldo_restante,
      estado,
      pre_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Detalle de préstamo no encontrado"
      });
    }

    res.json({
      message: "Detalle de préstamo actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando detalle de préstamo",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deletePrestamoDetalle(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_PRESTAMO_DETALLE
      WHERE PDE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Detalle de préstamo no encontrado"
      });
    }

    res.json({
      message: "Detalle de préstamo eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando detalle de préstamo",
      error: error.message
    });
  }
}