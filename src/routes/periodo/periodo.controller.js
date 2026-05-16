import { executeQuery } from "../../config/db.js";

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return {
      iso: `${match[1]}-${match[2]}-${match[3]}`,
      date: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    };
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return {
      iso: `${match[3]}-${match[2]}-${match[1]}`,
      date: new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])))
    };
  }

  return null;
}

function diffDaysInclusive(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
}

function getTipoPeriodo(diasPeriodo) {
  if (diasPeriodo >= 14 && diasPeriodo <= 16) {
    return "Q";
  }

  if (diasPeriodo >= 28 && diasPeriodo <= 31) {
    return "M";
  }

  return null;
}

function buildPeriodoPayload(body) {
  const fechaInicio = parseDateInput(body.fecha_inicio);
  const fechaFin = parseDateInput(body.fecha_fin);
  const fechaPago = parseDateInput(body.fecha_pago);
  const estado = String(body.estado || "").trim().slice(0, 1).toUpperCase();

  if (!fechaInicio || !fechaFin || !fechaPago || !estado) {
    throw new Error("Fecha inicio, fecha fin, fecha pago y estado son obligatorios");
  }

  const diasPeriodo = diffDaysInclusive(fechaInicio.date, fechaFin.date);
  const tipoPeriodo = getTipoPeriodo(diasPeriodo);

  if (diasPeriodo <= 0) {
    throw new Error("La fecha fin no puede ser anterior a la fecha inicio");
  }

  if (!tipoPeriodo) {
    throw new Error("Solo se permiten periodos quincenales de 14 a 16 dias o mensuales de 28 a 31 dias");
  }

  return {
    fecha_inicio: fechaInicio.iso,
    fecha_fin: fechaFin.iso,
    fecha_pago: fechaPago.iso,
    estado,
    dias_periodo: diasPeriodo,
    tipo_periodo: tipoPeriodo
  };
}

function getSelectSql(where = "") {
  return `
    SELECT
      PER_ID,
      PER_FECHA_INICIO,
      PER_FECHA_FIN,
      PER_FECHA_PAGO,
      PER_ESTADO,
      TRUNC(PER_FECHA_FIN) - TRUNC(PER_FECHA_INICIO) + 1 AS DIAS_PERIODO,
      CASE
        WHEN TRUNC(PER_FECHA_FIN) - TRUNC(PER_FECHA_INICIO) + 1 BETWEEN 14 AND 16 THEN 'Q'
        WHEN TRUNC(PER_FECHA_FIN) - TRUNC(PER_FECHA_INICIO) + 1 BETWEEN 28 AND 31 THEN 'M'
        ELSE 'X'
      END AS TIPO_PERIODO
    FROM EMP_PERIODO
    ${where}
  `;
}

/* =======================
   OBTENER PERIODOS
======================= */
export async function getPeriodos(req, res) {
  try {
    const sql = `${getSelectSql()} ORDER BY PER_FECHA_INICIO DESC, PER_ID DESC`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo periodos",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getPeriodoById(req, res) {
  try {
    const { id } = req.params;

    const sql = getSelectSql("WHERE PER_ID = :id");

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Periodo no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo periodo",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createPeriodo(req, res) {
  try {
    const payload = buildPeriodoPayload(req.body);

    const sql = `
      INSERT INTO EMP_PERIODO (
        PER_ID,
        PER_FECHA_INICIO,
        PER_FECHA_FIN,
        PER_FECHA_PAGO,
        PER_ESTADO
      ) VALUES (
        EMP_PERIODO_SEQ.NEXTVAL,
        TO_DATE(:fecha_inicio, 'YYYY-MM-DD'),
        TO_DATE(:fecha_fin, 'YYYY-MM-DD'),
        TO_DATE(:fecha_pago, 'YYYY-MM-DD'),
        :estado
      )
    `;

    await executeQuery(sql, {
      fecha_inicio: payload.fecha_inicio,
      fecha_fin: payload.fecha_fin,
      fecha_pago: payload.fecha_pago,
      estado: payload.estado
    });

    res.status(201).json({
      message: payload.tipo_periodo === "Q"
        ? "Periodo quincenal creado correctamente"
        : "Periodo mensual creado correctamente"
    });
  } catch (error) {
    res.status(400).json({
      message: "Error creando periodo",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updatePeriodo(req, res) {
  try {
    const { id } = req.params;
    const payload = buildPeriodoPayload(req.body);

    const sql = `
      UPDATE EMP_PERIODO
      SET 
        PER_FECHA_INICIO = TO_DATE(:fecha_inicio, 'YYYY-MM-DD'),
        PER_FECHA_FIN = TO_DATE(:fecha_fin, 'YYYY-MM-DD'),
        PER_FECHA_PAGO = TO_DATE(:fecha_pago, 'YYYY-MM-DD'),
        PER_ESTADO = :estado
      WHERE PER_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      fecha_inicio: payload.fecha_inicio,
      fecha_fin: payload.fecha_fin,
      fecha_pago: payload.fecha_pago,
      estado: payload.estado
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Periodo no encontrado"
      });
    }

    res.json({
      message: "Periodo actualizado correctamente"
    });
  } catch (error) {
    res.status(400).json({
      message: "Error actualizando periodo",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deletePeriodo(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_PERIODO
      WHERE PER_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Periodo no encontrado"
      });
    }

    res.json({
      message: "Periodo eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando periodo",
      error: error.message
    });
  }
}
