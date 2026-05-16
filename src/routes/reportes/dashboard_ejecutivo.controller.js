import { executeQuery } from "../../config/db.js";

const IGSS_PATRONAL_RATE = 0.1267;
const IGSS_LABORAL_RATE = 0.0483;
const ALERTA_HORAS_EXTRA_UMBRAL = 60;

const DEPARTAMENTO_COLORS = [
  "#0f766e",
  "#0369a1",
  "#b45309",
  "#be123c",
  "#4338ca",
  "#166534",
  "#a16207",
  "#1d4ed8"
];

const LIQUIDACION_COLORS = [
  "#475569",
  "#0369a1",
  "#0f766e",
  "#be123c",
  "#7c3aed",
  "#b45309",
  "#0e7490",
  "#334155"
];

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntOrNull(value) {
  const parsed = toNumberOrNull(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseIsoDate(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthDateRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    fechaInicio: formatDate(start),
    fechaFin: formatDate(end)
  };
}

function currentMonthDateRange() {
  const now = new Date();
  return monthDateRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFixed2(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function initials(nombre, apellido) {
  const n = String(nombre || "").trim();
  const a = String(apellido || "").trim();
  return `${n.slice(0, 1)}${a.slice(0, 1)}`.toUpperCase();
}

async function resolvePeriodo({ periodoId, anio, mes, fechaInicio, fechaFin }) {
  if (periodoId) {
    const periodoResult = await executeQuery(
      `
        SELECT
          TO_CHAR(PER_FECHA_INICIO, 'YYYY-MM-DD') AS FECHA_INICIO,
          TO_CHAR(PER_FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN
        FROM EMP_PERIODO
        WHERE PER_ID = :periodoId
      `,
      { periodoId }
    );

    if (periodoResult.rows.length > 0) {
      return {
        periodoActual: `periodo:${periodoId}`,
        fechaInicio: periodoResult.rows[0].FECHA_INICIO,
        fechaFin: periodoResult.rows[0].FECHA_FIN,
        periodoId
      };
    }
  }

  const fechaInicioDirecta = parseIsoDate(fechaInicio);
  const fechaFinDirecta = parseIsoDate(fechaFin);

  if (fechaInicioDirecta && fechaFinDirecta) {
    return {
      periodoActual: `${fechaInicioDirecta}_${fechaFinDirecta}`,
      fechaInicio: fechaInicioDirecta,
      fechaFin: fechaFinDirecta,
      periodoId: null
    };
  }

  const anioNum = toIntOrNull(anio);
  const mesNum = toIntOrNull(mes);

  if (anioNum && mesNum && mesNum >= 1 && mesNum <= 12) {
    const range = monthDateRange(anioNum, mesNum);
    return {
      periodoActual: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
      ...range,
      periodoId: null
    };
  }

  if (anioNum) {
    return {
      periodoActual: `${anioNum}`,
      fechaInicio: `${anioNum}-01-01`,
      fechaFin: `${anioNum}-12-31`,
      periodoId: null
    };
  }

  const range = currentMonthDateRange();
  return {
    periodoActual: range.fechaInicio.slice(0, 7),
    ...range,
    periodoId: null
  };
}

function buildBinds({ reqQuery, periodo }) {
  const departamentoId = toIntOrNull(reqQuery.departamentoId);
  const empleadoId = toIntOrNull(reqQuery.empleadoId);
  const anio = toIntOrNull(reqQuery.anio);
  const mes = toIntOrNull(reqQuery.mes);
  const motivoSalida = reqQuery.motivoSalida ? String(reqQuery.motivoSalida).trim() : null;
  const estadoEmpleado = reqQuery.estadoEmpleado ? String(reqQuery.estadoEmpleado).trim().toUpperCase() : null;

  return {
    fechaInicio: periodo.fechaInicio,
    fechaFin: periodo.fechaFin,
    departamentoId,
    empleadoId,
    anio,
    mes,
    motivoSalida,
    estadoEmpleado
  };
}

async function fetchResumenBase(binds) {
  const [
    totalEmpleadosRes,
    costoPlanillaRes,
    contratosPorVencerRes,
    ingresosMesRes,
    bajasMesRes,
    liquidacionesMesRes,
    horasExtraMesRes,
    vacacionesPendRes,
    puntualidadRes
  ] = await Promise.all([
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_EMPLEADO E
        WHERE NVL(E.EMP_ESTADO, 'A') = 'A'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT NVL(SUM(N.NOM_TOTAL_INGRESOS), 0) AS COSTO
        FROM EMP_NOMINA N
        JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
        JOIN EMP_EMPLEADO E ON E.EMP_ID = N.EMP_ID
        WHERE P.PER_FECHA_INICIO <= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND P.PER_FECHA_FIN >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_EMPLEADO_CONTRATO C
        JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
        WHERE C.TCO_ES_ACTUAL = 1
          AND C.TCO_FECHA_FIN IS NOT NULL
          AND C.TCO_FECHA_FIN >= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND C.TCO_FECHA_FIN < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 31
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_EMPLEADO E
        WHERE E.EMP_FECHA_CONTRATACION >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND E.EMP_FECHA_CONTRATACION < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_LIQUIDACIONES L
        JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
        WHERE L.LIQ_FECHA_SALIDA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND L.LIQ_FECHA_SALIDA < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          AND (:motivoSalida IS NULL OR UPPER(L.LIQ_TIPO_RETIRO) = UPPER(:motivoSalida))
      `,
      binds
    ),
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_LIQUIDACIONES L
        JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
        WHERE L.LIQ_FECHA_REGISTRO >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND L.LIQ_FECHA_REGISTRO < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          AND (:motivoSalida IS NULL OR UPPER(L.LIQ_TIPO_RETIRO) = UPPER(:motivoSalida))
      `,
      binds
    ),
    executeQuery(
      `
        SELECT NVL(SUM(NVL(C.CTL_HORAS, 0)), 0) AS TOTAL_HORAS
        FROM EMP_CONTROL_LABORAL C
        JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
        WHERE C.CTL_FECHA_INICIO >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND C.CTL_FECHA_INICIO < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND UPPER(NVL(C.CTL_MOTIVO, '')) LIKE '%HORA%EXTRA%'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT
          COUNT(*) AS REGISTROS,
          AVG(NVL(C.CTL_HORAS, 0)) AS PROMEDIO
        FROM EMP_CONTROL_LABORAL C
        JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
        WHERE UPPER(NVL(C.CTL_MOTIVO, '')) LIKE '%VACACION%'
          AND (
            C.CTL_FECHA_REGRESO IS NULL
            OR UPPER(NVL(C.CTL_ESTADO, '')) IN ('P', 'PENDIENTE')
          )
          AND C.CTL_FECHA_INICIO <= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        WITH MARCAJES_BASE AS (
          SELECT
            CASE
              WHEN M.MAR_ENTRADA IS NULL THEN 'AUSENCIA'
              WHEN H.HOR_HORA_INICIO IS NULL THEN 'PUNTUAL'
              WHEN (
                TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'HH24')) * 60 + TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'MI'))
              ) <= (
                TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 1, 2)) * 60 + TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 4, 2)) + 10
              ) THEN 'PUNTUAL'
              ELSE 'TARDANZA'
            END AS ESTADO
          FROM EMP_MARCAJE M
          JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
          LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
          WHERE M.MAR_FECHA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
            AND M.MAR_FECHA < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
            AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
        )
        SELECT
          SUM(CASE WHEN ESTADO = 'PUNTUAL' THEN 1 ELSE 0 END) AS PUNTUAL,
          SUM(CASE WHEN ESTADO = 'TARDANZA' THEN 1 ELSE 0 END) AS TARDANZA,
          SUM(CASE WHEN ESTADO = 'AUSENCIA' THEN 1 ELSE 0 END) AS AUSENCIAS,
          COUNT(*) AS TOTAL
        FROM MARCAJES_BASE
      `,
      binds
    )
  ]);

  const puntual = toNumber(puntualidadRes.rows[0]?.PUNTUAL, 0);
  const tardanza = toNumber(puntualidadRes.rows[0]?.TARDANZA, 0);
  const ausencias = toNumber(puntualidadRes.rows[0]?.AUSENCIAS, 0);
  const totalMarcajes = toNumber(puntualidadRes.rows[0]?.TOTAL, 0);

  const puntualidad = totalMarcajes > 0
    ? toFixed2((puntual / totalMarcajes) * 100)
    : 0;

  const vacacionesRegistros = toNumber(vacacionesPendRes.rows[0]?.REGISTROS, 0);

  return {
    totalEmpleados: toNumber(totalEmpleadosRes.rows[0]?.TOTAL, 0),
    costoPlanillaMensual: toFixed2(costoPlanillaRes.rows[0]?.COSTO),
    contratosPorVencer: toNumber(contratosPorVencerRes.rows[0]?.TOTAL, 0),
    puntualidad,
    horasExtraMes: toFixed2(horasExtraMesRes.rows[0]?.TOTAL_HORAS),
    vacacionesPendientesPromedio: vacacionesRegistros > 0
      ? toFixed2(vacacionesPendRes.rows[0]?.PROMEDIO)
      : null,
    ingresosEsteMes: toNumber(ingresosMesRes.rows[0]?.TOTAL, 0),
    bajasEsteMes: toNumber(bajasMesRes.rows[0]?.TOTAL, 0),
    liquidacionesMes: toNumber(liquidacionesMesRes.rows[0]?.TOTAL, 0),
    marcajesResumen: {
      puntual,
      tardanza,
      ausencias
    },
    disponibilidad: {
      vacacionesPendientesPromedio: vacacionesRegistros > 0
    }
  };
}

async function fetchEvolucionPlanilla(binds) {
  const result = await executeQuery(
    `
      WITH MESES AS (
        SELECT
          ADD_MONTHS(TRUNC(TO_DATE(:fechaFin, 'YYYY-MM-DD'), 'MM'), -11 + (LEVEL - 1)) AS MES_INICIO
        FROM DUAL
        CONNECT BY LEVEL <= 12
      )
      SELECT
        TO_CHAR(M.MES_INICIO, 'YYYY-MM') AS MES,
        COUNT(DISTINCT N.EMP_ID) AS TOTAL,
        NVL(SUM(N.NOM_TOTAL_INGRESOS), 0) AS COSTO
      FROM MESES M
      LEFT JOIN EMP_PERIODO P
        ON P.PER_FECHA_INICIO <= LAST_DAY(M.MES_INICIO)
       AND P.PER_FECHA_FIN >= M.MES_INICIO
      LEFT JOIN EMP_NOMINA N ON N.PER_ID = P.PER_ID
      LEFT JOIN EMP_EMPLEADO E ON E.EMP_ID = N.EMP_ID
      WHERE (:departamentoId IS NULL OR E.DEP_ID = :departamentoId OR E.DEP_ID IS NULL)
        AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId OR E.EMP_ID IS NULL)
      GROUP BY TO_CHAR(M.MES_INICIO, 'YYYY-MM')
      ORDER BY TO_CHAR(M.MES_INICIO, 'YYYY-MM')
    `,
    binds
  );

  return {
    evolucionPlanilla: result.rows.map((row) => ({
      mes: row.MES,
      total: toNumber(row.TOTAL, 0)
    })),
    costoPlanillaPorMes: result.rows.map((row) => ({
      mes: row.MES,
      costo: toFixed2(row.COSTO)
    }))
  };
}

async function fetchDistribucionDepartamentos(binds) {
  const result = await executeQuery(
    `
      SELECT
        NVL(D.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
        COUNT(*) AS TOTAL
      FROM EMP_EMPLEADO E
      LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
      WHERE NVL(E.EMP_ESTADO, 'A') = 'A'
        AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      GROUP BY NVL(D.DEP_NOMBRE, 'Sin departamento')
      ORDER BY TOTAL DESC, NVL(D.DEP_NOMBRE, 'Sin departamento')
    `,
    binds
  );

  return result.rows.map((row, index) => ({
    departamento: row.DEPARTAMENTO,
    total: toNumber(row.TOTAL, 0),
    color: DEPARTAMENTO_COLORS[index % DEPARTAMENTO_COLORS.length]
  }));
}

async function fetchRotacionMensual(binds) {
  const result = await executeQuery(
    `
      WITH MESES AS (
        SELECT
          ADD_MONTHS(TRUNC(TO_DATE(:fechaFin, 'YYYY-MM-DD'), 'MM'), -11 + (LEVEL - 1)) AS MES_INICIO,
          LAST_DAY(ADD_MONTHS(TRUNC(TO_DATE(:fechaFin, 'YYYY-MM-DD'), 'MM'), -11 + (LEVEL - 1))) AS MES_FIN
        FROM DUAL
        CONNECT BY LEVEL <= 12
      ),
      INGRESOS AS (
        SELECT
          TO_CHAR(M.MES_INICIO, 'YYYY-MM') AS MES,
          COUNT(*) AS TOTAL
        FROM MESES M
        JOIN EMP_EMPLEADO E
          ON E.EMP_FECHA_CONTRATACION >= M.MES_INICIO
         AND E.EMP_FECHA_CONTRATACION < M.MES_FIN + 1
        WHERE (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
        GROUP BY TO_CHAR(M.MES_INICIO, 'YYYY-MM')
      ),
      BAJAS AS (
        SELECT
          TO_CHAR(M.MES_INICIO, 'YYYY-MM') AS MES,
          COUNT(*) AS TOTAL
        FROM MESES M
        JOIN EMP_LIQUIDACIONES L
          ON L.LIQ_FECHA_SALIDA >= M.MES_INICIO
         AND L.LIQ_FECHA_SALIDA < M.MES_FIN + 1
        JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
        WHERE (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          AND (:motivoSalida IS NULL OR UPPER(L.LIQ_TIPO_RETIRO) = UPPER(:motivoSalida))
        GROUP BY TO_CHAR(M.MES_INICIO, 'YYYY-MM')
      ),
      ACTIVOS AS (
        SELECT
          TO_CHAR(M.MES_INICIO, 'YYYY-MM') AS MES,
          COUNT(DISTINCT C.EMP_ID) AS TOTAL
        FROM MESES M
        JOIN EMP_EMPLEADO_CONTRATO C
          ON C.TCO_FECHA_INICIO <= M.MES_FIN
         AND NVL(C.TCO_FECHA_FIN, DATE '9999-12-31') >= M.MES_INICIO
        JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
        WHERE NVL(C.TCO_ESTADO, 'A') = 'A'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
        GROUP BY TO_CHAR(M.MES_INICIO, 'YYYY-MM')
      )
      SELECT
        TO_CHAR(M.MES_INICIO, 'YYYY-MM') AS MES,
        NVL(I.TOTAL, 0) AS INGRESOS,
        NVL(B.TOTAL, 0) AS BAJAS,
        NVL(A.TOTAL, 0) AS ACTIVOS
      FROM MESES M
      LEFT JOIN INGRESOS I ON I.MES = TO_CHAR(M.MES_INICIO, 'YYYY-MM')
      LEFT JOIN BAJAS B ON B.MES = TO_CHAR(M.MES_INICIO, 'YYYY-MM')
      LEFT JOIN ACTIVOS A ON A.MES = TO_CHAR(M.MES_INICIO, 'YYYY-MM')
      ORDER BY TO_CHAR(M.MES_INICIO, 'YYYY-MM')
    `,
    binds
  );

  const rotacionMensual = result.rows.map((row) => {
    const activos = toNumber(row.ACTIVOS, 0);
    const bajas = toNumber(row.BAJAS, 0);
    const rotacion = activos > 0 ? toFixed2((bajas / activos) * 100) : 0;

    return {
      mes: row.MES,
      ingresos: toNumber(row.INGRESOS, 0),
      bajas,
      rotacion
    };
  });

  const rotacion12Meses = rotacionMensual.length > 0
    ? toFixed2(
      rotacionMensual.reduce((acc, item) => acc + toNumber(item.rotacion, 0), 0) /
      rotacionMensual.length
    )
    : 0;

  return {
    rotacionMensual,
    rotacion12Meses
  };
}

async function fetchObligacionesPeriodo(binds) {
  const [
    basePlanillaRes,
    isrRetenidoRes,
    provisionIngresoRes
  ] = await Promise.all([
    executeQuery(
      `
        SELECT NVL(SUM(N.NOM_TOTAL_INGRESOS), 0) AS BASE_PLANILLA
        FROM EMP_NOMINA N
        JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
        JOIN EMP_EMPLEADO E ON E.EMP_ID = N.EMP_ID
        WHERE P.PER_FECHA_INICIO <= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND P.PER_FECHA_FIN >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT NVL(SUM(DET.DET_MONTO), 0) AS ISR_RETENIDO
        FROM EMP_NOMINA_DETALLE DET
        JOIN EMP_NOMINA N ON N.NOM_ID = DET.NOM_ID
        JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
        JOIN EMP_EMPLEADO E ON E.EMP_ID = N.EMP_ID
        JOIN EMP_DESCUENTO DSC ON DSC.TDS_ID = DET.TDS_ID
        WHERE P.PER_FECHA_INICIO <= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND P.PER_FECHA_FIN >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND UPPER(NVL(DSC.TDS_NOMBRE, '')) LIKE '%ISR%'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT
          SUM(CASE WHEN UPPER(NVL(I.TIS_NOMBRE, '')) LIKE '%AGUINALDO%' THEN NVL(DET.DET_MONTO, 0) ELSE 0 END) AS AGUINALDO,
          SUM(CASE WHEN UPPER(NVL(I.TIS_NOMBRE, '')) LIKE '%BONO14%' OR UPPER(NVL(I.TIS_NOMBRE, '')) LIKE '%BONO 14%' THEN NVL(DET.DET_MONTO, 0) ELSE 0 END) AS BONO14
        FROM EMP_NOMINA_DETALLE DET
        JOIN EMP_NOMINA N ON N.NOM_ID = DET.NOM_ID
        JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
        JOIN EMP_EMPLEADO E ON E.EMP_ID = N.EMP_ID
        JOIN EMP_INGRESO I ON I.TIS_ID = DET.TIS_ID
        WHERE P.PER_FECHA_INICIO <= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND P.PER_FECHA_FIN >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    )
  ]);

  const basePlanilla = toFixed2(basePlanillaRes.rows[0]?.BASE_PLANILLA);
  const igssPatronal = toFixed2(basePlanilla * IGSS_PATRONAL_RATE);
  const igssLaboral = toFixed2(basePlanilla * IGSS_LABORAL_RATE);
  const isrRetenido = toFixed2(isrRetenidoRes.rows[0]?.ISR_RETENIDO);
  const aguinaldoProvisionado = toFixed2(provisionIngresoRes.rows[0]?.AGUINALDO);
  const bono14Provisionado = toFixed2(provisionIngresoRes.rows[0]?.BONO14);

  return {
    igssPatronal,
    igssLaboral,
    isrRetenido,
    aguinaldoProvisionado,
    bono14Provisionado,
    totalObligaciones: toFixed2(
      igssPatronal + igssLaboral + isrRetenido + aguinaldoProvisionado + bono14Provisionado
    )
  };
}

async function fetchTopHorasExtra(binds) {
  const result = await executeQuery(
    `
      WITH HORAS_EXTRA AS (
        SELECT
          C.EMP_ID,
          SUM(NVL(C.CTL_HORAS, 0)) AS HORAS
        FROM EMP_CONTROL_LABORAL C
        JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
        WHERE C.CTL_FECHA_INICIO >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND C.CTL_FECHA_INICIO < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND UPPER(NVL(C.CTL_MOTIVO, '')) LIKE '%HORA%EXTRA%'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
        GROUP BY C.EMP_ID
      ),
      MONTO_EXTRA AS (
        SELECT
          N.EMP_ID,
          SUM(NVL(DET.DET_MONTO, 0)) AS TOTAL
        FROM EMP_NOMINA_DETALLE DET
        JOIN EMP_NOMINA N ON N.NOM_ID = DET.NOM_ID
        JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
        JOIN EMP_EMPLEADO E ON E.EMP_ID = N.EMP_ID
        JOIN EMP_INGRESO I ON I.TIS_ID = DET.TIS_ID
        WHERE P.PER_FECHA_INICIO <= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND P.PER_FECHA_FIN >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND UPPER(NVL(I.TIS_NOMBRE, '')) LIKE '%HORA%EXTRA%'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
        GROUP BY N.EMP_ID
      ),
      CONSOLIDADO AS (
        SELECT EMP_ID, SUM(HORAS) AS HORAS, SUM(TOTAL) AS TOTAL
        FROM (
          SELECT EMP_ID, HORAS, 0 AS TOTAL FROM HORAS_EXTRA
          UNION ALL
          SELECT EMP_ID, 0 AS HORAS, TOTAL FROM MONTO_EXTRA
        )
        GROUP BY EMP_ID
      )
      SELECT
        E.EMP_NOMBRE,
        E.EMP_APELLIDO,
        NVL(D.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
        NVL(C.HORAS, 0) AS HORAS,
        NVL(C.TOTAL, 0) AS TOTAL
      FROM CONSOLIDADO C
      JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
      LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
      ORDER BY NVL(C.HORAS, 0) DESC, NVL(C.TOTAL, 0) DESC, E.EMP_APELLIDO, E.EMP_NOMBRE
      FETCH FIRST 10 ROWS ONLY
    `,
    binds
  );

  return result.rows.map((row) => ({
    empleado: `${row.EMP_NOMBRE || ""} ${row.EMP_APELLIDO || ""}`.trim(),
    iniciales: initials(row.EMP_NOMBRE, row.EMP_APELLIDO),
    departamento: row.DEPARTAMENTO,
    horas: toFixed2(row.HORAS),
    total: toFixed2(row.TOTAL)
  }));
}

async function fetchDistribucionEstados(binds) {
  const result = await executeQuery(
    `
      SELECT NVL(E.EMP_ESTADO, 'ND') AS ESTADO, COUNT(*) AS TOTAL
      FROM EMP_EMPLEADO E
      WHERE (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
        AND (:estadoEmpleado IS NULL OR UPPER(NVL(E.EMP_ESTADO, 'ND')) = :estadoEmpleado)
      GROUP BY NVL(E.EMP_ESTADO, 'ND')
      ORDER BY TOTAL DESC, NVL(E.EMP_ESTADO, 'ND')
    `,
    binds
  );

  return result.rows.map((row) => ({
    estado: row.ESTADO,
    total: toNumber(row.TOTAL, 0)
  }));
}

async function fetchLiquidaciones(binds) {
  const [porMotivoRes, porEstadoEmpleadoRes, porEmpleadoRes] = await Promise.all([
    executeQuery(
      `
        SELECT
          NVL(L.LIQ_TIPO_RETIRO, 'SIN MOTIVO') AS MOTIVO,
          COUNT(*) AS CANTIDAD,
          NVL(SUM(L.LIQ_LIQUIDACION), 0) AS MONTO_TOTAL
        FROM EMP_LIQUIDACIONES L
        JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
        WHERE L.LIQ_FECHA_SALIDA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND L.LIQ_FECHA_SALIDA < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          AND (:motivoSalida IS NULL OR UPPER(L.LIQ_TIPO_RETIRO) = UPPER(:motivoSalida))
        GROUP BY NVL(L.LIQ_TIPO_RETIRO, 'SIN MOTIVO')
        ORDER BY CANTIDAD DESC, MOTIVO
      `,
      binds
    ),
    executeQuery(
      `
        SELECT
          NVL(E.EMP_ESTADO, 'ND') AS ESTADO,
          COUNT(*) AS CANTIDAD
        FROM EMP_LIQUIDACIONES L
        JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
        WHERE L.LIQ_FECHA_SALIDA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND L.LIQ_FECHA_SALIDA < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          AND (:motivoSalida IS NULL OR UPPER(L.LIQ_TIPO_RETIRO) = UPPER(:motivoSalida))
        GROUP BY NVL(E.EMP_ESTADO, 'ND')
        ORDER BY CANTIDAD DESC
      `,
      binds
    ),
    executeQuery(
      `
        SELECT
          E.EMP_NOMBRE,
          E.EMP_APELLIDO,
          NVL(D.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
          NVL(L.LIQ_TIPO_RETIRO, 'SIN MOTIVO') AS MOTIVO_SALIDA,
          TO_CHAR(L.LIQ_FECHA_SALIDA, 'YYYY-MM-DD') AS FECHA_SALIDA,
          NVL(L.LIQ_LIQUIDACION, 0) AS TOTAL_LIQUIDACION,
          NVL(L.LIQ_INDEMNIZACION, 0) AS INDEMNIZACION,
          NVL(L.LIQ_VACACIONES_PAGADAS, 0) AS VACACIONES,
          NVL(L.LIQ_AGUINALDO_PROPORCIONAL, 0) AS AGUINALDO,
          NVL(L.LIQ_BONO14_PROPORCIONAL, 0) AS BONO14
        FROM EMP_LIQUIDACIONES L
        JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
        LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
        WHERE L.LIQ_FECHA_SALIDA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
          AND L.LIQ_FECHA_SALIDA < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          AND (:motivoSalida IS NULL OR UPPER(L.LIQ_TIPO_RETIRO) = UPPER(:motivoSalida))
        ORDER BY L.LIQ_FECHA_SALIDA DESC, E.EMP_APELLIDO, E.EMP_NOMBRE
        FETCH FIRST 50 ROWS ONLY
      `,
      binds
    )
  ]);

  return {
    porMotivo: porMotivoRes.rows.map((row, index) => ({
      motivo: row.MOTIVO,
      cantidad: toNumber(row.CANTIDAD, 0),
      montoTotal: toFixed2(row.MONTO_TOTAL),
      color: LIQUIDACION_COLORS[index % LIQUIDACION_COLORS.length]
    })),
    porEstadoEmpleado: porEstadoEmpleadoRes.rows.map((row) => ({
      estado: row.ESTADO,
      cantidad: toNumber(row.CANTIDAD, 0)
    })),
    porEmpleado: porEmpleadoRes.rows.map((row) => ({
      empleado: `${row.EMP_NOMBRE || ""} ${row.EMP_APELLIDO || ""}`.trim(),
      departamento: row.DEPARTAMENTO,
      motivoSalida: row.MOTIVO_SALIDA,
      fechaSalida: row.FECHA_SALIDA,
      totalLiquidacion: toFixed2(row.TOTAL_LIQUIDACION),
      indemnizacion: toFixed2(row.INDEMNIZACION),
      vacaciones: toFixed2(row.VACACIONES),
      aguinaldo: toFixed2(row.AGUINALDO),
      bono14: toFixed2(row.BONO14)
    }))
  };
}

async function fetchAlertas(binds) {
  const [
    contratosPorVencerRes,
    vacacionesPendientesRes,
    empleadosInactivosRes,
    horasExtraFueraRangoRes
  ] = await Promise.all([
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_EMPLEADO_CONTRATO C
        JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
        WHERE C.TCO_ES_ACTUAL = 1
          AND C.TCO_FECHA_FIN IS NOT NULL
          AND C.TCO_FECHA_FIN >= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND C.TCO_FECHA_FIN < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 31
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_CONTROL_LABORAL C
        JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
        WHERE UPPER(NVL(C.CTL_MOTIVO, '')) LIKE '%VACACION%'
          AND (
            C.CTL_FECHA_REGRESO IS NULL
            OR UPPER(NVL(C.CTL_ESTADO, '')) IN ('P', 'PENDIENTE')
          )
          AND C.CTL_FECHA_INICIO <= TO_DATE(:fechaFin, 'YYYY-MM-DD')
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_EMPLEADO E
        WHERE NVL(E.EMP_ESTADO, 'A') = 'I'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
      `,
      binds
    ),
    executeQuery(
      `
        SELECT COUNT(*) AS TOTAL
        FROM (
          SELECT
            C.EMP_ID,
            SUM(NVL(C.CTL_HORAS, 0)) AS HORAS
          FROM EMP_CONTROL_LABORAL C
          JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
          WHERE C.CTL_FECHA_INICIO >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
            AND C.CTL_FECHA_INICIO < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
            AND UPPER(NVL(C.CTL_MOTIVO, '')) LIKE '%HORA%EXTRA%'
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
            AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          GROUP BY C.EMP_ID
        ) Q
        WHERE Q.HORAS > :umbralHorasExtra
      `,
      {
        ...binds,
        umbralHorasExtra: ALERTA_HORAS_EXTRA_UMBRAL
      }
    )
  ]);

  return [
    {
      tipo: "contrato",
      descripcion: "Contratos por vencer en los próximos 30 días",
      cantidad: toNumber(contratosPorVencerRes.rows[0]?.TOTAL, 0)
    },
    {
      tipo: "vacaciones",
      descripcion: "Empleados con vacaciones pendientes (control laboral)",
      cantidad: toNumber(vacacionesPendientesRes.rows[0]?.TOTAL, 0)
    },
    {
      tipo: "empleados_inactivos",
      descripcion: "Empleados en estado inactivo",
      cantidad: toNumber(empleadosInactivosRes.rows[0]?.TOTAL, 0)
    },
    {
      tipo: "horas_extra_fuera_rango",
      descripcion: `Empleados con más de ${ALERTA_HORAS_EXTRA_UMBRAL} horas extra en el período`,
      cantidad: toNumber(horasExtraFueraRangoRes.rows[0]?.TOTAL, 0)
    }
  ];
}

function buildFormulasMeta() {
  return {
    costoPlanillaMensual: "SUM(EMP_NOMINA.NOM_TOTAL_INGRESOS) en el período consultado",
    rotacionMensual: "(bajas del mes / empleados con contrato activo en el mes) * 100",
    rotacion12Meses: "promedio simple de la rotación mensual de los últimos 12 meses",
    puntualidad: "(marcajes puntuales / total de marcajes del período) * 100",
    contratosPorVencer: "contratos actuales con fecha fin entre fechaFin y fechaFin+30 días",
    horasExtraMes: "SUM(EMP_CONTROL_LABORAL.CTL_HORAS) con motivo que contiene 'HORA EXTRA'",
    vacacionesPendientesPromedio: "AVG(CTL_HORAS) de controles con motivo 'VACACION' pendientes o sin fecha de regreso",
    obligacionesIgss: `basePlanilla * ${IGSS_PATRONAL_RATE} (patronal) y basePlanilla * ${IGSS_LABORAL_RATE} (laboral)`
  };
}

export async function getDashboardEjecutivo(req, res) {
  try {
    const periodo = await resolvePeriodo({
      periodoId: toIntOrNull(req.query.periodoId),
      anio: req.query.anio,
      mes: req.query.mes,
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin
    });

    const binds = buildBinds({ reqQuery: req.query, periodo });

    const [
      resumenBase,
      evolucion,
      distribucionDepartamentos,
      rotacion,
      obligacionesPeriodo,
      topHorasExtra,
      distribucionEstados,
      liquidaciones,
      alertas
    ] = await Promise.all([
      fetchResumenBase(binds),
      fetchEvolucionPlanilla(binds),
      fetchDistribucionDepartamentos(binds),
      fetchRotacionMensual(binds),
      fetchObligacionesPeriodo(binds),
      fetchTopHorasExtra(binds),
      fetchDistribucionEstados(binds),
      fetchLiquidaciones(binds),
      fetchAlertas(binds)
    ]);

    const noDisponibles = [];

    if (!resumenBase.disponibilidad.vacacionesPendientesPromedio) {
      noDisponibles.push({
        campo: "vacacionesPendientesPromedio",
        motivo: "No existen registros pendientes de vacaciones en EMP_CONTROL_LABORAL para el filtro aplicado"
      });
    }

    const totalRegistrosProcesados =
      evolucion.evolucionPlanilla.length +
      distribucionDepartamentos.length +
      evolucion.costoPlanillaPorMes.length +
      rotacion.rotacionMensual.length +
      topHorasExtra.length +
      distribucionEstados.length +
      liquidaciones.porMotivo.length +
      liquidaciones.porEstadoEmpleado.length +
      liquidaciones.porEmpleado.length;

    return res.json({
      metadata: {
        periodoActual: periodo.periodoActual,
        fechaInicio: periodo.fechaInicio,
        fechaFin: periodo.fechaFin,
        filtrosAplicados: {
          anio: binds.anio,
          mes: binds.mes,
          periodoId: periodo.periodoId,
          departamentoId: binds.departamentoId,
          empleadoId: binds.empleadoId,
          motivoSalida: binds.motivoSalida,
          estadoEmpleado: binds.estadoEmpleado
        },
        totalRegistrosProcesados,
        camposNoDisponibles: noDisponibles,
        formulas: buildFormulasMeta()
      },
      resumen: {
        totalEmpleados: resumenBase.totalEmpleados,
        costoPlanillaMensual: resumenBase.costoPlanillaMensual,
        rotacion12Meses: rotacion.rotacion12Meses,
        contratosPorVencer: resumenBase.contratosPorVencer,
        puntualidad: resumenBase.puntualidad,
        horasExtraMes: resumenBase.horasExtraMes,
        vacacionesPendientesPromedio: resumenBase.vacacionesPendientesPromedio,
        ingresosEsteMes: resumenBase.ingresosEsteMes,
        bajasEsteMes: resumenBase.bajasEsteMes,
        liquidacionesMes: resumenBase.liquidacionesMes
      },
      evolucionPlanilla: evolucion.evolucionPlanilla,
      distribucionDepartamentos,
      costoPlanillaPorMes: evolucion.costoPlanillaPorMes,
      rotacionMensual: rotacion.rotacionMensual,
      obligacionesPeriodo,
      topHorasExtra,
      distribucionEstados,
      marcajesResumen: resumenBase.marcajesResumen,
      alertas,
      liquidaciones
    });
  } catch (error) {
    console.error("Error en getDashboardEjecutivo:", error);

    return res.status(500).json({
      message: "Error generando dashboard ejecutivo",
      error: error.message
    });
  }
}
