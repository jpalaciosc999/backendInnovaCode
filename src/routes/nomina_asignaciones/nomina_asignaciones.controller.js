import { executeQuery } from "../../config/db.js";

function toNumberOrNull(value) {
  return value === undefined || value === null || value === "" ? null : Number(value);
}

function normalizeTipo(value) {
  return String(value || "").trim().toUpperCase();
}

function validatePayload(body) {
  const payload = {
    per_id: toNumberOrNull(body.per_id),
    emp_id: toNumberOrNull(body.emp_id),
    tis_id: toNumberOrNull(body.tis_id),
    tds_id: toNumberOrNull(body.tds_id),
    nas_tipo: normalizeTipo(body.nas_tipo),
    nas_monto: toNumberOrNull(body.nas_monto),
    nas_cantidad: toNumberOrNull(body.nas_cantidad),
    nas_referencia: body.nas_referencia || null,
    nas_descripcion: body.nas_descripcion || null,
    nas_estado: body.nas_estado || "A"
  };

  if (!payload.per_id) {
    return { error: "El periodo es obligatorio" };
  }

  if (!payload.emp_id) {
    return { error: "El empleado es obligatorio" };
  }

  if (!["I", "D"].includes(payload.nas_tipo)) {
    return { error: "El tipo debe ser I para ingreso o D para descuento" };
  }

  if (payload.nas_monto === null || payload.nas_monto < 0) {
    return { error: "El monto debe ser mayor o igual a cero" };
  }

  if (payload.nas_tipo === "I" && (!payload.tis_id || payload.tds_id)) {
    return { error: "Las asignaciones de ingreso requieren tis_id y no deben llevar tds_id" };
  }

  if (payload.nas_tipo === "D" && (!payload.tds_id || payload.tis_id)) {
    return { error: "Las asignaciones de descuento requieren tds_id y no deben llevar tis_id" };
  }

  return { payload };
}

function formatAsignacionError(error) {
  if (String(error.message || "").includes("ORA-02289")) {
    return "No existe la secuencia de asignaciones de nomina. Ejecuta sql/nomina_asignacion.sql.";
  }

  return error.message;
}

async function validarEmpleadoAsignable(payload) {
  const result = await executeQuery(
    `
      SELECT
        e.EMP_ESTADO,
        liq.LIQ_FECHA_SALIDA
      FROM EMP_EMPLEADO e
      LEFT JOIN (
        SELECT EMP_ID, MAX(LIQ_FECHA_SALIDA) AS LIQ_FECHA_SALIDA
        FROM EMP_LIQUIDACIONES
        GROUP BY EMP_ID
      ) liq ON liq.EMP_ID = e.EMP_ID
      WHERE e.EMP_ID = :emp_id
    `,
    { emp_id: payload.emp_id }
  );

  if (result.rows.length === 0) {
    return "Empleado no encontrado";
  }

  const estado = String(result.rows[0].EMP_ESTADO || "A").toUpperCase();
  if (estado !== "A" || result.rows[0].LIQ_FECHA_SALIDA) {
    return "El empleado ya no esta activo. No se pueden agregar ingresos o egresos; solo puede aparecer en la nomina del periodo de su salida.";
  }

  return null;
}

export async function getNominaAsignaciones(req, res) {
  try {
    const { per_id, emp_id } = req.query;
    const conditions = [];
    const binds = {};

    if (per_id) {
      conditions.push("nas.PER_ID = :per_id");
      binds.per_id = Number(per_id);
    }

    if (emp_id) {
      conditions.push("nas.EMP_ID = :emp_id");
      binds.emp_id = Number(emp_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT
        nas.NAS_ID,
        nas.PER_ID,
        nas.EMP_ID,
        e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS EMPLEADO,
        nas.TIS_ID,
        i.TIS_NOMBRE,
        nas.TDS_ID,
        d.TDS_NOMBRE,
        nas.NAS_TIPO,
        nas.NAS_MONTO,
        nas.NAS_CANTIDAD,
        nas.NAS_REFERENCIA,
        nas.NAS_DESCRIPCION,
        nas.NAS_ESTADO,
        nas.NAS_FECHA_CREACION,
        nas.NAS_FECHA_ACTUALIZACION
      FROM EMP_NOMINA_ASIGNACION nas
      INNER JOIN EMP_EMPLEADO e ON e.EMP_ID = nas.EMP_ID
      LEFT JOIN EMP_INGRESO i ON i.TIS_ID = nas.TIS_ID
      LEFT JOIN EMP_DESCUENTO d ON d.TDS_ID = nas.TDS_ID
      ${where}
      ORDER BY nas.NAS_ID DESC
    `;

    const result = await executeQuery(sql, binds);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo asignaciones de nomina",
      error: error.message
    });
  }
}

export async function getNominaAsignacionById(req, res) {
  try {
    const { id } = req.params;
    const result = await executeQuery(
      `
        SELECT *
        FROM EMP_NOMINA_ASIGNACION
        WHERE NAS_ID = :id
      `,
      { id: Number(id) }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Asignacion de nomina no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo asignacion de nomina",
      error: error.message
    });
  }
}

export async function createNominaAsignacion(req, res) {
  try {
    const validation = validatePayload(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const payload = validation.payload;
    const empleadoError = await validarEmpleadoAsignable(payload);
    if (empleadoError) {
      return res.status(400).json({ message: empleadoError });
    }

    await executeQuery(
      `
        INSERT INTO EMP_NOMINA_ASIGNACION (
          NAS_ID,
          PER_ID,
          EMP_ID,
          TIS_ID,
          TDS_ID,
          NAS_TIPO,
          NAS_MONTO,
          NAS_CANTIDAD,
          NAS_REFERENCIA,
          NAS_DESCRIPCION,
          NAS_ESTADO,
          NAS_FECHA_CREACION
        ) VALUES (
          SEQ_EMP_NOMINA_ASIGNACION.NEXTVAL,
          :per_id,
          :emp_id,
          :tis_id,
          :tds_id,
          :nas_tipo,
          :nas_monto,
          :nas_cantidad,
          :nas_referencia,
          :nas_descripcion,
          :nas_estado,
          SYSDATE
        )
      `,
      payload
    );

    res.status(201).json({ message: "Asignacion de nomina creada correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando asignacion de nomina",
      error: formatAsignacionError(error)
    });
  }
}

export async function updateNominaAsignacion(req, res) {
  try {
    const { id } = req.params;
    const validation = validatePayload(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const payload = validation.payload;
    const empleadoError = await validarEmpleadoAsignable(payload);
    if (empleadoError) {
      return res.status(400).json({ message: empleadoError });
    }

    const result = await executeQuery(
      `
        UPDATE EMP_NOMINA_ASIGNACION
        SET
          PER_ID = :per_id,
          EMP_ID = :emp_id,
          TIS_ID = :tis_id,
          TDS_ID = :tds_id,
          NAS_TIPO = :nas_tipo,
          NAS_MONTO = :nas_monto,
          NAS_CANTIDAD = :nas_cantidad,
          NAS_REFERENCIA = :nas_referencia,
          NAS_DESCRIPCION = :nas_descripcion,
          NAS_ESTADO = :nas_estado,
          NAS_FECHA_ACTUALIZACION = SYSDATE
        WHERE NAS_ID = :id
      `,
      { ...payload, id: Number(id) }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Asignacion de nomina no encontrada" });
    }

    res.json({ message: "Asignacion de nomina actualizada correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando asignacion de nomina",
      error: error.message
    });
  }
}

export async function deleteNominaAsignacion(req, res) {
  try {
    const { id } = req.params;
    const result = await executeQuery(
      `
        UPDATE EMP_NOMINA_ASIGNACION
        SET
          NAS_ESTADO = 'I',
          NAS_FECHA_ACTUALIZACION = SYSDATE
        WHERE NAS_ID = :id
      `,
      { id: Number(id) }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Asignacion de nomina no encontrada" });
    }

    res.json({ message: "Asignacion de nomina inactivada correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando asignacion de nomina",
      error: error.message
    });
  }
}
