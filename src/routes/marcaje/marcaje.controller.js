import { executeQuery } from "../../config/db.js";

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isEmpleado(req) {
  return normalizeRole(req.usuario?.rol_nombre) === "empleado";
}

function puedeOperarEmpleado(req, empId) {
  if (!isEmpleado(req)) return true;
  return Number(req.usuario?.emp_id) === Number(empId);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundHours(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 100) / 100;
}

async function validarEmpleadoMarcable(empId) {
  const result = await executeQuery(
    `
      SELECT
        e.EMP_ID,
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
    { emp_id: Number(empId) }
  );

  const empleado = result.rows[0];
  if (!empleado) {
    return "Empleado no encontrado";
  }

  if (String(empleado.EMP_ESTADO || "A").toUpperCase() !== "A") {
    return "El empleado no esta activo. No puede registrar marcajes.";
  }

  if (empleado.LIQ_FECHA_SALIDA && new Date(empleado.LIQ_FECHA_SALIDA) <= new Date()) {
    return "El empleado esta liquidado. No puede registrar marcajes.";
  }

  return null;
}

function buildMarcajesDiariosSql({ includeEmpleadoId = true, limitRows = false, onlyToday = false } = {}) {
  const empleadoFilter = includeEmpleadoId ? "WHERE d.EMP_ID = :emp_id" : "";
  const dateFilter = onlyToday ? `${includeEmpleadoId ? "AND" : "WHERE"} TRUNC(d.MAR_DIA) = TRUNC(SYSDATE)` : "";
  const pagination = limitRows ? "OFFSET :offset ROWS FETCH NEXT 15 ROWS ONLY" : "";

  return `
    WITH EVENTOS AS (
      SELECT
        MAR_ID,
        EMP_ID,
        TRUNC(MAR_FECHA) AS MAR_DIA,
        MAR_ENTRADA AS MAR_EVENTO,
        MAR_AUTORIZACION
      FROM EMP_MARCAJE
      WHERE MAR_ENTRADA IS NOT NULL
      UNION ALL
      SELECT
        MAR_ID,
        EMP_ID,
        TRUNC(MAR_FECHA) AS MAR_DIA,
        MAR_SALIDA AS MAR_EVENTO,
        MAR_AUTORIZACION
      FROM EMP_MARCAJE
      WHERE MAR_SALIDA IS NOT NULL
    ),
    DIARIOS AS (
      SELECT
        EMP_ID,
        MAR_DIA,
        MIN(MAR_ID) AS MAR_ID,
        MIN(MAR_EVENTO) AS MAR_ENTRADA,
        CASE WHEN COUNT(*) >= 2 THEN MAX(MAR_EVENTO) END AS MAR_SALIDA,
        COUNT(*) AS MAR_TOTAL_EVENTOS,
        MAX(NVL(MAR_AUTORIZACION, 0)) AS MAR_AUTORIZACION,
        LISTAGG(TO_CHAR(MAR_EVENTO, 'YYYY-MM-DD HH24:MI:SS'), ',')
          WITHIN GROUP (ORDER BY MAR_EVENTO, MAR_ID) AS MAR_EVENTOS
      FROM EVENTOS
      GROUP BY EMP_ID, MAR_DIA
    ),
    HORARIOS AS (
      SELECT
        HOR_ID,
        CASE
          WHEN REGEXP_LIKE(TO_CHAR(HOR_HORA_INICIO), '^[0-2][0-9]:[0-5][0-9]') THEN
            TO_NUMBER(SUBSTR(TO_CHAR(HOR_HORA_INICIO), 1, 2)) * 60 +
            TO_NUMBER(SUBSTR(TO_CHAR(HOR_HORA_INICIO), 4, 2))
        END AS HOR_INICIO_MINUTOS,
        CASE
          WHEN REGEXP_LIKE(TO_CHAR(HOR_HORA_FIN), '^[0-2][0-9]:[0-5][0-9]') THEN
            TO_NUMBER(SUBSTR(TO_CHAR(HOR_HORA_FIN), 1, 2)) * 60 +
            TO_NUMBER(SUBSTR(TO_CHAR(HOR_HORA_FIN), 4, 2))
        END AS HOR_FIN_MINUTOS
      FROM EMP_HORARIO
    )
    SELECT *
    FROM (
      SELECT
        d.MAR_ID,
        d.MAR_DIA AS MAR_FECHA,
        d.MAR_ENTRADA,
        d.MAR_SALIDA,
        d.MAR_AUTORIZACION,
        d.EMP_ID,
        e.EMP_NOMBRE,
        e.EMP_APELLIDO,
        d.MAR_TOTAL_EVENTOS,
        d.MAR_EVENTOS,
        CASE
          WHEN d.MAR_TOTAL_EVENTOS = 1 THEN 'INCONSISTENTE'
          ELSE 'COMPLETO'
        END AS MAR_ESTADO_DIA,
        CASE
          WHEN d.MAR_TOTAL_EVENTOS >= 2 THEN ROUND((d.MAR_SALIDA - d.MAR_ENTRADA) * 24, 2)
        END AS MAR_HORAS_TRABAJADAS,
        CASE
          WHEN h.HOR_INICIO_MINUTOS IS NOT NULL AND h.HOR_FIN_MINUTOS IS NOT NULL THEN
            ROUND(MOD(h.HOR_FIN_MINUTOS - h.HOR_INICIO_MINUTOS + 1440, 1440) / 60, 2)
        END AS MAR_HORAS_PROGRAMADAS,
        CASE
          WHEN d.MAR_TOTAL_EVENTOS >= 2
            AND h.HOR_INICIO_MINUTOS IS NOT NULL
            AND h.HOR_FIN_MINUTOS IS NOT NULL THEN
            GREATEST(
              0,
              ROUND((d.MAR_SALIDA - d.MAR_ENTRADA) * 24, 2) -
              ROUND(MOD(h.HOR_FIN_MINUTOS - h.HOR_INICIO_MINUTOS + 1440, 1440) / 60, 2)
            )
          ELSE 0
        END AS MAR_HORAS_EXTRA,
        CASE
          WHEN d.MAR_TOTAL_EVENTOS >= 2
            AND h.HOR_INICIO_MINUTOS IS NOT NULL
            AND h.HOR_FIN_MINUTOS IS NOT NULL THEN
            GREATEST(
              0,
              ROUND(MOD(h.HOR_FIN_MINUTOS - h.HOR_INICIO_MINUTOS + 1440, 1440) / 60, 2) -
              ROUND((d.MAR_SALIDA - d.MAR_ENTRADA) * 24, 2)
            )
          ELSE 0
        END AS MAR_HORAS_FALTANTES
      FROM DIARIOS d
      JOIN EMP_EMPLEADO e ON e.EMP_ID = d.EMP_ID
      LEFT JOIN HORARIOS h ON h.HOR_ID = e.HOR_ID
      ${empleadoFilter}
      ${dateFilter}
      ORDER BY d.MAR_DIA DESC, d.MAR_ENTRADA DESC
    )
    ${pagination}
  `;
}

async function getResumenDia(empId) {
  const result = await executeQuery(
    buildMarcajesDiariosSql({ includeEmpleadoId: true, onlyToday: true }),
    { emp_id: Number(empId) }
  );

  return result.rows[0] || null;
}

async function registrarEventoMarcaje(empId) {
  const idResult = await executeQuery(`SELECT EMP_MARCAJE_SEQ.NEXTVAL AS MAR_ID FROM DUAL`);
  const marId = Number(idResult.rows[0].MAR_ID);

  try {
    await executeQuery(
      `
        INSERT INTO EMP_MARCAJE (
          MAR_ID,
          MAR_FECHA,
          MAR_ENTRADA,
          EMP_ID,
          MAR_AUTORIZACION
        )
        VALUES (
          :mar_id,
          TRUNC(SYSDATE),
          SYSDATE,
          :emp_id,
          0
        )
      `,
      {
        mar_id: marId,
        emp_id: Number(empId)
      }
    );

    return { marId, modo: "EVENTO_NUEVO" };
  } catch (error) {
    const existing = await executeQuery(
      `
        SELECT MAR_ID
        FROM EMP_MARCAJE
        WHERE EMP_ID = :emp_id
          AND TRUNC(MAR_FECHA) = TRUNC(SYSDATE)
        ORDER BY MAR_FECHA DESC, MAR_ID DESC
        FETCH FIRST 1 ROWS ONLY
      `,
      { emp_id: Number(empId) }
    );

    if (existing.rows.length === 0) {
      throw error;
    }

    const updateResult = await executeQuery(
      `
        UPDATE EMP_MARCAJE
        SET MAR_SALIDA = SYSDATE
        WHERE EMP_ID = :emp_id
          AND TRUNC(MAR_FECHA) = TRUNC(SYSDATE)
      `,
      { emp_id: Number(empId) }
    );

    if (Number(updateResult.rowsAffected || 0) === 0) {
      throw error;
    }

    return {
      marId: Number(existing.rows[0]?.MAR_ID || marId),
      modo: "SALIDA_ACTUALIZADA"
    };
  }
}

// LISTAR MARCAJES
export async function getMarcajes(req, res) {
  try {
    const sql = buildMarcajesDiariosSql({ includeEmpleadoId: false });

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    console.error("Error en getMarcajes:", error);
    res.status(500).json({
      message: "Error obteniendo marcajes",
      error: error.message
    });
  }
}

// OBTENER MARCAJE POR ID
export async function getMarcajeById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        M.MAR_ID,
        M.MAR_FECHA,
        M.MAR_ENTRADA,
        M.MAR_SALIDA,
        M.MAR_AUTORIZACION,
        M.EMP_ID,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO
      FROM EMP_MARCAJE M
      JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      WHERE M.MAR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error en getMarcajeById:", error);
    res.status(500).json({
      message: "Error obteniendo marcaje",
      error: error.message
    });
  }
}

// CREAR MARCAJE MANUAL
export async function createMarcaje(req, res) {
  try {
    const { emp_id, fecha, entrada, salida, autorizacion = 0 } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    if (!puedeOperarEmpleado(req, emp_id)) {
      return res.status(403).json({ message: "Solo puedes registrar marcajes para tu propio empleado" });
    }

    const errorEmpleado = await validarEmpleadoMarcable(emp_id);
    if (errorEmpleado) {
      return res.status(errorEmpleado === "Empleado no encontrado" ? 404 : 400).json({ message: errorEmpleado });
    }

    const sql = `
      INSERT INTO EMP_MARCAJE (
        MAR_ID,
        MAR_FECHA,
        MAR_ENTRADA,
        MAR_SALIDA,
        EMP_ID,
        MAR_AUTORIZACION
      )
      VALUES (
        EMP_MARCAJE_SEQ.NEXTVAL,
        NVL(TO_DATE(:fecha, 'YYYY-MM-DD'), TRUNC(SYSDATE)),
        TO_DATE(:entrada, 'YYYY-MM-DD HH24:MI:SS'),
        TO_DATE(:salida, 'YYYY-MM-DD HH24:MI:SS'),
        :emp_id,
        :autorizacion
      )
    `;

    await executeQuery(sql, {
      emp_id: Number(emp_id),
      fecha: fecha || null,
      entrada: entrada || null,
      salida: salida || null,
      autorizacion: Number(autorizacion)
    });

    res.status(201).json({ message: "Marcaje creado correctamente" });
  } catch (error) {
    console.error("Error en createMarcaje:", error);
    res.status(500).json({
      message: "Error creando marcaje",
      error: error.message
    });
  }
}

// REGISTRAR EVENTO DE MARCAJE AUTOMATICO
export async function registrarMarcaje(req, res) {
  try {
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    if (!puedeOperarEmpleado(req, emp_id)) {
      return res.status(403).json({ message: "Solo puedes registrar marcajes para tu propio empleado" });
    }

    const errorEmpleado = await validarEmpleadoMarcable(emp_id);
    if (errorEmpleado) {
      return res.status(errorEmpleado === "Empleado no encontrado" ? 404 : 400).json({ message: errorEmpleado });
    }

    const registro = await registrarEventoMarcaje(emp_id);

    let resumen = null;
    try {
      resumen = await getResumenDia(emp_id);
    } catch (resumenError) {
      console.error("Error calculando resumen diario de marcaje:", resumenError);
    }

    const totalEventos = toNumber(resumen?.MAR_TOTAL_EVENTOS);
    const horasExtra = roundHours(resumen?.MAR_HORAS_EXTRA) || 0;

    return res.status(201).json({
      message: "Marcaje registrado correctamente",
      MAR_ID: registro.marId,
      modo_registro: registro.modo,
      tipo_calculado: totalEventos === 1 ? "ENTRADA" : "EVENTO",
      estado_dia: resumen?.MAR_ESTADO_DIA || "INCONSISTENTE",
      autorizacion: horasExtra > 0 ? "PENDIENTE" : "NO_APLICA",
      resumen_dia: resumen
    });
  } catch (error) {
    console.error("Error en registrarMarcaje:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message
    });
  }
}

// HISTORIAL POR EMPLEADO
export async function getHistorial(req, res) {
  try {
    const { emp_id, offset = 0 } = req.query;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    if (!puedeOperarEmpleado(req, emp_id)) {
      return res.status(403).json({ message: "Solo puedes consultar tu propio historial de marcajes" });
    }
    const sql = buildMarcajesDiariosSql({ includeEmpleadoId: true, limitRows: true });

    const result = await executeQuery(sql, {
      emp_id: Number(emp_id),
      offset: Number(offset)
    });

    res.json(result.rows);
  } catch (error) {
    console.error("Error en getHistorial:", error);
    res.status(500).json({
      message: "Error obteniendo historial",
      error: error.message
    });
  }
}

// ACTUALIZAR AUTORIZACIÓN
export async function updateMarcaje(req, res) {
  try {
    const { id } = req.params;
    const { autorizacion } = req.body;

    if (isEmpleado(req)) {
      return res.status(403).json({ message: "No puedes autorizar marcajes desde un usuario empleado" });
    }

    if (![1, 2].includes(Number(autorizacion))) {
      return res.status(400).json({
        message: "La autorización debe ser 1 para autorizar o 2 para rechazar"
      });
    }

    const existe = await executeQuery(
      `SELECT MAR_ID FROM EMP_MARCAJE WHERE MAR_ID = :id`,
      { id: Number(id) }
    );

    if (existe.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    const sqlUpdate = `
      UPDATE EMP_MARCAJE
      SET MAR_AUTORIZACION = :autorizacion
      WHERE MAR_ID = :id
    `;

    await executeQuery(sqlUpdate, {
      autorizacion: Number(autorizacion),
      id: Number(id)
    });

    res.json({ message: "Marcaje actualizado correctamente" });
  } catch (error) {
    console.error("Error en updateMarcaje:", error);
    res.status(500).json({
      message: "Error actualizando marcaje",
      error: error.message
    });
  }
}

// ELIMINAR MARCAJE
export async function deleteMarcaje(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_MARCAJE
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id)
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json({ message: "Marcaje eliminado correctamente" });
  } catch (error) {
    console.error("Error en deleteMarcaje:", error);
    res.status(500).json({
      message: "Error eliminando marcaje",
      error: error.message
    });
  }
}
