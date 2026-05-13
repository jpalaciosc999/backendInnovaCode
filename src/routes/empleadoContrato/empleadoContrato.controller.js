import { executeQuery, executeTransaction } from "../../config/db.js";

function normalizeDate(value) {
  return value === "" || value === undefined ? null : value;
}

function normalizeEstado(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

function isDateValue(value) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getPayload(body) {
  const payload = {
    tco_fecha_inicio: normalizeDate(body.tco_fecha_inicio),
    tco_fecha_fin: normalizeDate(body.tco_fecha_fin),
    tco_estado: normalizeEstado(body.tco_estado),
    tic_fecha_modificacion: normalizeDate(body.tic_fecha_modificacion),
    tic_id: body.tic_id,
    emp_id: body.emp_id,
    tco_es_actual: body.tco_es_actual === undefined || body.tco_es_actual === ""
      ? 0
      : Number(body.tco_es_actual),
    tco_motivo_cambio: typeof body.tco_motivo_cambio === "string"
      ? body.tco_motivo_cambio.trim() || null
      : body.tco_motivo_cambio ?? null
  };

  if (!payload.tco_fecha_inicio) {
    return { error: "La fecha de inicio del contrato es obligatoria" };
  }

  if (!isDateValue(payload.tco_fecha_inicio)) {
    return { error: "La fecha de inicio debe tener formato YYYY-MM-DD" };
  }

  if (!isDateValue(payload.tco_fecha_fin)) {
    return { error: "La fecha de fin debe tener formato YYYY-MM-DD o enviarse vacia" };
  }

  if (!payload.tco_estado || !["A", "I"].includes(payload.tco_estado)) {
    return { error: "El estado del contrato debe ser A o I" };
  }

  if (!isDateValue(payload.tic_fecha_modificacion)) {
    return { error: "La fecha de modificacion debe tener formato YYYY-MM-DD o enviarse vacia" };
  }

  if (payload.tic_id === undefined || payload.tic_id === null || payload.tic_id === "") {
    return { error: "El tipo de contrato es obligatorio" };
  }

  if (payload.emp_id === undefined || payload.emp_id === null || payload.emp_id === "") {
    return { error: "El empleado es obligatorio" };
  }

  if (![0, 1].includes(payload.tco_es_actual)) {
    return { error: "El indicador de contrato actual debe ser 0 o 1" };
  }

  return { payload };
}

function isTipoIndefinido(tipoContrato) {
  const nombre = String(tipoContrato?.TIC_NOMBRE || "").trim().toUpperCase();
  const descripcion = String(tipoContrato?.TIC_DESCRIPCION || "").trim().toUpperCase();

  return nombre.includes("INDEFINIDO") || descripcion.includes("INDEFINIDO");
}

async function empleadoExiste(empId) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_EMPLEADO
      WHERE EMP_ID = :emp_id
    `,
    { emp_id: empId }
  );

  return result.rows.length > 0;
}

async function tipoContratoExiste(ticId) {
  const result = await executeQuery(
    `
      SELECT TIC_ID, TIC_NOMBRE, TIC_DESCRIPCION
      FROM EMP_TIPO_CONTRATO
      WHERE TIC_ID = :tic_id
    `,
    { tic_id: ticId }
  );

  return result.rows[0] || null;
}

async function validarReferencias(payload) {
  if (!(await empleadoExiste(payload.emp_id))) {
    return "El empleado indicado no existe";
  }

  const tipoContrato = await tipoContratoExiste(payload.tic_id);

  if (!tipoContrato) {
    return "El tipo de contrato indicado no existe";
  }

  return null;
}

function validarReglasTipoContrato(payload, tipoContrato) {
  const indefinido = isTipoIndefinido(tipoContrato);

  if (indefinido) {
    payload.tco_fecha_fin = null;
    return null;
  }

  if (!payload.tco_fecha_fin) {
    return "La fecha de fin es obligatoria para contratos no indefinidos";
  }

  if (payload.tco_fecha_fin < payload.tco_fecha_inicio) {
    return "La fecha de fin no puede ser anterior a la fecha de inicio";
  }

  return null;
}

async function validarNoTraslape(execute, payload, tcoId = null) {
  const result = await execute(
    `
      SELECT TCO_ID
      FROM EMP_EMPLEADO_CONTRATO
      WHERE EMP_ID = :emp_id
        AND TCO_ID <> NVL(:tco_id, -1)
        AND NVL(TCO_ESTADO, 'A') <> 'I'
        AND TCO_FECHA_INICIO <= NVL(TO_DATE(:tco_fecha_fin, 'YYYY-MM-DD'), DATE '9999-12-31')
        AND NVL(TCO_FECHA_FIN, DATE '9999-12-31') >= TO_DATE(:tco_fecha_inicio, 'YYYY-MM-DD')
    `,
    {
      emp_id: payload.emp_id,
      tco_id: tcoId,
      tco_fecha_inicio: payload.tco_fecha_inicio,
      tco_fecha_fin: payload.tco_fecha_fin
    }
  );

  return result.rows.length === 0 ? null : "El contrato se solapa con otro contrato del empleado";
}

async function marcarOtrosContratosNoActuales(execute, payload, tcoId = null) {
  if (payload.tco_es_actual !== 1) {
    return;
  }

  await execute(
    `
      UPDATE EMP_EMPLEADO_CONTRATO
      SET TCO_ES_ACTUAL = 0
      WHERE EMP_ID = :emp_id
        AND TCO_ID <> NVL(:tco_id, -1)
        AND TCO_ES_ACTUAL = 1
    `,
    {
      emp_id: payload.emp_id,
      tco_id: tcoId
    }
  );
}

export async function getEmpleadoContratos(req, res) {
  try {
    const sql = `
      SELECT
        ec.TCO_ID,
        TO_CHAR(ec.TCO_FECHA_INICIO, 'YYYY-MM-DD') AS TCO_FECHA_INICIO,
        TO_CHAR(ec.TCO_FECHA_FIN, 'YYYY-MM-DD') AS TCO_FECHA_FIN,
        ec.TCO_ESTADO,
        ec.TCO_ES_ACTUAL,
        ec.TCO_MOTIVO_CAMBIO,
        TO_CHAR(ec.TIC_FECHA_MODIFICACION, 'YYYY-MM-DD') AS TIC_FECHA_MODIFICACION,
        ec.TIC_ID,
        ec.EMP_ID
      FROM EMP_EMPLEADO_CONTRATO ec
      INNER JOIN EMP_TIPO_CONTRATO tc ON tc.TIC_ID = ec.TIC_ID
      ORDER BY ec.TCO_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: `Error obteniendo contratos de empleado: ${error.message}` });
  }
}

export async function getEmpleadoContratoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        ec.TCO_ID,
        TO_CHAR(ec.TCO_FECHA_INICIO, 'YYYY-MM-DD') AS TCO_FECHA_INICIO,
        TO_CHAR(ec.TCO_FECHA_FIN, 'YYYY-MM-DD') AS TCO_FECHA_FIN,
        ec.TCO_ESTADO,
        ec.TCO_ES_ACTUAL,
        ec.TCO_MOTIVO_CAMBIO,
        TO_CHAR(ec.TIC_FECHA_MODIFICACION, 'YYYY-MM-DD') AS TIC_FECHA_MODIFICACION,
        ec.TIC_ID,
        ec.EMP_ID
      FROM EMP_EMPLEADO_CONTRATO ec
      INNER JOIN EMP_TIPO_CONTRATO tc ON tc.TIC_ID = ec.TIC_ID
      WHERE ec.TCO_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Contrato de empleado no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: `Error obteniendo contrato de empleado: ${error.message}` });
  }
}

export async function createEmpleadoContrato(req, res) {
  try {
    const { payload, error: validationError } = getPayload(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const businessError = await validarReferencias(payload);

    if (businessError) {
      return res.status(400).json({ error: businessError });
    }

    const tipoContrato = await tipoContratoExiste(payload.tic_id);
    const tipoContratoError = validarReglasTipoContrato(payload, tipoContrato);

    if (tipoContratoError) {
      return res.status(400).json({ error: tipoContratoError });
    }

    const sql = `
      INSERT INTO EMP_EMPLEADO_CONTRATO (
        TCO_ID, TCO_FECHA_INICIO, TCO_FECHA_FIN,
        TCO_ESTADO, TCO_ES_ACTUAL, TCO_MOTIVO_CAMBIO,
        TIC_FECHA_MODIFICACION, TIC_ID, EMP_ID
      )
      VALUES (
        SEQ_CONTRATO.NEXTVAL,
        TO_DATE(:tco_fecha_inicio, 'YYYY-MM-DD'),
        TO_DATE(:tco_fecha_fin, 'YYYY-MM-DD'),
        :tco_estado,
        :tco_es_actual,
        :tco_motivo_cambio,
        TO_DATE(:tic_fecha_modificacion, 'YYYY-MM-DD'),
        :tic_id,
        :emp_id
      )
    `;

    await executeTransaction(async ({ execute }) => {
      const overlapError = await validarNoTraslape(execute, payload);

      if (overlapError) {
        const error = new Error(overlapError);
        error.status = 409;
        throw error;
      }

      await marcarOtrosContratosNoActuales(execute, payload);

      await execute(sql, {
        tco_fecha_inicio: payload.tco_fecha_inicio,
        tco_fecha_fin: payload.tco_fecha_fin,
        tco_estado: payload.tco_estado,
        tco_es_actual: payload.tco_es_actual,
        tco_motivo_cambio: payload.tco_motivo_cambio,
        tic_fecha_modificacion: payload.tic_fecha_modificacion,
        tic_id: payload.tic_id,
        emp_id: payload.emp_id
      });
    });

    res.status(201).json({ message: "Empleado contrato creado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({ error: `Error creando contrato de empleado: ${error.message}` });
  }
}

export async function updateEmpleadoContrato(req, res) {
  try {
    const { id } = req.params;
    const { payload, error: validationError } = getPayload(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const businessError = await validarReferencias(payload);

    if (businessError) {
      return res.status(400).json({ error: businessError });
    }

    const tipoContrato = await tipoContratoExiste(payload.tic_id);
    const tipoContratoError = validarReglasTipoContrato(payload, tipoContrato);

    if (tipoContratoError) {
      return res.status(400).json({ error: tipoContratoError });
    }

    const sql = `
      UPDATE EMP_EMPLEADO_CONTRATO
      SET
        TCO_FECHA_INICIO = TO_DATE(:tco_fecha_inicio, 'YYYY-MM-DD'),
        TCO_FECHA_FIN = TO_DATE(:tco_fecha_fin, 'YYYY-MM-DD'),
        TCO_ESTADO = :tco_estado,
        TCO_ES_ACTUAL = :tco_es_actual,
        TCO_MOTIVO_CAMBIO = :tco_motivo_cambio,
        TIC_FECHA_MODIFICACION = TO_DATE(:tic_fecha_modificacion, 'YYYY-MM-DD'),
        TIC_ID = :tic_id,
        EMP_ID = :emp_id
      WHERE TCO_ID = :id
    `;

    const result = await executeTransaction(async ({ execute }) => {
      const overlapError = await validarNoTraslape(execute, payload, Number(id));

      if (overlapError) {
        const error = new Error(overlapError);
        error.status = 409;
        throw error;
      }

      await marcarOtrosContratosNoActuales(execute, payload, Number(id));

      return execute(sql, {
        id: Number(id),
        tco_fecha_inicio: payload.tco_fecha_inicio,
        tco_fecha_fin: payload.tco_fecha_fin,
        tco_estado: payload.tco_estado,
        tco_es_actual: payload.tco_es_actual,
        tco_motivo_cambio: payload.tco_motivo_cambio,
        tic_fecha_modificacion: payload.tic_fecha_modificacion,
        tic_id: payload.tic_id,
        emp_id: payload.emp_id
      });
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Contrato de empleado no encontrado" });
    }

    res.json({ message: "Empleado contrato actualizado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({ error: `Error actualizando contrato de empleado: ${error.message}` });
  }
}

export async function deleteEmpleadoContrato(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      UPDATE EMP_EMPLEADO_CONTRATO
      SET
        TCO_ESTADO = 'I',
        TCO_ES_ACTUAL = 0,
        TIC_FECHA_MODIFICACION = SYSDATE
      WHERE TCO_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Contrato de empleado no encontrado" });
    }

    res.json({ message: "Empleado contrato eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ error: `Error eliminando contrato de empleado: ${error.message}` });
  }
}
