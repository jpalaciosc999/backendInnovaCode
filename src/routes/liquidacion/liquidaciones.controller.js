import { executeQuery, executeTransaction } from "../../config/db.js";

const VACACIONES_POR_ANIO = 15;

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getRequestEmpId(body = {}) {
  const value = body.emp_id
    ?? body.empleado_id
    ?? body.id_empleado
    ?? body.empleadoId
    ?? body.empId
    ?? body.EMP_ID
    ?? body.EMPLEADO_ID
    ?? body.ID_EMPLEADO;

  const empId = Number(value);
  return Number.isInteger(empId) && empId > 0 ? empId : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const gtMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (gtMatch) {
    return `${gtMatch[3]}-${gtMatch[2]}-${gtMatch[1]}`;
  }

  return null;
}

function addYears(date, years) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function formatDateIso(date) {
  return date.toISOString().slice(0, 10);
}

function getDateParts(value) {
  const iso = normalizeDate(value);
  if (!iso) {
    return null;
  }

  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function diffDaysInclusive(start, end) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function daysSinceCycleStart(fechaSalida, startMonth, startDay) {
  const year = fechaSalida.getUTCFullYear();
  let start = new Date(Date.UTC(year, startMonth - 1, startDay));
  if (fechaSalida < start) {
    start = new Date(Date.UTC(year - 1, startMonth - 1, startDay));
  }

  return Math.max(0, diffDaysInclusive(start, fechaSalida));
}

function shouldPayIndemnizacion(tipoRetiro) {
  const tipo = String(tipoRetiro || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  return tipo.includes("DESPIDO") || tipo.includes("MUTUO");
}

async function hasColumn(execute, tableName, columnName) {
  const result = await execute(
    `
      SELECT COUNT(*) AS TOTAL
      FROM USER_TAB_COLUMNS
      WHERE TABLE_NAME = :table_name
        AND COLUMN_NAME = :column_name
    `,
    {
      table_name: tableName,
      column_name: columnName
    }
  );

  return Number(result.rows[0]?.TOTAL || 0) > 0;
}

async function getLiquidacionColumns(execute) {
  const fechaEliminacion = await hasColumn(execute, "EMP_LIQUIDACIONES", "LIQ_FECHA_ELIMINACION");
  const estadoRetencion = await hasColumn(execute, "EMP_LIQUIDACIONES", "LIQ_ESTADO_RETENCION");

  return { fechaEliminacion, estadoRetencion };
}

async function ensureEmpleadoExists(execute, empId) {
  const empleadoResult = await execute(
    `
      SELECT COUNT(*) AS TOTAL
      FROM EMP_EMPLEADO
      WHERE EMP_ID = :empId
    `,
    { empId }
  );

  const total = Number(empleadoResult.rows[0]?.TOTAL || 0);
  console.log("LIQ EMP COUNT:", { empId, total });

  if (total === 0) {
    throw new Error(`Empleado no existe para liquidaci\u00f3n: EMP_ID ${empId}`);
  }
}

async function getLiqEmpFkInfo(execute) {
  const result = await execute(
    `
      SELECT ac.owner,
             ac.constraint_name,
             acc.table_name,
             acc.column_name,
             pk.owner AS referenced_owner,
             pk.table_name AS referenced_table,
             pkc.column_name AS referenced_column
      FROM all_constraints ac
      JOIN all_cons_columns acc
        ON ac.owner = acc.owner
       AND ac.constraint_name = acc.constraint_name
      JOIN all_constraints pk
        ON ac.r_owner = pk.owner
       AND ac.r_constraint_name = pk.constraint_name
      JOIN all_cons_columns pkc
        ON pk.owner = pkc.owner
       AND pk.constraint_name = pkc.constraint_name
      WHERE ac.constraint_name = 'FK_LIQ_EMP'
    `
  );

  return result.rows;
}

async function calcularLiquidacionData(execute, body) {
  const { fecha_retiro, tipo_retiro } = body || {};
  const empId = getRequestEmpId(body);
  const fechaSalidaIso = normalizeDate(fecha_retiro);
  const fechaSalida = getDateParts(fechaSalidaIso);

  if (!empId) {
    throw new Error("El empleado es obligatorio");
  }

  if (!fechaSalida) {
    throw new Error("La fecha de salida es obligatoria y debe tener formato YYYY-MM-DD");
  }

  if (!String(tipo_retiro || "").trim()) {
    throw new Error("El tipo de retiro es obligatorio");
  }

  const empleadoResult = await execute(
    `
      SELECT
        e.EMP_ID,
        e.EMP_NOMBRE,
        e.EMP_APELLIDO,
        TO_CHAR(NVL(ec.TCO_FECHA_INICIO, e.EMP_FECHA_CONTRATACION), 'YYYY-MM-DD') AS FECHA_INICIO,
        NVL(p.PUE_SALARIO_BASE, 0) AS SALARIO_BASE
      FROM EMP_EMPLEADO e
      LEFT JOIN EMP_PUESTO p ON p.PUE_ID = e.PUE_ID
      LEFT JOIN EMP_EMPLEADO_CONTRATO ec
        ON ec.EMP_ID = e.EMP_ID
       AND ec.TCO_ES_ACTUAL = 1
      WHERE e.EMP_ID = :emp_id
    `,
    { emp_id: empId }
  );

  if (empleadoResult.rows.length === 0) {
    throw new Error(`Empleado no existe para liquidaci\u00f3n: EMP_ID ${empId}`);
  }

  const empleado = empleadoResult.rows[0];
  const fechaInicio = getDateParts(empleado.FECHA_INICIO);
  const salarioBase = toNumber(empleado.SALARIO_BASE);

  if (!fechaInicio) {
    throw new Error("El empleado no tiene fecha de contratacion o contrato vigente");
  }

  if (fechaSalida < fechaInicio) {
    throw new Error("La fecha de salida no puede ser anterior al inicio laboral del empleado");
  }

  if (salarioBase <= 0) {
    throw new Error("El empleado no tiene salario base configurado en su puesto");
  }

  const vacacionesTomadasResult = await execute(
    `
      SELECT NVL(SUM(TRUNC(NVL(CTL_FECHA_REGRESO, CTL_FECHA_INICIO)) - TRUNC(CTL_FECHA_INICIO) + 1), 0) AS DIAS
      FROM EMP_CONTROL_LABORAL
      WHERE EMP_ID = :emp_id
        AND UPPER(NVL(CTL_MOTIVO, '')) LIKE '%VAC%'
        AND NVL(CTL_ESTADO, 'A') <> 'R'
        AND TRUNC(CTL_FECHA_INICIO) BETWEEN TO_DATE(:fecha_inicio, 'YYYY-MM-DD')
                                      AND TO_DATE(:fecha_salida, 'YYYY-MM-DD')
    `,
    {
      emp_id: empId,
      fecha_inicio: empleado.FECHA_INICIO,
      fecha_salida: fechaSalidaIso
    }
  );

  const diasTrabajado = Math.max(0, diffDaysInclusive(fechaInicio, fechaSalida));
  const salarioDiario = salarioBase / 30;
  const vacacionesGeneradas = (diasTrabajado * VACACIONES_POR_ANIO) / 365;
  const vacacionesPendientes = Math.max(0, vacacionesGeneradas - toNumber(vacacionesTomadasResult.rows[0]?.DIAS));
  const diasAguinaldo = Math.min(365, daysSinceCycleStart(fechaSalida, 12, 1));
  const diasBono14 = Math.min(365, daysSinceCycleStart(fechaSalida, 7, 1));

  const indemnizacion = shouldPayIndemnizacion(tipo_retiro)
    ? roundMoney((salarioBase * diasTrabajado) / 365)
    : 0;
  const vacacionesPagadas = roundMoney(vacacionesPendientes * salarioDiario);
  const aguinaldoProporcional = roundMoney((salarioBase * diasAguinaldo) / 365);
  const bono14Proporcional = roundMoney((salarioBase * diasBono14) / 365);
  const liquidacion = roundMoney(
    indemnizacion + vacacionesPagadas + aguinaldoProporcional + bono14Proporcional
  );

  return {
    emp_id: empId,
    empleado: `${empleado.EMP_NOMBRE || ""} ${empleado.EMP_APELLIDO || ""}`.trim(),
    fecha_retiro: fechaSalidaIso,
    tipo_retiro,
    fecha_inicio: empleado.FECHA_INICIO,
    salario_base: roundMoney(salarioBase),
    dias_trabajado: diasTrabajado,
    vacaciones_generadas: roundMoney(vacacionesGeneradas),
    vacaciones_tomadas: roundMoney(vacacionesTomadasResult.rows[0]?.DIAS || 0),
    vacaciones_pendientes: roundMoney(vacacionesPendientes),
    dias_aguinaldo: diasAguinaldo,
    dias_bono14: diasBono14,
    indemnizacion,
    vacaciones_pagadas: vacacionesPagadas,
    aguinaldo_proporcional: aguinaldoProporcional,
    bono14_proporcional: bono14Proporcional,
    liquidacion,
    fecha_eliminacion: formatDateIso(addMonths(fechaSalida, 3))
  };
}

async function marcarEmpleadoLiquidado(execute, empId, fechaSalida) {
  await execute(
    `
      UPDATE EMP_EMPLEADO
      SET EMP_ESTADO = 'L'
      WHERE EMP_ID = :emp_id
    `,
    { emp_id: empId }
  );

  await execute(
    `
      UPDATE EMP_EMPLEADO_CONTRATO
      SET
        TCO_FECHA_FIN = TO_DATE(:fecha_salida, 'YYYY-MM-DD'),
        TCO_ESTADO = 'I',
        TCO_ES_ACTUAL = 0,
        TCO_MOTIVO_CAMBIO = 'Liquidacion'
      WHERE EMP_ID = :emp_id
        AND TCO_ES_ACTUAL = 1
    `,
    {
      emp_id: empId,
      fecha_salida: fechaSalida
    }
  );
}

function getSelectLiquidacionesSql(columns) {
  return `
    SELECT
      l.*,
      e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS EMPLEADO,
      ${columns.fechaEliminacion ? "TO_CHAR(l.LIQ_FECHA_ELIMINACION, 'YYYY-MM-DD')" : "NULL"} AS LIQ_FECHA_ELIMINACION_TXT,
      ${columns.estadoRetencion ? "l.LIQ_ESTADO_RETENCION" : "'RETENIDA'"} AS LIQ_ESTADO_RETENCION_TXT
    FROM EMP_LIQUIDACIONES l
    LEFT JOIN EMP_EMPLEADO e ON e.EMP_ID = l.EMP_ID
  `;
}

export async function getLiquidaciones(req, res) {
  try {
    const columns = await getLiquidacionColumns(executeQuery);
    const result = await executeQuery(`${getSelectLiquidacionesSql(columns)} ORDER BY l.LIQ_ID DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo liquidaciones",
      error: error.message
    });
  }
}

export async function getLiquidacionById(req, res) {
  try {
    const { id } = req.params;
    const columns = await getLiquidacionColumns(executeQuery);
    const result = await executeQuery(`${getSelectLiquidacionesSql(columns)} WHERE l.LIQ_ID = :id`, {
      id: Number(id)
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Liquidacion no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo liquidacion",
      error: error.message
    });
  }
}

export async function calcularLiquidacion(req, res) {
  try {
    const data = await executeTransaction(async ({ execute }) => {
      return calcularLiquidacionData(execute, req.body);
    });
    res.json(data);
  } catch (error) {
    res.status(400).json({
      message: "Error calculando liquidacion",
      error: error.message
    });
  }
}

export async function createLiquidacion(req, res) {
  try {
    console.log("BODY LIQUIDACION:", req.body);
    const receivedEmpId = Number(req.body?.emp_id ?? req.body?.empleado_id ?? req.body?.EMP_ID);
    console.log("LIQ EMP_ID DIRECTO:", receivedEmpId);

    const result = await executeTransaction(async ({ execute }) => {
      const columns = await getLiquidacionColumns(execute);
      const calculo = await calcularLiquidacionData(execute, req.body);
      console.log("LIQ EMP_ID NORMALIZADO:", calculo.emp_id);
      await ensureEmpleadoExists(execute, calculo.emp_id);
      const fkInfo = await getLiqEmpFkInfo(execute);
      console.log("FK_LIQ_EMP INFO:", fkInfo);
      const fechaRegistro = normalizeDate(req.body.fecha_registro) || calculo.fecha_retiro;
      const fechaEliminacionSql = columns.fechaEliminacion
        ? ", LIQ_FECHA_ELIMINACION"
        : "";
      const fechaEliminacionValue = columns.fechaEliminacion
        ? ", ADD_MONTHS(TO_DATE(:fecha_retiro, 'YYYY-MM-DD'), 3)"
        : "";
      const estadoRetencionSql = columns.estadoRetencion
        ? ", LIQ_ESTADO_RETENCION"
        : "";
      const estadoRetencionValue = columns.estadoRetencion
        ? ", 'RETENIDA'"
        : "";
      const insertBinds = {
        fecha_retiro: calculo.fecha_retiro,
        tipo_retiro: calculo.tipo_retiro,
        dias_trabajado: calculo.dias_trabajado,
        indemnizacion: calculo.indemnizacion,
        vacaciones_pagadas: calculo.vacaciones_pagadas,
        aguinaldo_proporcional: calculo.aguinaldo_proporcional,
        bono14_proporcional: calculo.bono14_proporcional,
        liquidacion: calculo.liquidacion,
        fecha_registro: fechaRegistro,
        emp_id: calculo.emp_id
      };

      console.log("LIQ INSERT EMP_ID BIND:", insertBinds.emp_id);

      await execute(
        `
          INSERT INTO EMP_LIQUIDACIONES (
            LIQ_ID,
            LIQ_FECHA_SALIDA,
            LIQ_TIPO_RETIRO,
            LIQ_DIAS_TRABAJADO,
            LIQ_INDEMNIZACION,
            LIQ_VACACIONES_PAGADAS,
            LIQ_AGUINALDO_PROPORCIONAL,
            LIQ_BONO14_PROPORCIONAL,
            LIQ_LIQUIDACION,
            LIQ_FECHA_REGISTRO,
            EMP_ID
            ${fechaEliminacionSql}
            ${estadoRetencionSql}
          ) VALUES (
            SEQ_LIQUIDACION.NEXTVAL,
            TO_DATE(:fecha_retiro, 'YYYY-MM-DD'),
            :tipo_retiro,
            :dias_trabajado,
            :indemnizacion,
            :vacaciones_pagadas,
            :aguinaldo_proporcional,
            :bono14_proporcional,
            :liquidacion,
            TO_DATE(:fecha_registro, 'YYYY-MM-DD'),
            :emp_id
            ${fechaEliminacionValue}
            ${estadoRetencionValue}
          )
        `,
        insertBinds
      );

      await marcarEmpleadoLiquidado(execute, calculo.emp_id, calculo.fecha_retiro);
      return calculo;
    });

    res.status(201).json({
      message: "Liquidacion creada correctamente. El empleado queda liquidado y retenido por 3 meses.",
      calculo: result
    });
  } catch (error) {
    if (error.message?.startsWith("Empleado no existe para liquidaci\u00f3n")) {
      return res.status(400).json({ message: error.message });
    }

    res.status(400).json({
      message: "Error creando liquidacion",
      error: error.message
    });
  }
}

export async function updateLiquidacion(req, res) {
  try {
    const { id } = req.params;
    const result = await executeTransaction(async ({ execute }) => {
      const columns = await getLiquidacionColumns(execute);
      const calculo = await calcularLiquidacionData(execute, req.body);
      const fechaRegistro = normalizeDate(req.body.fecha_registro) || calculo.fecha_retiro;
      const fechaEliminacionUpdate = columns.fechaEliminacion
        ? ", LIQ_FECHA_ELIMINACION = ADD_MONTHS(TO_DATE(:fecha_retiro, 'YYYY-MM-DD'), 3)"
        : "";
      const estadoRetencionUpdate = columns.estadoRetencion
        ? ", LIQ_ESTADO_RETENCION = 'RETENIDA'"
        : "";
      const updateResult = await execute(
        `
          UPDATE EMP_LIQUIDACIONES
          SET
            LIQ_FECHA_SALIDA = TO_DATE(:fecha_retiro, 'YYYY-MM-DD'),
            LIQ_TIPO_RETIRO = :tipo_retiro,
            LIQ_DIAS_TRABAJADO = :dias_trabajado,
            LIQ_INDEMNIZACION = :indemnizacion,
            LIQ_VACACIONES_PAGADAS = :vacaciones_pagadas,
            LIQ_AGUINALDO_PROPORCIONAL = :aguinaldo_proporcional,
            LIQ_BONO14_PROPORCIONAL = :bono14_proporcional,
            LIQ_LIQUIDACION = :liquidacion,
            LIQ_FECHA_REGISTRO = TO_DATE(:fecha_registro, 'YYYY-MM-DD'),
            EMP_ID = :emp_id
            ${fechaEliminacionUpdate}
            ${estadoRetencionUpdate}
          WHERE LIQ_ID = :id
        `,
        {
          id: Number(id),
          fecha_retiro: calculo.fecha_retiro,
          tipo_retiro: calculo.tipo_retiro,
          dias_trabajado: calculo.dias_trabajado,
          indemnizacion: calculo.indemnizacion,
          vacaciones_pagadas: calculo.vacaciones_pagadas,
          aguinaldo_proporcional: calculo.aguinaldo_proporcional,
          bono14_proporcional: calculo.bono14_proporcional,
          liquidacion: calculo.liquidacion,
          fecha_registro: fechaRegistro,
          emp_id: calculo.emp_id
        }
      );

      if (updateResult.rowsAffected > 0) {
        await marcarEmpleadoLiquidado(execute, calculo.emp_id, calculo.fecha_retiro);
      }

      return updateResult;
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Liquidacion no encontrada" });
    }

    res.json({ message: "Liquidacion actualizada correctamente" });
  } catch (error) {
    res.status(400).json({
      message: "Error actualizando liquidacion",
      error: error.message
    });
  }
}

export async function deleteLiquidacion(req, res) {
  try {
    const { id } = req.params;
    const result = await executeQuery(
      `
        DELETE FROM EMP_LIQUIDACIONES
        WHERE LIQ_ID = :id
      `,
      { id: Number(id) }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Liquidacion no encontrada" });
    }

    res.json({ message: "Liquidacion eliminada correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando liquidacion",
      error: error.message
    });
  }
}
