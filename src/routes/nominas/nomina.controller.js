import { executeQuery, executeTransaction } from "../../config/db.js";

const ESTADO_BORRADOR = "B";
const TASA_IGSS_LABORAL = 0.0483;
const DIAS_PERIODO_QUINCENAL = 16;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toNumber(value) {
  return value === null || value === undefined || value === "" ? 0 : Number(value);
}

function formatNominaError(error) {
  if (String(error.message || "").includes("ORA-02289")) {
    return "No existe una secuencia de nomina en Oracle. Ejecuta sql/nomina_sequences.sql.";
  }

  if (String(error.message || "").includes("ORA-00942")) {
    return "Falta una tabla requerida para generar nomina. Ejecuta sql/nomina_asignacion.sql si aun no existe EMP_NOMINA_ASIGNACION.";
  }

  return error.message;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getPeriodoPagoFactor(diasPeriodo) {
  const dias = toNumber(diasPeriodo);

  if (dias >= 14 && dias <= DIAS_PERIODO_QUINCENAL) {
    return 0.5;
  }

  if (dias >= 28 && dias <= 31) {
    return 1;
  }

  return null;
}

function calcularMontoMensualEnPeriodo(montoMensual, diasTrabajados, diasPeriodo) {
  const monto = toNumber(montoMensual);
  const dias = Math.max(0, toNumber(diasTrabajados));
  const diasDelPeriodo = Math.max(1, toNumber(diasPeriodo));
  const factorPago = getPeriodoPagoFactor(diasDelPeriodo) ?? 0;
  const factorTrabajo = Math.min(dias, diasDelPeriodo) / diasDelPeriodo;

  if (monto <= 0 || dias <= 0) {
    return 0;
  }

  return roundMoney(Math.min(monto, monto * factorPago * factorTrabajo));
}

function normalizePercent(value) {
  const percent = toNumber(value);
  return percent > 1 ? percent / 100 : percent;
}

function isPercentDiscount(tipoCalculo) {
  const tipo = String(tipoCalculo || "").toUpperCase();
  return tipo.includes("PORC") || tipo.includes("%");
}

function isFixedDiscount(tipoCalculo) {
  const tipo = String(tipoCalculo || "").toUpperCase();
  return tipo.includes("FIJO") || tipo.includes("MONTO") || tipo.includes("VALOR");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function rowMatchesTokens(row, codeField, nameField, tokens) {
  const code = normalizeText(row[codeField]);
  const name = normalizeText(row[nameField]);
  return tokens.some((token) => {
    const normalized = normalizeText(token);
    return code.includes(normalized) || name.includes(normalized);
  });
}

function isIngresoConcept(row, tokens) {
  return rowMatchesTokens(row, "TIS_CODIGO", "TIS_NOMBRE", tokens);
}

function isDescuentoConcept(row, tokens) {
  return rowMatchesTokens(row, "TDS_CODIGO", "TDS_NOMBRE", tokens);
}

function isTruthyDbFlag(value) {
  return ["1", "S", "Y", "A", "TRUE"].includes(String(value || "").trim().toUpperCase());
}

function normalizeEmployeeIds(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids = value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

async function getConceptoIngresoPorTokens(execute, tokens) {
  const result = await execute(
    `
      SELECT TIS_ID, TIS_CODIGO, TIS_NOMBRE
      FROM EMP_INGRESO
      ORDER BY TIS_ID
    `
  );

  const matches = result.rows.filter((row) => isIngresoConcept(row, tokens));
  return matches.find((row) =>
    tokens.some((token) => normalizeText(row.TIS_CODIGO) === normalizeText(token))
  ) || matches[0] || null;
}

async function getConceptoDescuentoPorTokens(execute, tokens) {
  const result = await execute(
    `
      SELECT TDS_ID, TDS_CODIGO, TDS_NOMBRE
      FROM EMP_DESCUENTO
      ORDER BY TDS_ID
    `
  );

  const matches = result.rows.filter((row) => isDescuentoConcept(row, tokens));
  return matches.find((row) =>
    tokens.some((token) => normalizeText(row.TDS_CODIGO) === normalizeText(token))
  ) || matches[0] || null;
}

async function getPeriodo(execute, perId) {
  const result = await execute(
    `
      SELECT
        PER_ID,
        TO_CHAR(PER_FECHA_INICIO, 'YYYY-MM-DD') AS FECHA_INICIO,
        TO_CHAR(PER_FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN,
        TRUNC(PER_FECHA_FIN) - TRUNC(PER_FECHA_INICIO) + 1 AS DIAS_PERIODO
      FROM EMP_PERIODO
      WHERE PER_ID = :per_id
    `,
    { per_id: perId }
  );

  if (result.rows.length === 0) {
    throw new HttpError(404, "Periodo no encontrado");
  }

  const periodo = result.rows[0];
  if (!periodo.FECHA_INICIO || !periodo.FECHA_FIN || toNumber(periodo.DIAS_PERIODO) <= 0) {
    throw new HttpError(400, "El periodo debe tener fecha inicio y fecha fin validas");
  }

  if (getPeriodoPagoFactor(periodo.DIAS_PERIODO) === null) {
    throw new HttpError(
      400,
      "El periodo debe ser quincenal de 14 a 16 dias o mensual de 28 a 31 dias"
    );
  }

  return periodo;
}

async function getConceptoSalario(execute) {
  const result = await execute(
    `
      SELECT TIS_ID
      FROM EMP_INGRESO
      WHERE ROWNUM = 1
        AND (
          UPPER(NVL(TIS_CODIGO, '')) IN ('SALARIO', 'SUELDO')
          OR UPPER(NVL(TIS_NOMBRE, '')) LIKE '%SALARIO%'
          OR UPPER(NVL(TIS_NOMBRE, '')) LIKE '%SUELDO%'
        )
      ORDER BY TIS_ID
    `
  );

  if (result.rows.length === 0) {
    throw new HttpError(
      400,
      "Debe existir un tipo de ingreso para salario o sueldo en EMP_INGRESO"
    );
  }

  return result.rows[0].TIS_ID;
}

async function getIngresosRecurrentes(execute, salarioTisId) {
  const result = await execute(
    `
      SELECT TIS_ID, TIS_NOMBRE, TIS_VALOR_BASE
      FROM EMP_INGRESO
      WHERE UPPER(TO_CHAR(NVL(TIS_ES_RECURRENTE, 0))) IN ('1', 'S')
        AND TIS_ID <> :salario_tis_id
        AND NVL(TIS_VALOR_BASE, 0) > 0
      ORDER BY TIS_ID
    `,
    { salario_tis_id: salarioTisId }
  );

  return result.rows;
}

async function getDescuentosObligatorios(execute) {
  const result = await execute(
    `
      SELECT
        TDS_ID,
        TDS_CODIGO,
        TDS_NOMBRE,
        TDS_TIPO_CALCULO,
        TDS_VALOR_BASE,
        TDS_PORCENTAJE
      FROM EMP_DESCUENTO
      WHERE NVL(TDS_ESTADO, 'A') = 'A'
        AND UPPER(TO_CHAR(NVL(TDS_ES_OBLIGATORIO, 0))) IN ('1', 'S')
      ORDER BY TDS_ID
    `
  );

  return result.rows;
}

async function getEmpleadosElegibles(execute, perId) {
  const result = await execute(
    `
      WITH periodo AS (
        SELECT
          PER_FECHA_INICIO,
          PER_FECHA_FIN,
          TRUNC(PER_FECHA_FIN) - TRUNC(PER_FECHA_INICIO) + 1 AS DIAS_PERIODO
        FROM EMP_PERIODO
        WHERE PER_ID = :per_id
      ),
      asignaciones AS (
        SELECT DISTINCT EMP_ID
        FROM EMP_NOMINA_ASIGNACION
        WHERE PER_ID = :per_id
          AND NVL(NAS_ESTADO, 'A') = 'A'
      ),
      liquidaciones AS (
        SELECT EMP_ID, MAX(LIQ_FECHA_SALIDA) AS LIQ_FECHA_SALIDA
        FROM EMP_LIQUIDACIONES
        GROUP BY EMP_ID
      ),
      contratos AS (
        SELECT
          ec.*,
          ROW_NUMBER() OVER (
            PARTITION BY ec.EMP_ID
            ORDER BY
              ec.TCO_ES_ACTUAL DESC,
              NVL(ec.TCO_FECHA_FIN, DATE '9999-12-31') DESC,
              ec.TCO_FECHA_INICIO DESC
          ) AS RN
        FROM EMP_EMPLEADO_CONTRATO ec
      ),
      calculo AS (
        SELECT
          a.EMP_ID,
          CASE
            WHEN ec.EMP_ID IS NULL THEN TRUNC(p.PER_FECHA_INICIO)
            ELSE GREATEST(TRUNC(ec.TCO_FECHA_INICIO), TRUNC(p.PER_FECHA_INICIO))
          END AS FECHA_INICIO_CALCULO,
          CASE
            WHEN ec.EMP_ID IS NULL THEN LEAST(
              TRUNC(NVL(l.LIQ_FECHA_SALIDA, p.PER_FECHA_FIN)),
              TRUNC(p.PER_FECHA_FIN)
            )
            ELSE LEAST(
              TRUNC(NVL(l.LIQ_FECHA_SALIDA, p.PER_FECHA_FIN)),
              TRUNC(NVL(ec.TCO_FECHA_FIN, p.PER_FECHA_FIN)),
              TRUNC(p.PER_FECHA_FIN)
            )
          END AS FECHA_FIN_CALCULO,
          p.DIAS_PERIODO,
          p.PER_FECHA_INICIO,
          p.PER_FECHA_FIN,
          l.LIQ_FECHA_SALIDA
        FROM asignaciones a
        CROSS JOIN periodo p
        LEFT JOIN liquidaciones l ON l.EMP_ID = a.EMP_ID
        LEFT JOIN contratos ec
          ON ec.EMP_ID = a.EMP_ID
         AND ec.RN = 1
         AND TRUNC(ec.TCO_FECHA_INICIO) <= TRUNC(p.PER_FECHA_FIN)
         AND TRUNC(NVL(ec.TCO_FECHA_FIN, NVL(l.LIQ_FECHA_SALIDA, p.PER_FECHA_FIN))) >= TRUNC(p.PER_FECHA_INICIO)
      )
      SELECT
        e.EMP_ID,
        e.EMP_NOMBRE,
        e.EMP_APELLIDO,
        NVL(pue.PUE_SALARIO_BASE, 0) AS SALARIO_BASE,
        MAX(c.DIAS_PERIODO) AS DIAS_PERIODO,
        SUM(c.FECHA_FIN_CALCULO - c.FECHA_INICIO_CALCULO + 1) AS DIAS_TRABAJADOS
      FROM calculo c
      INNER JOIN EMP_EMPLEADO e ON e.EMP_ID = c.EMP_ID
      LEFT JOIN EMP_PUESTO pue ON pue.PUE_ID = e.PUE_ID
      WHERE (
        NVL(e.EMP_ESTADO, 'A') = 'A'
        AND c.LIQ_FECHA_SALIDA IS NULL
      )
      OR (
        c.LIQ_FECHA_SALIDA IS NOT NULL
        AND TRUNC(c.LIQ_FECHA_SALIDA) BETWEEN TRUNC(c.PER_FECHA_INICIO) AND TRUNC(c.PER_FECHA_FIN)
      )
      GROUP BY
        e.EMP_ID,
        e.EMP_NOMBRE,
        e.EMP_APELLIDO,
        pue.PUE_SALARIO_BASE
      HAVING SUM(c.FECHA_FIN_CALCULO - c.FECHA_INICIO_CALCULO + 1) > 0
      ORDER BY e.EMP_ID
    `,
    { per_id: perId }
  );

  return result.rows;
}

async function getNominasExistentes(execute, perId) {
  const result = await execute(
    `
      SELECT EMP_ID, NOM_ID
        , NOM_ESTADO
      FROM EMP_NOMINA
      WHERE PER_ID = :per_id
    `,
    { per_id: perId }
  );

  return new Map(result.rows.map((row) => [Number(row.EMP_ID), {
    nom_id: row.NOM_ID,
    estado: row.NOM_ESTADO
  }]));
}

async function getKpiPorEmpleado(execute, periodo) {
  const result = await execute(
    `
      SELECT EMP_ID, KRE_ID, KRE_MONTO_TOTAL
      FROM EMP_KPI_RESULTADO
      WHERE EMP_ID IS NOT NULL
        AND KRE_FECHA BETWEEN TO_DATE(:fecha_inicio, 'YYYY-MM-DD')
                          AND TO_DATE(:fecha_fin, 'YYYY-MM-DD')
      ORDER BY EMP_ID, KRE_ID
    `,
    {
      fecha_inicio: periodo.FECHA_INICIO,
      fecha_fin: periodo.FECHA_FIN
    }
  );

  const byEmpleado = new Map();
  for (const row of result.rows) {
    const empId = Number(row.EMP_ID);
    const items = byEmpleado.get(empId) || [];
    items.push(row);
    byEmpleado.set(empId, items);
  }

  return byEmpleado;
}

async function getAsignacionesPorEmpleado(execute, perId) {
  const result = await execute(
    `
      SELECT
        nas.NAS_ID,
        nas.EMP_ID,
        nas.TIS_ID,
        nas.TDS_ID,
        nas.NAS_TIPO,
        nas.NAS_MONTO,
        nas.NAS_CANTIDAD,
        nas.NAS_REFERENCIA,
        i.TIS_CODIGO,
        i.TIS_NOMBRE,
        i.TIS_ES_RECURRENTE,
        d.TDS_CODIGO,
        d.TDS_NOMBRE
      FROM EMP_NOMINA_ASIGNACION nas
      LEFT JOIN EMP_INGRESO i ON i.TIS_ID = nas.TIS_ID
      LEFT JOIN EMP_DESCUENTO d ON d.TDS_ID = nas.TDS_ID
      WHERE nas.PER_ID = :per_id
        AND NVL(nas.NAS_ESTADO, 'A') = 'A'
      ORDER BY nas.EMP_ID, nas.NAS_ID
    `,
    { per_id: perId }
  );

  const byEmpleado = new Map();
  for (const row of result.rows) {
    const empId = Number(row.EMP_ID);
    const items = byEmpleado.get(empId) || [];
    items.push(row);
    byEmpleado.set(empId, items);
  }

  return byEmpleado;
}

function parseTimeValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() + value.getMinutes() / 60 + value.getSeconds() / 3600;
  }

  const text = String(value);
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const parsedDate = new Date(text);
    return Number.isNaN(parsedDate.getTime())
      ? null
      : parsedDate.getHours() + parsedDate.getMinutes() / 60 + parsedDate.getSeconds() / 3600;
  }

  return Number(match[1]) + Number(match[2]) / 60 + Number(match[3] || 0) / 3600;
}

function diffHours(start, end) {
  if (start === null || end === null) {
    return null;
  }

  let diff = end - start;
  if (diff < 0) {
    diff += 24;
  }
  return diff;
}

function hoursBetweenDates(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  let diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  if (diff < 0) {
    diff += 24;
  }
  return diff;
}

async function getHorasExtraPorEmpleado(execute, periodo) {
  try {
    const result = await execute(
      `
        SELECT
          m.EMP_ID,
          m.MAR_ENTRADA,
          m.MAR_SALIDA,
          h.HOR_HORA_INICIO,
          h.HOR_HORA_FIN
        FROM EMP_MARCAJE m
        INNER JOIN EMP_EMPLEADO e ON e.EMP_ID = m.EMP_ID
        LEFT JOIN EMP_HORARIO h ON h.HOR_ID = e.HOR_ID
        WHERE TRUNC(m.MAR_FECHA) BETWEEN TO_DATE(:fecha_inicio, 'YYYY-MM-DD')
                                     AND TO_DATE(:fecha_fin, 'YYYY-MM-DD')
          AND m.MAR_ENTRADA IS NOT NULL
          AND m.MAR_SALIDA IS NOT NULL
          AND NVL(m.MAR_AUTORIZACION, 0) = 1
      `,
      {
        fecha_inicio: periodo.FECHA_INICIO,
        fecha_fin: periodo.FECHA_FIN
      }
    );

    const byEmpleado = new Map();
    for (const row of result.rows) {
      const empId = Number(row.EMP_ID);
      const worked = hoursBetweenDates(row.MAR_ENTRADA, row.MAR_SALIDA);
      const scheduled = diffHours(
        parseTimeValue(row.HOR_HORA_INICIO),
        parseTimeValue(row.HOR_HORA_FIN)
      ) ?? 8;

      if (worked === null || scheduled <= 0) {
        continue;
      }

      const extra = Math.max(0, worked - scheduled);
      if (extra <= 0) {
        continue;
      }

      byEmpleado.set(empId, roundMoney((byEmpleado.get(empId) || 0) + extra));
    }

    return byEmpleado;
  } catch (error) {
    if (String(error.message || "").includes("ORA-00904")) {
      return new Map();
    }
    throw error;
  }
}

async function getPrestamosPorEmpleado(execute, periodo) {
  try {
    const result = await execute(
      `
        SELECT
          p.PRE_ID,
          e.EMP_ID,
          p.PRE_CUOTA_MENSUAL,
          p.PRE_SALDO_PENDIENTE
        FROM EMP_PRESTAMO p
        INNER JOIN EMP_EMPLEADO e ON e.PRE_ID = p.PRE_ID
        WHERE e.EMP_ID IS NOT NULL
          AND NVL(p.PRE_SALDO_PENDIENTE, 0) > 0
          AND UPPER(NVL(p.PRE_ESTADO, 'A')) IN ('A', 'ACTIVO')
          AND TRUNC(NVL(p.PRE_FECHA_INICIO, TO_DATE(:fecha_inicio, 'YYYY-MM-DD')))
              <= TO_DATE(:fecha_fin, 'YYYY-MM-DD')
        ORDER BY e.EMP_ID, p.PRE_ID
      `,
      {
        fecha_inicio: periodo.FECHA_INICIO,
        fecha_fin: periodo.FECHA_FIN
      }
    );

    const factorPeriodo = getPeriodoPagoFactor(periodo.DIAS_PERIODO);
    const byEmpleado = new Map();
    for (const row of result.rows) {
      const empId = Number(row.EMP_ID);
      const cuota = Math.min(
        roundMoney(toNumber(row.PRE_CUOTA_MENSUAL) * factorPeriodo),
        toNumber(row.PRE_SALDO_PENDIENTE)
      );
      if (cuota <= 0) {
        continue;
      }

      const items = byEmpleado.get(empId) || [];
      items.push({ pre_id: row.PRE_ID, monto: cuota });
      byEmpleado.set(empId, items);
    }

    return byEmpleado;
  } catch (error) {
    if (String(error.message || "").includes("ORA-00904")) {
      return new Map();
    }
    throw error;
  }
}

async function nextNominaId(execute) {
  const result = await execute(`SELECT EMP_NOMINA_SEQ.NEXTVAL AS NOM_ID FROM DUAL`);
  return result.rows[0].NOM_ID;
}

async function insertDetalle(execute, detalle) {
  await execute(
    `
      INSERT INTO EMP_NOMINA_DETALLE (
        DET_ID,
        DET_REFERENCIA,
        DET_MONTO,
        NOM_ID,
        TIS_ID,
        TDS_ID,
        KRE_ID
      ) VALUES (
        EMP_NOMINA_DETALLE_SEQ.NEXTVAL,
        :referencia,
        :monto,
        :nom_id,
        :tis_id,
        :tds_id,
        :kre_id
      )
    `,
    detalle
  );
}

async function aplicarPagosPrestamoPorNomina(execute, nomId) {
  const result = await execute(
    `
      SELECT
        nd.DET_ID,
        nd.NOM_ID,
        nd.DET_REFERENCIA AS PRE_ID,
        nd.DET_MONTO,
        p.PRE_SALDO_PENDIENTE,
        per.PER_FECHA_PAGO
      FROM EMP_NOMINA_DETALLE nd
      INNER JOIN EMP_NOMINA n ON n.NOM_ID = nd.NOM_ID
      INNER JOIN EMP_PERIODO per ON per.PER_ID = n.PER_ID
      INNER JOIN EMP_DESCUENTO d ON d.TDS_ID = nd.TDS_ID
      INNER JOIN EMP_PRESTAMO p ON p.PRE_ID = nd.DET_REFERENCIA
      WHERE nd.NOM_ID = :nom_id
        AND nd.DET_REFERENCIA IS NOT NULL
        AND nd.DET_MONTO > 0
        AND (
          UPPER(NVL(d.TDS_CODIGO, '')) LIKE '%PRESTAMO%'
          OR UPPER(NVL(d.TDS_NOMBRE, '')) LIKE '%PRESTAMO%'
        )
      ORDER BY nd.DET_ID
    `,
    { nom_id: nomId }
  );

  for (const row of result.rows) {
    const aplicado = await execute(
      `
        SELECT COUNT(*) AS TOTAL
        FROM EMP_PRESTAMO_DETALLE
        WHERE DET_ID = :det_id
      `,
      { det_id: row.DET_ID }
    );

    if (Number(aplicado.rows[0]?.TOTAL || 0) > 0) {
      continue;
    }

    const montoPago = Math.min(toNumber(row.DET_MONTO), toNumber(row.PRE_SALDO_PENDIENTE));
    if (montoPago <= 0) {
      continue;
    }

    const saldoRestante = roundMoney(toNumber(row.PRE_SALDO_PENDIENTE) - montoPago);
    const cuotaResult = await execute(
      `
        SELECT NVL(MAX(PDE_NUMERO_CUOTA), 0) + 1 AS NUMERO_CUOTA
        FROM EMP_PRESTAMO_DETALLE
        WHERE PRE_ID = :pre_id
      `,
      { pre_id: row.PRE_ID }
    );

    await execute(
      `
        INSERT INTO EMP_PRESTAMO_DETALLE (
          PDE_ID,
          PDE_NUMERO_CUOTA,
          PDE_FECHA_PAGO,
          PDE_MONTO,
          PDE_SALDO_RESTANTE,
          PDE_ESTADO,
          PRE_ID,
          NOM_ID,
          DET_ID
        ) VALUES (
          SEQ_EMP_PRESTAMO_DETALLE.NEXTVAL,
          :numero_cuota,
          TRUNC(:fecha_pago),
          :monto,
          :saldo_restante,
          'A',
          :pre_id,
          :nom_id,
          :det_id
        )
      `,
      {
        numero_cuota: cuotaResult.rows[0].NUMERO_CUOTA,
        fecha_pago: row.PER_FECHA_PAGO,
        monto: montoPago,
        saldo_restante: saldoRestante,
        pre_id: row.PRE_ID,
        nom_id: row.NOM_ID,
        det_id: row.DET_ID
      }
    );

    await execute(
      `
        UPDATE EMP_PRESTAMO
        SET
          PRE_SALDO_PENDIENTE = :saldo_restante,
          PRE_ESTADO = CASE WHEN :saldo_restante <= 0 THEN 'I' ELSE PRE_ESTADO END
        WHERE PRE_ID = :pre_id
      `,
      {
        saldo_restante: saldoRestante,
        pre_id: row.PRE_ID
      }
    );
  }
}

function calcularDescuento(descuento, baseCalculo, factorPagoPeriodo = 1) {
  if (isPercentDiscount(descuento.TDS_TIPO_CALCULO)) {
    return roundMoney(baseCalculo * normalizePercent(descuento.TDS_PORCENTAJE));
  }

  if (isFixedDiscount(descuento.TDS_TIPO_CALCULO) || toNumber(descuento.TDS_VALOR_BASE) > 0) {
    return roundMoney(toNumber(descuento.TDS_VALOR_BASE) * factorPagoPeriodo);
  }

  return 0;
}

function calcularISRMensual(salarioMensualEstimado) {
  const salario = Math.max(0, toNumber(salarioMensualEstimado));
  const rentaAnual = salario * 12;
  const deduccionPersonal = 48000;
  const minimoVital = 60000;
  const rentaImponible = Math.max(0, rentaAnual - deduccionPersonal - minimoVital);

  if (rentaImponible <= 0) {
    return 0;
  }

  if (rentaImponible <= 300000) {
    return roundMoney((rentaImponible * 0.05) / 12);
  }

  return roundMoney((15000 + (rentaImponible - 300000) * 0.07) / 12);
}

function agregarDetalle(detalles, detalle) {
  const monto = roundMoney(detalle.monto);
  if (monto <= 0) {
    return 0;
  }

  detalles.push({
    referencia: detalle.referencia ?? null,
    monto,
    tis_id: detalle.tis_id ?? null,
    tds_id: detalle.tds_id ?? null,
    kre_id: detalle.kre_id ?? null
  });

  return monto;
}

function tieneAsignacionIngreso(asignaciones, tisId) {
  return asignaciones.some((asignacion) => {
    return asignacion.NAS_TIPO === "I" && Number(asignacion.TIS_ID) === Number(tisId);
  });
}

function tieneAsignacionDescuento(asignaciones, tdsId) {
  return asignaciones.some((asignacion) => {
    return asignacion.NAS_TIPO === "D" && Number(asignacion.TDS_ID) === Number(tdsId);
  });
}

function isAsignacionIngresoProrrateable(asignacion, salarioTisId) {
  if (Number(asignacion.TIS_ID) === Number(salarioTisId)) {
    return true;
  }

  if (isTruthyDbFlag(asignacion.TIS_ES_RECURRENTE)) {
    return true;
  }

  return rowMatchesTokens(asignacion, "TIS_CODIGO", "TIS_NOMBRE", [
    "BONIF",
    "BONIFICACION",
    "BONO DECRETO",
    "DECRETO",
    "INCENTIVO"
  ]);
}

/* =======================
   GENERAR NOMINAS
======================= */
export async function generarNominas(req, res) {
  try {
    const perId = Number(req.body.per_id);
    const fechaGeneracion = req.body.fecha_generacion || null;
    const estado = req.body.estado || ESTADO_BORRADOR;
    const employeeFilter = normalizeEmployeeIds(req.body.emp_ids || req.body.empleados_ids);
    const recalcular = req.body.recalcular === true || req.body.recalcular === "S";

    if (!Number.isInteger(perId) || perId <= 0) {
      return res.status(400).json({ message: "El periodo es obligatorio" });
    }

    if (fechaGeneracion && !/^\d{4}-\d{2}-\d{2}$/.test(fechaGeneracion)) {
      return res.status(400).json({
        message: "La fecha de generacion debe tener formato YYYY-MM-DD"
      });
    }

    const result = await executeTransaction(async ({ execute }) => {
      const periodo = await getPeriodo(execute, perId);
      const salarioTisId = await getConceptoSalario(execute);
      const horaExtraConcepto = await getConceptoIngresoPorTokens(execute, ["HORA EXTRA", "HORAS EXTRA", "EXTRA"]);
      const comisionConcepto = await getConceptoIngresoPorTokens(execute, ["COMISION", "KPI"]);
      const igssConcepto = await getConceptoDescuentoPorTokens(execute, ["IGSS-LAB", "IGSS"]);
      const isrConcepto = await getConceptoDescuentoPorTokens(execute, ["ISR"]);
      const prestamoConcepto = await getConceptoDescuentoPorTokens(execute, ["PRESTAMO"]);
      const ingresosRecurrentes = await getIngresosRecurrentes(execute, salarioTisId);
      const descuentosObligatorios = await getDescuentosObligatorios(execute);
      const existentes = await getNominasExistentes(execute, perId);
      const kpiPorEmpleado = await getKpiPorEmpleado(execute, periodo);
      const horasExtraPorEmpleado = await getHorasExtraPorEmpleado(execute, periodo);
      const prestamosPorEmpleado = await getPrestamosPorEmpleado(execute, periodo);
      const asignacionesPorEmpleado = await getAsignacionesPorEmpleado(execute, perId);
      const empleados = (await getEmpleadosElegibles(execute, perId)).filter((empleado) => {
        return !employeeFilter || employeeFilter.has(Number(empleado.EMP_ID));
      });

      const generadas = [];
      const omitidas = [];

      for (const empleado of empleados) {
        const empId = Number(empleado.EMP_ID);
        const salarioBase = toNumber(empleado.SALARIO_BASE);
        const diasPeriodo = toNumber(empleado.DIAS_PERIODO);
        const diasTrabajados = Math.min(toNumber(empleado.DIAS_TRABAJADOS), diasPeriodo);
        const factorPagoPeriodo = getPeriodoPagoFactor(diasPeriodo);
        const asignacionesEmpleado = asignacionesPorEmpleado.get(empId) || [];

        const nominaExistente = existentes.get(empId);

        if (nominaExistente && !recalcular) {
          omitidas.push({
            emp_id: empId,
            motivo: "Ya existe nomina para este empleado en el periodo",
            nom_id: nominaExistente.nom_id
          });
          continue;
        }

        if (nominaExistente && ["A", "P"].includes(String(nominaExistente.estado || "").toUpperCase())) {
          omitidas.push({
            emp_id: empId,
            motivo: "La nomina ya esta aprobada o pendiente de aprobacion; no se recalcula",
            nom_id: nominaExistente.nom_id
          });
          continue;
        }

        if (salarioBase <= 0) {
          omitidas.push({
            emp_id: empId,
            motivo: "El empleado no tiene salario base configurado en el puesto"
          });
          continue;
        }

        const detalles = [];
        const salarioProporcional = calcularMontoMensualEnPeriodo(
          salarioBase,
          diasTrabajados,
          diasPeriodo
        );
        const isSalaryTis = (tisId) => Number(tisId) === Number(salarioTisId);
        const isExtraTis = (tisId) =>
          horaExtraConcepto && Number(tisId) === Number(horaExtraConcepto.TIS_ID);
        const isComisionTis = (tisId) =>
          comisionConcepto && Number(tisId) === Number(comisionConcepto.TIS_ID);
        const addLegalIncomeBase = (tisId, monto) => {
          if (isSalaryTis(tisId) || isExtraTis(tisId) || isComisionTis(tisId)) {
            baseDescuentosLegales = roundMoney(baseDescuentosLegales + monto);
          }
        };

        let totalIngresos = 0;
        let totalDescuento = 0;
        let baseDescuentosLegales = 0;

        if (salarioProporcional > 0 && !tieneAsignacionIngreso(asignacionesEmpleado, salarioTisId)) {
          const monto = agregarDetalle(detalles, {
            monto: salarioProporcional,
            tis_id: salarioTisId
          });
          totalIngresos += monto;
          addLegalIncomeBase(salarioTisId, monto);
        }

        for (const ingreso of ingresosRecurrentes) {
          if (tieneAsignacionIngreso(asignacionesEmpleado, ingreso.TIS_ID)) {
            continue;
          }

          const monto = agregarDetalle(detalles, {
            monto: calcularMontoMensualEnPeriodo(
              ingreso.TIS_VALOR_BASE,
              diasTrabajados,
              diasPeriodo
            ),
            tis_id: ingreso.TIS_ID
          });
          totalIngresos += monto;
          addLegalIncomeBase(ingreso.TIS_ID, monto);
        }

        const horasExtra = toNumber(horasExtraPorEmpleado.get(empId));
        if (horasExtra > 0 && horaExtraConcepto) {
          const salarioHora = salarioBase / 30 / 8;
          const montoExtra = roundMoney(horasExtra * salarioHora * 1.5);
          const monto = agregarDetalle(detalles, {
            referencia: horasExtra,
            monto: montoExtra,
            tis_id: horaExtraConcepto.TIS_ID
          });
          totalIngresos += monto;
          addLegalIncomeBase(horaExtraConcepto.TIS_ID, monto);
        }

        for (const kpi of kpiPorEmpleado.get(empId) || []) {
          const monto = agregarDetalle(detalles, {
            monto: kpi.KRE_MONTO_TOTAL,
            tis_id: comisionConcepto?.TIS_ID || null,
            kre_id: kpi.KRE_ID
          });
          totalIngresos += monto;
          if (monto > 0) {
            baseDescuentosLegales = roundMoney(baseDescuentosLegales + monto);
          }
        }

        for (const asignacion of asignacionesEmpleado.filter((item) => item.NAS_TIPO === "I")) {
          const montoAsignacion = isAsignacionIngresoProrrateable(asignacion, salarioTisId)
            ? calcularMontoMensualEnPeriodo(asignacion.NAS_MONTO, diasTrabajados, diasPeriodo)
            : asignacion.NAS_MONTO;
          const monto = agregarDetalle(detalles, {
            referencia: asignacion.NAS_ID,
            monto: montoAsignacion,
            tis_id: asignacion.TIS_ID
          });
          totalIngresos += monto;
          addLegalIncomeBase(asignacion.TIS_ID, monto);
        }

        totalIngresos = roundMoney(totalIngresos);

        const descuentosAutomaticosIds = new Set(
          [igssConcepto?.TDS_ID, isrConcepto?.TDS_ID, prestamoConcepto?.TDS_ID]
            .filter(Boolean)
            .map(Number)
        );

        for (const descuento of descuentosObligatorios) {
          if (
            descuentosAutomaticosIds.has(Number(descuento.TDS_ID))
            || isDescuentoConcept(descuento, ["IGSS", "ISR", "PRESTAMO"])
          ) {
            continue;
          }

          if (tieneAsignacionDescuento(asignacionesEmpleado, descuento.TDS_ID)) {
            continue;
          }

          const monto = agregarDetalle(detalles, {
            monto: calcularDescuento(descuento, totalIngresos, factorPagoPeriodo),
            tds_id: descuento.TDS_ID
          });
          totalDescuento += monto;
        }

        if (igssConcepto && !tieneAsignacionDescuento(asignacionesEmpleado, igssConcepto.TDS_ID)) {
          const monto = agregarDetalle(detalles, {
            monto: roundMoney(baseDescuentosLegales * TASA_IGSS_LABORAL),
            tds_id: igssConcepto.TDS_ID
          });
          totalDescuento += monto;
        }

        if (isrConcepto && !tieneAsignacionDescuento(asignacionesEmpleado, isrConcepto.TDS_ID)) {
          const baseMensualEstimada = factorPagoPeriodo > 0
            ? baseDescuentosLegales / factorPagoPeriodo
            : baseDescuentosLegales;
          const monto = agregarDetalle(detalles, {
            monto: roundMoney(calcularISRMensual(baseMensualEstimada) * factorPagoPeriodo),
            tds_id: isrConcepto.TDS_ID
          });
          totalDescuento += monto;
        }

        if (prestamoConcepto && !tieneAsignacionDescuento(asignacionesEmpleado, prestamoConcepto.TDS_ID)) {
          for (const prestamo of prestamosPorEmpleado.get(empId) || []) {
            const monto = agregarDetalle(detalles, {
              referencia: prestamo.pre_id,
              monto: prestamo.monto,
              tds_id: prestamoConcepto.TDS_ID
            });
            totalDescuento += monto;
          }
        }

        for (const asignacion of asignacionesEmpleado.filter((item) => item.NAS_TIPO === "D")) {
          const monto = agregarDetalle(detalles, {
            referencia: asignacion.NAS_ID,
            monto: asignacion.NAS_MONTO,
            tds_id: asignacion.TDS_ID
          });
          totalDescuento += monto;
        }

        totalIngresos = roundMoney(totalIngresos);
        totalDescuento = roundMoney(totalDescuento);
        const salarioLiquido = roundMoney(totalIngresos - totalDescuento);
        const nomId = nominaExistente ? nominaExistente.nom_id : await nextNominaId(execute);
        const nominaPayload = {
          nom_id: nomId,
          total_ingresos: totalIngresos,
          total_descuento: totalDescuento,
          salario_liquido: salarioLiquido,
          fecha_generacion: fechaGeneracion,
          per_id: perId,
          emp_id: empId,
          estado
        };

        if (nominaExistente) {
          await execute(
            `
              DELETE FROM EMP_NOMINA_DETALLE
              WHERE NOM_ID = :nom_id
            `,
            { nom_id: nomId }
          );

          await execute(
            `
              UPDATE EMP_NOMINA
              SET
                NOM_TOTAL_INGRESOS = :total_ingresos,
                NOM_TOTAL_DESCUENTO = :total_descuento,
                NOM_SALARIO_LIQUIDO = :salario_liquido,
                NOM_FECHA_GENERACION = NVL(TO_DATE(:fecha_generacion, 'YYYY-MM-DD'), SYSDATE),
                NOM_ESTADO = :estado
              WHERE NOM_ID = :nom_id
            `,
            {
              nom_id: nomId,
              total_ingresos: totalIngresos,
              total_descuento: totalDescuento,
              salario_liquido: salarioLiquido,
              fecha_generacion: fechaGeneracion,
              estado
            }
          );
        } else {
          await execute(
            `
              INSERT INTO EMP_NOMINA (
                NOM_ID,
                NOM_TOTAL_INGRESOS,
                NOM_TOTAL_DESCUENTO,
                NOM_SALARIO_LIQUIDO,
                NOM_FECHA_GENERACION,
                PER_ID,
                EMP_ID,
                NOM_ESTADO
              ) VALUES (
                :nom_id,
                :total_ingresos,
                :total_descuento,
                :salario_liquido,
                NVL(TO_DATE(:fecha_generacion, 'YYYY-MM-DD'), SYSDATE),
                :per_id,
                :emp_id,
                :estado
              )
            `,
            nominaPayload
          );
        }

        for (const detalle of detalles) {
          await insertDetalle(execute, {
            nom_id: nomId,
            ...detalle
          });
        }

        generadas.push({
          nom_id: nomId,
          emp_id: empId,
          empleado: `${empleado.EMP_NOMBRE || ""} ${empleado.EMP_APELLIDO || ""}`.trim(),
          recalculada: Boolean(nominaExistente),
          dias_trabajados: diasTrabajados,
          horas_extra: horasExtra,
          total_ingresos: totalIngresos,
          total_descuento: totalDescuento,
          salario_liquido: salarioLiquido
        });
      }

      return {
        per_id: perId,
        fecha_inicio: periodo.FECHA_INICIO,
        fecha_fin: periodo.FECHA_FIN,
        total_elegibles: empleados.length,
        total_generadas: generadas.length,
        total_omitidas: omitidas.length,
        generadas,
        omitidas
      };
    });

    res.status(201).json({
      message: "Generacion de nomina finalizada",
      ...result
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error generando nominas",
      error: formatNominaError(error)
    });
  }
}

/* =======================
   OBTENER NOMINAS
======================= */
export async function getNominas(req, res) {
  try {
    const sql = `SELECT * FROM EMP_NOMINA`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo nominas",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getNominaById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM EMP_NOMINA
      WHERE NOM_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Nomina no encontrada"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo nomina",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createNomina(req, res) {
  try {
    const {
      total_ingresos,
      total_descuento,
      salario_liquido,
      per_id,
      emp_id
    } = req.body;

    const sql = `
      INSERT INTO EMP_NOMINA (
        NOM_ID,
        NOM_TOTAL_INGRESOS,
        NOM_TOTAL_DESCUENTO,
        NOM_SALARIO_LIQUIDO,
        NOM_FECHA_GENERACION,
        PER_ID,
        EMP_ID,
        NOM_ESTADO
      ) VALUES (
        EMP_NOMINA_SEQ.NEXTVAL,
        :total_ingresos,
        :total_descuento,
        :salario_liquido,
        SYSDATE,
        :per_id,
        :emp_id,
        'A'
      )
    `;

    await executeQuery(sql, {
      total_ingresos,
      total_descuento,
      salario_liquido,
      per_id,
      emp_id
    });

    res.status(201).json({
      message: "Nomina creada correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando nomina",
      error: formatNominaError(error)
    });
  }
}

/* =======================
   ACTUALIZAR NOMINA
======================= */
export async function updateNomina(req, res) {
  try {
    const { id } = req.params;
    const nomId = Number(id);
    const {
      total_ingresos,
      total_descuento,
      salario_liquido,
      per_id,
      emp_id,
      estado
    } = req.body;

    const result = await executeTransaction(async ({ execute }) => {
      const estadoAnteriorResult = await execute(
        `
          SELECT NOM_ESTADO
          FROM EMP_NOMINA
          WHERE NOM_ID = :id
        `,
        { id: nomId }
      );

      if (estadoAnteriorResult.rows.length === 0) {
        return { rowsAffected: 0 };
      }

      const estadoAnterior = String(estadoAnteriorResult.rows[0].NOM_ESTADO || "").toUpperCase();
      const estadoNuevo = String(estado || "").toUpperCase();
      const updateResult = await execute(
        `
          UPDATE EMP_NOMINA
          SET
            NOM_TOTAL_INGRESOS = :total_ingresos,
            NOM_TOTAL_DESCUENTO = :total_descuento,
            NOM_SALARIO_LIQUIDO = :salario_liquido,
            PER_ID = :per_id,
            EMP_ID = :emp_id,
            NOM_ESTADO = :estado
          WHERE NOM_ID = :id
        `,
        {
          id: nomId,
          total_ingresos,
          total_descuento,
          salario_liquido,
          per_id,
          emp_id,
          estado
        }
      );

      if (estadoAnterior !== "A" && estadoNuevo === "A") {
        await aplicarPagosPrestamoPorNomina(execute, nomId);
      }

      return updateResult;
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Nomina no encontrada"
      });
    }

    res.json({ message: "Nomina actualizada correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando nomina",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteNomina(req, res) {
  try {
    const { id } = req.params;
    const nomId = Number(id);

    if (!Number.isInteger(nomId) || nomId <= 0) {
      return res.status(400).json({ message: "El ID de nomina debe ser valido" });
    }

    const result = await executeTransaction(async ({ execute }) => {
      const estadoResult = await execute(
        `
          SELECT NOM_ESTADO
          FROM EMP_NOMINA
          WHERE NOM_ID = :id
        `,
        { id: nomId }
      );

      if (estadoResult.rows.length === 0) {
        return { rowsAffected: 0 };
      }

      const estado = String(estadoResult.rows[0].NOM_ESTADO || "").toUpperCase();
      if (["P", "A"].includes(estado)) {
        throw new HttpError(400, "No se puede eliminar una nomina pendiente o aprobada");
      }

      await execute(
        `
          DELETE FROM EMP_NOMINA_DETALLE
          WHERE NOM_ID = :id
        `,
        { id: nomId }
      );

      return execute(
        `
          DELETE FROM EMP_NOMINA
          WHERE NOM_ID = :id
        `,
        { id: nomId }
      );
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Nomina no encontrada"
      });
    }

    res.json({
      message: "Nomina eliminada correctamente"
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error eliminando nomina",
      error: error.message
    });
  }
}
