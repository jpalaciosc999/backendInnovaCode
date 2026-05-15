import { executeQuery } from "../../config/db.js";

function toNumberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function getPrestamoDetalles(req, res) {
  try {
    const sql = `
      SELECT
        PDE_ID,
        PDE_NUMERO_CUOTA,
        PDE_FECHA_PAGO,
        PDE_MONTO,
        PDE_SALDO_RESTANTE,
        PDE_ESTADO,
        PRE_ID
      FROM EMP_PRESTAMO_DETALLE
      ORDER BY PDE_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo detalle de prestamos",
      error: error.message,
    });
  }
}

export async function getPrestamoDetalleById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        PDE_ID,
        PDE_NUMERO_CUOTA,
        PDE_FECHA_PAGO,
        PDE_MONTO,
        PDE_SALDO_RESTANTE,
        PDE_ESTADO,
        PRE_ID
      FROM EMP_PRESTAMO_DETALLE
      WHERE PDE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Detalle de prestamo no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo detalle de prestamo",
      error: error.message,
    });
  }
}

export async function createPrestamoDetalle(req, res) {
  try {
    const {
      pde_numero_cuota,
      pde_fecha_pago,
      pde_monto,
      pde_saldo_restante,
      pde_estado,
      pre_id,
    } = req.body;

    if (!pde_numero_cuota || !pde_fecha_pago || !pde_monto || !pde_estado || !pre_id) {
      return res.status(400).json({ message: "Prestamo, cuota, fecha, monto y estado son requeridos" });
    }

    const sql = `
      INSERT INTO EMP_PRESTAMO_DETALLE (
        PDE_ID,
        PDE_NUMERO_CUOTA,
        PDE_FECHA_PAGO,
        PDE_MONTO,
        PDE_SALDO_RESTANTE,
        PDE_ESTADO,
        PRE_ID
      )
      VALUES (
        SEQ_EMP_PRESTAMO_DETALLE.NEXTVAL,
        :pde_numero_cuota,
        TO_DATE(:pde_fecha_pago, 'YYYY-MM-DD'),
        :pde_monto,
        :pde_saldo_restante,
        :pde_estado,
        :pre_id
      )
    `;

    await executeQuery(sql, {
      pde_numero_cuota: toNumberOrNull(pde_numero_cuota),
      pde_fecha_pago,
      pde_monto: toNumberOrNull(pde_monto),
      pde_saldo_restante: toNumberOrNull(pde_saldo_restante),
      pde_estado,
      pre_id: toNumberOrNull(pre_id),
    });

    res.status(201).json({ message: "Detalle de prestamo creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando detalle de prestamo",
      error: error.message,
    });
  }
}

export async function updatePrestamoDetalle(req, res) {
  try {
    const { id } = req.params;
    const {
      pde_numero_cuota,
      pde_fecha_pago,
      pde_monto,
      pde_saldo_restante,
      pde_estado,
      pre_id,
    } = req.body;

    if (!pde_numero_cuota || !pde_fecha_pago || !pde_monto || !pde_estado || !pre_id) {
      return res.status(400).json({ message: "Prestamo, cuota, fecha, monto y estado son requeridos" });
    }

    const sql = `
      UPDATE EMP_PRESTAMO_DETALLE
      SET
        PDE_NUMERO_CUOTA    = :pde_numero_cuota,
        PDE_FECHA_PAGO      = TO_DATE(:pde_fecha_pago, 'YYYY-MM-DD'),
        PDE_MONTO           = :pde_monto,
        PDE_SALDO_RESTANTE  = :pde_saldo_restante,
        PDE_ESTADO          = :pde_estado,
        PRE_ID              = :pre_id
      WHERE PDE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      pde_numero_cuota: toNumberOrNull(pde_numero_cuota),
      pde_fecha_pago,
      pde_monto: toNumberOrNull(pde_monto),
      pde_saldo_restante: toNumberOrNull(pde_saldo_restante),
      pde_estado,
      pre_id: toNumberOrNull(pre_id),
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Detalle de prestamo no encontrado" });
    }

    res.json({ message: "Detalle de prestamo actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando detalle de prestamo",
      error: error.message,
    });
  }
}

export async function deletePrestamoDetalle(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_PRESTAMO_DETALLE
      WHERE PDE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Detalle de prestamo no encontrado" });
    }

    res.json({ message: "Detalle de prestamo eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando detalle de prestamo",
      error: error.message,
    });
  }
}
