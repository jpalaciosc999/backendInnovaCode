import { executeQuery, executeTransaction } from "../../config/db.js";

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numberValue = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numberValue) ? numberValue : NaN;
}

function buildPrestamoPayload(body) {
  const montoTotal = toNumber(body.pre_monto_total);
  const interes = toNumber(body.pre_interes);
  const cuotaMensual = toNumber(body.pre_cuota_mensual);
  const saldoPendiente = toNumber(body.pre_saldo_pendiente);
  const plazo = String(body.pre_plazo || "").trim();
  const fechaInicio = String(body.pre_fecha_inicio || "").trim();
  const estado = String(body.pre_estado || "A").trim().slice(0, 1).toUpperCase();
  const empId = toNumber(body.emp_id);

  if (!Number.isFinite(empId) || empId <= 0) {
    throw new Error("El empleado es obligatorio");
  }

  if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
    throw new Error("El monto total debe ser numerico y mayor a 0");
  }

  if (!Number.isFinite(interes) || interes < 0) {
    throw new Error("El interes debe ser numerico");
  }

  if (!Number.isFinite(cuotaMensual) || cuotaMensual <= 0) {
    throw new Error("La cuota mensual debe ser numerica y mayor a 0");
  }

  if (!Number.isFinite(saldoPendiente) || saldoPendiente < 0) {
    throw new Error("El saldo pendiente debe ser numerico");
  }

  if (!plazo) {
    throw new Error("El plazo es obligatorio");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) {
    throw new Error("La fecha de inicio debe tener formato YYYY-MM-DD");
  }

  return {
    emp_id: empId,
    pre_monto_total: montoTotal,
    pre_interes: interes,
    pre_plazo: plazo,
    pre_cuota_mensual: cuotaMensual,
    pre_saldo_pendiente: saldoPendiente,
    pre_fecha_inicio: fechaInicio,
    pre_estado: estado || "A"
  };
}

export async function getPrestamos(req, res) {
  try {
    const sql = `
      SELECT
        p.PRE_ID,
        e.EMP_ID,
        p.PRE_MONTO_TOTAL,
        p.PRE_INTERES,
        p.PRE_PLAZO,
        p.PRE_CUOTA_MENSUAL,
        p.PRE_SALDO_PENDIENTE,
        p.PRE_FECHA_INICIO,
        p.PRE_ESTADO
      FROM EMP_PRESTAMO p
      LEFT JOIN EMP_EMPLEADO e ON e.PRE_ID = p.PRE_ID
      ORDER BY p.PRE_ID
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
        p.PRE_ID,
        e.EMP_ID,
        p.PRE_MONTO_TOTAL,
        p.PRE_INTERES,
        p.PRE_PLAZO,
        p.PRE_CUOTA_MENSUAL,
        p.PRE_SALDO_PENDIENTE,
        p.PRE_FECHA_INICIO,
        p.PRE_ESTADO
      FROM EMP_PRESTAMO p
      LEFT JOIN EMP_EMPLEADO e ON e.PRE_ID = p.PRE_ID
      WHERE p.PRE_ID = :id
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
    const payload = buildPrestamoPayload(req.body);

    await executeTransaction(async ({ execute }) => {
      const idResult = await execute(`SELECT EMP_PRESTAMO_SEQ.NEXTVAL AS PRE_ID FROM DUAL`);
      const preId = idResult.rows[0].PRE_ID;

      await execute(
        `
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
            :pre_id,
            :pre_monto_total,
            :pre_interes,
            :pre_plazo,
            :pre_cuota_mensual,
            :pre_saldo_pendiente,
            TO_DATE(:pre_fecha_inicio, 'YYYY-MM-DD'),
            :pre_estado
          )
        `,
        {
          pre_id: preId,
          pre_monto_total: payload.pre_monto_total,
          pre_interes: payload.pre_interes,
          pre_plazo: payload.pre_plazo,
          pre_cuota_mensual: payload.pre_cuota_mensual,
          pre_saldo_pendiente: payload.pre_saldo_pendiente,
          pre_fecha_inicio: payload.pre_fecha_inicio,
          pre_estado: payload.pre_estado
        }
      );

      if (payload.emp_id > 0) {
        await execute(
          `
            UPDATE EMP_EMPLEADO
            SET PRE_ID = :pre_id
            WHERE EMP_ID = :emp_id
          `,
          { pre_id: preId, emp_id: payload.emp_id }
        );
      }
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
    const payload = buildPrestamoPayload(req.body);

    const result = await executeTransaction(async ({ execute }) => {
      const updateResult = await execute(
        `
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
        `,
        {
          id: Number(id),
          pre_monto_total: payload.pre_monto_total,
          pre_interes: payload.pre_interes,
          pre_plazo: payload.pre_plazo,
          pre_cuota_mensual: payload.pre_cuota_mensual,
          pre_saldo_pendiente: payload.pre_saldo_pendiente,
          pre_fecha_inicio: payload.pre_fecha_inicio,
          pre_estado: payload.pre_estado
        }
      );

      if (updateResult.rowsAffected > 0) {
        await execute(
          `
            UPDATE EMP_EMPLEADO
            SET PRE_ID = NULL
            WHERE PRE_ID = :pre_id
              AND EMP_ID <> :emp_id
          `,
          { pre_id: Number(id), emp_id: payload.emp_id || -1 }
        );

        if (payload.emp_id > 0) {
          await execute(
            `
              UPDATE EMP_EMPLEADO
              SET PRE_ID = :pre_id
              WHERE EMP_ID = :emp_id
            `,
            { pre_id: Number(id), emp_id: payload.emp_id }
          );
        }
      }

      return updateResult;
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

    const result = await executeTransaction(async ({ execute }) => {
      await execute(
        `
          UPDATE EMP_EMPLEADO
          SET PRE_ID = NULL
          WHERE PRE_ID = :id
        `,
        { id: Number(id) }
      );

      return execute(
        `
          DELETE FROM EMP_PRESTAMO
          WHERE PRE_ID = :id
        `,
        { id: Number(id) }
      );
    });

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
