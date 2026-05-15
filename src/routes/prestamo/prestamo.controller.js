import { executeQuery } from "../../config/db.js";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toNumberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

const SELECT_PRESTAMOS = `
  SELECT
    p.PRE_ID,
    p.EMP_ID,
    p.PRE_MONTO_TOTAL,
    p.PRE_INTERES,
    p.PRE_PLAZO,
    p.PRE_CUOTA_MENSUAL,
    p.PRE_SALDO_PENDIENTE,
    p.PRE_FECHA_INICIO,
    p.PRE_ESTADO,
    p.PRE_PLAZO AS PRE_TOTAL_CUOTAS,
    NVL((
      SELECT COUNT(*)
      FROM EMP_PRESTAMO_DETALLE d
      WHERE d.PRE_ID = p.PRE_ID
        AND d.PDE_ESTADO = 'C'
    ), 0) AS PRE_CUOTAS_PAGADAS
  FROM EMP_PRESTAMO p
`;

export async function getPrestamos(req, res) {
  try {
    const sql = `${SELECT_PRESTAMOS} ORDER BY p.PRE_ID`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo prestamos",
      error: error.message
    });
  }
}

export async function getPrestamoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      ${SELECT_PRESTAMOS}
      WHERE p.PRE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Prestamo no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo prestamo",
      error: error.message
    });
  }
}

export async function createPrestamo(req, res) {
  try {
    const {
      emp_id,
      empleado_id,
      pre_monto_total,
      pre_interes,
      pre_plazo,
      pre_total_cuotas,
      pre_cuota_mensual,
      pre_saldo_pendiente,
      pre_fecha_inicio,
      pre_estado
    } = req.body;

    const payload = {
      emp_id: toNumberOrNull(firstDefined(emp_id, empleado_id)),
      pre_monto_total: toNumberOrNull(pre_monto_total),
      pre_interes: toNumberOrNull(pre_interes) ?? 0,
      pre_plazo: String(firstDefined(pre_total_cuotas, pre_plazo) ?? ""),
      pre_cuota_mensual: toNumberOrNull(pre_cuota_mensual),
      pre_saldo_pendiente: toNumberOrNull(pre_saldo_pendiente),
      pre_fecha_inicio,
      pre_estado: pre_estado || "A"
    };

    if (!payload.emp_id) {
      return res.status(400).json({ message: "El empleado es obligatorio" });
    }

    const sql = `
      INSERT INTO EMP_PRESTAMO (
        PRE_ID,
        EMP_ID,
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
        :emp_id,
        :pre_monto_total,
        :pre_interes,
        :pre_plazo,
        :pre_cuota_mensual,
        :pre_saldo_pendiente,
        TO_DATE(:pre_fecha_inicio, 'YYYY-MM-DD'),
        :pre_estado
      )
    `;

    await executeQuery(sql, payload);

    res.status(201).json({ message: "Prestamo creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando prestamo",
      error: error.message
    });
  }
}

export async function updatePrestamo(req, res) {
  try {
    const { id } = req.params;
    const {
      emp_id,
      empleado_id,
      pre_monto_total,
      pre_interes,
      pre_plazo,
      pre_total_cuotas,
      pre_cuota_mensual,
      pre_saldo_pendiente,
      pre_fecha_inicio,
      pre_estado
    } = req.body;

    const payload = {
      id: Number(id),
      emp_id: toNumberOrNull(firstDefined(emp_id, empleado_id)),
      pre_monto_total: toNumberOrNull(pre_monto_total),
      pre_interes: toNumberOrNull(pre_interes) ?? 0,
      pre_plazo: String(firstDefined(pre_total_cuotas, pre_plazo) ?? ""),
      pre_cuota_mensual: toNumberOrNull(pre_cuota_mensual),
      pre_saldo_pendiente: toNumberOrNull(pre_saldo_pendiente),
      pre_fecha_inicio,
      pre_estado: pre_estado || "A"
    };

    if (!payload.emp_id) {
      return res.status(400).json({ message: "El empleado es obligatorio" });
    }

    const sql = `
      UPDATE EMP_PRESTAMO
      SET
        EMP_ID = :emp_id,
        PRE_MONTO_TOTAL = :pre_monto_total,
        PRE_INTERES = :pre_interes,
        PRE_PLAZO = :pre_plazo,
        PRE_CUOTA_MENSUAL = :pre_cuota_mensual,
        PRE_SALDO_PENDIENTE = :pre_saldo_pendiente,
        PRE_FECHA_INICIO = TO_DATE(:pre_fecha_inicio, 'YYYY-MM-DD'),
        PRE_ESTADO = :pre_estado
      WHERE PRE_ID = :id
    `;

    const result = await executeQuery(sql, payload);

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Prestamo no encontrado" });
    }

    res.json({ message: "Prestamo actualizado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando prestamo",
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
      return res.status(404).json({ message: "Prestamo no encontrado" });
    }

    res.json({ message: "Prestamo eliminado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando prestamo",
      error: error.message
    });
  }
}
