import { executeQuery } from "../../config/db.js";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function ensureKpiResultadoEmployeeColumn() {
  const result = await executeQuery(
    `
      SELECT COUNT(*) AS TOTAL
      FROM USER_TAB_COLUMNS
      WHERE TABLE_NAME = 'EMP_KPI_RESULTADO'
        AND COLUMN_NAME = 'EMP_ID'
    `
  );

  if (Number(result.rows[0]?.TOTAL || 0) === 0) {
    throw new HttpError(
      409,
      "La tabla EMP_KPI_RESULTADO todavia no tiene EMP_ID. Ejecuta el script sql/kpi_resultado_empleado.sql para relacionar resultados KPI con empleados."
    );
  }
}

async function ensureEmpleadoExists(empId) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_EMPLEADO
      WHERE EMP_ID = :emp_id
    `,
    { emp_id: empId }
  );

  if (result.rows.length === 0) {
    throw new HttpError(400, "El empleado indicado no existe");
  }
}

async function ensureKpiExists(kpiId) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_KPI
      WHERE KPI_ID = :kpi_id
    `,
    { kpi_id: kpiId }
  );

  if (result.rows.length === 0) {
    throw new HttpError(400, "El KPI indicado no existe");
  }
}

function normalizeKpiResultadoPayload(body) {
  const payload = {
    kre_monto_total: Number(body.kre_monto_total),
    kre_calculo: Number(body.kre_calculo),
    kre_fecha: body.kre_fecha,
    kpi_id: Number(body.kpi_id),
    emp_id: Number(body.emp_id)
  };

  if (!Number.isFinite(payload.emp_id)) {
    throw new HttpError(400, "El empleado es obligatorio");
  }

  if (!Number.isFinite(payload.kpi_id)) {
    throw new HttpError(400, "El KPI es obligatorio");
  }

  if (!Number.isFinite(payload.kre_monto_total) || payload.kre_monto_total < 0) {
    throw new HttpError(400, "El monto del bono debe ser un numero valido");
  }

  if (!Number.isFinite(payload.kre_calculo) || payload.kre_calculo < 0) {
    throw new HttpError(400, "El porcentaje de productividad debe ser un numero valido");
  }

  if (!payload.kre_fecha || !/^\d{4}-\d{2}-\d{2}$/.test(payload.kre_fecha)) {
    throw new HttpError(400, "La fecha debe tener formato YYYY-MM-DD");
  }

  return payload;
}

/* =======================
   OBTENER RESULTADOS KPI
======================= */
export async function getKpiResultados(req, res) {
  try {
    const sql = `SELECT * FROM EMP_KPI_RESULTADO ORDER BY KRE_ID DESC`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo resultados KPI",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getKpiResultadoById(req, res) {
  try {
    const { id } = req.params;
    const sql = `SELECT * FROM EMP_KPI_RESULTADO WHERE KRE_ID = :id`;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Resultado KPI no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo resultado KPI",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createKpiResultado(req, res) {
  try {
    await ensureKpiResultadoEmployeeColumn();
    const payload = normalizeKpiResultadoPayload(req.body);
    await ensureEmpleadoExists(payload.emp_id);
    await ensureKpiExists(payload.kpi_id);

    const sql = `
      INSERT INTO EMP_KPI_RESULTADO (
        KRE_ID,
        KRE_MONTO_TOTAL,
        KRE_CALCULO,
        KRE_FECHA,
        KPI_ID,
        EMP_ID
      ) VALUES (
        EMP_KRE_SEQ.NEXTVAL,
        :monto,
        :calculo,
        TO_DATE(:fecha, 'YYYY-MM-DD'),
        :kpi_id,
        :emp_id
      )
    `;

    await executeQuery(sql, {
      monto: payload.kre_monto_total,
      calculo: payload.kre_calculo,
      fecha: payload.kre_fecha,
      kpi_id: payload.kpi_id,
      emp_id: payload.emp_id
    });

    res.status(201).json({ message: "Resultado KPI creado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({ message: "Error creando resultado KPI", error: error.message });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateKpiResultado(req, res) {
  try {
    const { id } = req.params;
    await ensureKpiResultadoEmployeeColumn();
    const payload = normalizeKpiResultadoPayload(req.body);
    await ensureEmpleadoExists(payload.emp_id);
    await ensureKpiExists(payload.kpi_id);

    const sql = `
      UPDATE EMP_KPI_RESULTADO
      SET 
        KRE_MONTO_TOTAL = :monto,
        KRE_CALCULO = :calculo,
        KRE_FECHA = TO_DATE(:fecha, 'YYYY-MM-DD'),
        KPI_ID = :kpi_id,
        EMP_ID = :emp_id
      WHERE KRE_ID = :id
    `;

    await executeQuery(sql, {
      id: Number(id),
      monto: payload.kre_monto_total,
      calculo: payload.kre_calculo,
      fecha: payload.kre_fecha,
      kpi_id: payload.kpi_id,
      emp_id: payload.emp_id
    });

    res.json({ message: "Resultado KPI actualizado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({ message: "Error actualizando resultado KPI", error: error.message });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteKpiResultado(req, res) {
  try {
    const { id } = req.params;
    const usado = await executeQuery(
      `
        SELECT 1
        FROM EMP_NOMINA_DETALLE
        WHERE KRE_ID = :id
          AND ROWNUM = 1
      `,
      { id: Number(id) }
    );

    if (usado.rows.length > 0) {
      return res.status(409).json({
        message: "No se puede eliminar el resultado KPI porque esta asociado a nomina"
      });
    }

    const sql = `DELETE FROM EMP_KPI_RESULTADO WHERE KRE_ID = :id`;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Resultado KPI no encontrado" });
    }

    res.json({ message: "Resultado KPI eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando resultado KPI", error: error.message });
  }
}
