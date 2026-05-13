import { executeQuery } from "../../config/db.js";

const TIPOS_PERMITIDOS = ["ENFERMEDAD", "MATERNIDAD", "ACCIDENTE"];
const ESTADOS_PERMITIDOS = ["A", "I"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeUpper(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

function normalizeOptional(value) {
  const normalized = normalizeString(value);
  return normalized === "" || normalized === undefined ? null : normalized;
}

function isEmpty(value) {
  return value === undefined || value === null || value === "";
}

function isDateValue(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getDias(fechaInicio, fechaFin) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((parseDate(fechaFin) - parseDate(fechaInicio)) / millisecondsPerDay) + 1;
}

function isPositiveNumber(value) {
  return !isEmpty(value) && Number.isFinite(Number(value)) && Number(value) > 0;
}

function getPayload(body) {
  const payload = {
    emp_id: body.emp_id,
    sus_no_certificado: normalizeString(body.sus_no_certificado),
    sus_fecha_inicio: normalizeString(body.sus_fecha_inicio),
    sus_fecha_fin: normalizeString(body.sus_fecha_fin),
    sus_salario_diario: body.sus_salario_diario,
    sus_tipo: normalizeUpper(body.sus_tipo),
    sus_estado: normalizeUpper(body.sus_estado),
    sus_observacion: normalizeOptional(body.sus_observacion)
  };

  if (isEmpty(payload.emp_id)) {
    return { error: "El empleado es obligatorio" };
  }

  if (!Number.isFinite(Number(payload.emp_id))) {
    return { error: "El empleado debe ser un ID valido" };
  }

  if (isEmpty(payload.sus_no_certificado)) {
    return { error: "El numero de certificado es obligatorio" };
  }

  if (isEmpty(payload.sus_fecha_inicio)) {
    return { error: "La fecha de inicio es obligatoria" };
  }

  if (!isDateValue(payload.sus_fecha_inicio)) {
    return { error: "La fecha de inicio debe tener formato YYYY-MM-DD" };
  }

  if (isEmpty(payload.sus_fecha_fin)) {
    return { error: "La fecha de fin es obligatoria" };
  }

  if (!isDateValue(payload.sus_fecha_fin)) {
    return { error: "La fecha de fin debe tener formato YYYY-MM-DD" };
  }

  if (parseDate(payload.sus_fecha_fin) < parseDate(payload.sus_fecha_inicio)) {
    return { error: "La fecha de fin no puede ser menor que la fecha de inicio" };
  }

  if (!isPositiveNumber(payload.sus_salario_diario)) {
    return { error: "El salario diario debe ser mayor a 0" };
  }

  if (!payload.sus_tipo || !TIPOS_PERMITIDOS.includes(payload.sus_tipo)) {
    return { error: "El tipo de suspension debe ser ENFERMEDAD, MATERNIDAD o ACCIDENTE" };
  }

  if (!payload.sus_estado || !ESTADOS_PERMITIDOS.includes(payload.sus_estado)) {
    return { error: "El estado de la suspension debe ser A o I" };
  }

  payload.emp_id = Number(payload.emp_id);
  payload.sus_salario_diario = Number(payload.sus_salario_diario);
  payload.sus_dias = getDias(payload.sus_fecha_inicio, payload.sus_fecha_fin);

  return { payload };
}

async function empleadoExiste(empId) {
  const result = await executeQuery(
    "SELECT 1 FROM EMP_EMPLEADO WHERE EMP_ID = :emp_id",
    { emp_id: empId }
  );

  return result.rows.length > 0;
}

async function certificadoExiste(noCertificado, susId = null) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_SUSPENSION_IGSS
      WHERE UPPER(SUS_NO_CERTIFICADO) = UPPER(:sus_no_certificado)
        AND (:sus_id IS NULL OR SUS_ID <> :sus_id)
    `,
    { sus_no_certificado: noCertificado, sus_id: susId }
  );

  return result.rows.length > 0;
}

async function suspensionActivaTraslapada(payload, susId = null) {
  if (payload.sus_estado !== "A") {
    return false;
  }

  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_SUSPENSION_IGSS
      WHERE EMP_ID = :emp_id
        AND SUS_ESTADO = 'A'
        AND (:sus_id IS NULL OR SUS_ID <> :sus_id)
        AND TO_DATE(:sus_fecha_inicio, 'YYYY-MM-DD') <= SUS_FECHA_FIN
        AND TO_DATE(:sus_fecha_fin, 'YYYY-MM-DD') >= SUS_FECHA_INICIO
    `,
    {
      emp_id: payload.emp_id,
      sus_id: susId,
      sus_fecha_inicio: payload.sus_fecha_inicio,
      sus_fecha_fin: payload.sus_fecha_fin
    }
  );

  return result.rows.length > 0;
}

async function validarReglas(payload, susId = null) {
  if (!(await empleadoExiste(payload.emp_id))) {
    return "El empleado indicado no existe";
  }

  if (await certificadoExiste(payload.sus_no_certificado, susId)) {
    return "El numero de certificado ya existe";
  }

  if (await suspensionActivaTraslapada(payload, susId)) {
    return "El empleado ya tiene una suspension activa en el rango de fechas indicado";
  }

  return null;
}

function getSelectSql(where = "") {
  return `
    SELECT
      s.SUS_ID,
      s.EMP_ID,
      TRIM(e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO) AS EMP_NOMBRE,
      s.SUS_NO_CERTIFICADO,
      TO_CHAR(s.SUS_FECHA_INICIO, 'YYYY-MM-DD') AS SUS_FECHA_INICIO,
      TO_CHAR(s.SUS_FECHA_FIN, 'YYYY-MM-DD') AS SUS_FECHA_FIN,
      s.SUS_DIAS,
      s.SUS_SALARIO_DIARIO,
      s.SUS_TIPO,
      s.SUS_ESTADO,
      s.SUS_OBSERVACION,
      TO_CHAR(s.SUS_FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI:SS') AS SUS_FECHA_REGISTRO
    FROM EMP_SUSPENSION_IGSS s
    INNER JOIN EMP_EMPLEADO e ON e.EMP_ID = s.EMP_ID
    ${where}
  `;
}

export async function getSuspensionesIgss(req, res) {
  try {
    const result = await executeQuery(`${getSelectSql()} ORDER BY s.SUS_ID`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: `Error obteniendo suspensiones IGSS: ${error.message}` });
  }
}

export async function getSuspensionIgssById(req, res) {
  try {
    const { id } = req.params;
    const susId = Number(id);

    if (!Number.isFinite(susId)) {
      return res.status(400).json({ error: "El ID de suspension IGSS debe ser valido" });
    }

    const result = await executeQuery(getSelectSql("WHERE s.SUS_ID = :id"), { id: susId });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Suspension IGSS no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: `Error obteniendo suspension IGSS: ${error.message}` });
  }
}

export async function createSuspensionIgss(req, res) {
  try {
    const { payload, error: validationError } = getPayload(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const businessError = await validarReglas(payload);

    if (businessError) {
      return res.status(400).json({ error: businessError });
    }

    const sql = `
      INSERT INTO EMP_SUSPENSION_IGSS (
        SUS_ID,
        EMP_ID,
        SUS_NO_CERTIFICADO,
        SUS_FECHA_INICIO,
        SUS_FECHA_FIN,
        SUS_DIAS,
        SUS_SALARIO_DIARIO,
        SUS_TIPO,
        SUS_ESTADO,
        SUS_OBSERVACION,
        SUS_FECHA_REGISTRO
      )
      VALUES (
        EMP_SUSPENSION_IGSS_SEQ.NEXTVAL,
        :emp_id,
        :sus_no_certificado,
        TO_DATE(:sus_fecha_inicio, 'YYYY-MM-DD'),
        TO_DATE(:sus_fecha_fin, 'YYYY-MM-DD'),
        :sus_dias,
        :sus_salario_diario,
        :sus_tipo,
        :sus_estado,
        :sus_observacion,
        SYSDATE
      )
    `;

    await executeQuery(sql, payload);
    res.status(201).json({ message: "Suspension IGSS creada correctamente" });
  } catch (error) {
    res.status(500).json({ error: `Error creando suspension IGSS: ${error.message}` });
  }
}

export async function updateSuspensionIgss(req, res) {
  try {
    const { id } = req.params;
    const susId = Number(id);

    if (!Number.isFinite(susId)) {
      return res.status(400).json({ error: "El ID de suspension IGSS debe ser valido" });
    }

    const { payload, error: validationError } = getPayload(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const businessError = await validarReglas(payload, susId);

    if (businessError) {
      return res.status(400).json({ error: businessError });
    }

    const sql = `
      UPDATE EMP_SUSPENSION_IGSS
      SET
        EMP_ID = :emp_id,
        SUS_NO_CERTIFICADO = :sus_no_certificado,
        SUS_FECHA_INICIO = TO_DATE(:sus_fecha_inicio, 'YYYY-MM-DD'),
        SUS_FECHA_FIN = TO_DATE(:sus_fecha_fin, 'YYYY-MM-DD'),
        SUS_DIAS = :sus_dias,
        SUS_SALARIO_DIARIO = :sus_salario_diario,
        SUS_TIPO = :sus_tipo,
        SUS_ESTADO = :sus_estado,
        SUS_OBSERVACION = :sus_observacion
      WHERE SUS_ID = :sus_id
    `;

    const result = await executeQuery(sql, {
      ...payload,
      sus_id: susId
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Suspension IGSS no encontrada" });
    }

    res.json({ message: "Suspension IGSS actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ error: `Error actualizando suspension IGSS: ${error.message}` });
  }
}

export async function deleteSuspensionIgss(req, res) {
  try {
    const { id } = req.params;
    const susId = Number(id);

    if (!Number.isFinite(susId)) {
      return res.status(400).json({ error: "El ID de suspension IGSS debe ser valido" });
    }

    const result = await executeQuery(
      `
        UPDATE EMP_SUSPENSION_IGSS
        SET SUS_ESTADO = 'I'
        WHERE SUS_ID = :id
      `,
      { id: susId }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Suspension IGSS no encontrada" });
    }

    res.json({ message: "Suspension IGSS anulada correctamente" });
  } catch (error) {
    res.status(500).json({ error: `Error eliminando suspension IGSS: ${error.message}` });
  }
}
