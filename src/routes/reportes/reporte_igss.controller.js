import PDFDocument from "pdfkit";
import { executeQuery } from "../../config/db.js";

const PATRONAL_RATE = 0.1267;
const LABORAL_RATE  = 0.0483;

// ─────────────────────────────────────────────────────────────────────────────
// Query builder interno
// ─────────────────────────────────────────────────────────────────────────────

function buildIgssQuery(params) {
  const { periodoId, departamentoId } = params;

  const conditions = [];
  const binds = {};

  if (periodoId) {
    conditions.push("N.PER_ID = :periodoId");
    binds.periodoId = Number(periodoId);
  }

  if (departamentoId) {
    conditions.push("E.DEP_ID = :departamentoId");
    binds.departamentoId = Number(departamentoId);
  }

  const whereClause = conditions.length > 0
    ? "WHERE " + conditions.join(" AND ")
    : "";

  const sql = `
    SELECT
      E.EMP_ID,
      E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO                              AS EMPLEADO,
      NVL(E.EMP_DPI, '')                                                  AS EMP_DPI,
      NVL(E.EMP_NIT, '')                                                  AS EMP_NIT,
      NVL(E.EMP_TELEFONO, '')                                             AS EMP_TELEFONO,
      UPPER(SUBSTR(E.EMP_NOMBRE, 1, 1)
            || SUBSTR(E.EMP_APELLIDO, 1, 1))                             AS INICIALES,
      PUE.PUE_NOMBRE                                                      AS PUESTO,
      COALESCE(PUE.PUE_SALARIO_BASE, 0)                                  AS SALARIO_BASE_MENSUAL,
      COALESCE(N.NOM_TOTAL_INGRESOS, 0)                                   AS SALARIO_NOMINA,
      D.DEP_ID,
      D.DEP_NOMBRE                                                        AS DEPARTAMENTO,
      NVL(S.SED_NOMBRE, '')                                               AS SEDE,
      NVL(S.SED_TELEFONO, '')                                             AS SEDE_TELEFONO,
      NVL(S.SED_DEPARTAMENTO, '')                                         AS SEDE_DEPARTAMENTO,
      NVL(S.SED_MUNICIPIO, '')                                            AS SEDE_MUNICIPIO,
      NVL(S.SED_ZONA, '')                                                 AS SEDE_ZONA,
      N.NOM_ID,
      N.NOM_ESTADO                                                        AS ESTADO,
      PER.PER_ID,
      TO_CHAR(PER.PER_FECHA_INICIO, 'YYYY-MM-DD')                        AS PERIODO_INICIO,
      TO_CHAR(PER.PER_FECHA_FIN,   'YYYY-MM-DD')                         AS PERIODO_FIN,
      TRUNC(PER.PER_FECHA_FIN) - TRUNC(PER.PER_FECHA_INICIO) + 1          AS DIAS_PERIODO,
      (
        SELECT NVL(SUM(
          GREATEST(
            0,
            LEAST(TRUNC(SUS.SUS_FECHA_FIN), TRUNC(PER.PER_FECHA_FIN))
            - GREATEST(TRUNC(SUS.SUS_FECHA_INICIO), TRUNC(PER.PER_FECHA_INICIO))
            + 1
          )
        ), 0)
        FROM EMP_SUSPENSION_IGSS SUS
        WHERE SUS.EMP_ID = E.EMP_ID
          AND SUS.SUS_ESTADO = 'A'
          AND TRUNC(SUS.SUS_FECHA_INICIO) <= TRUNC(PER.PER_FECHA_FIN)
          AND TRUNC(SUS.SUS_FECHA_FIN) >= TRUNC(PER.PER_FECHA_INICIO)
      )                                                                   AS DIAS_SUSPENDIDOS,
      TO_CHAR(
        ADD_MONTHS(TRUNC(PER.PER_FECHA_FIN, 'MM'), 1) + 19,
        'DD/MM/YYYY'
      )                                                                   AS FECHA_LIMITE_PAGO
    FROM EMP_NOMINA N
    JOIN      EMP_EMPLEADO     E   ON E.EMP_ID   = N.EMP_ID
    LEFT JOIN EMP_PUESTO       PUE ON PUE.PUE_ID = E.PUE_ID
    JOIN      EMP_DEPARTAMENTO D   ON D.DEP_ID   = E.DEP_ID
    LEFT JOIN EMP_SEDE         S   ON S.SED_ID   = E.SED_ID
    JOIN      EMP_PERIODO      PER ON PER.PER_ID = N.PER_ID
    ${whereClause}
    ORDER BY D.DEP_NOMBRE, E.EMP_APELLIDO, E.EMP_NOMBRE
  `;

  return { sql, binds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de agregación
// ─────────────────────────────────────────────────────────────────────────────

function computeTotals(rows) {
  let totalSalarioBase = 0;
  let totalPatronal    = 0;
  let totalLaboral     = 0;
  let totalIgss        = 0;

  for (const r of rows) {
    totalSalarioBase += Number(r.SALARIO_BASE ?? 0);
    totalPatronal    += Number(r.PATRONAL     ?? 0);
    totalLaboral     += Number(r.LABORAL      ?? 0);
    totalIgss        += Number(r.TOTAL_IGSS   ?? 0);
  }

  return {
    totalSalarioBase: round2(totalSalarioBase),
    totalPatronal:    round2(totalPatronal),
    totalLaboral:     round2(totalLaboral),
    totalIgss:        round2(totalIgss)
  };
}

function computeByDepartamento(rows) {
  const deptMap = {};

  for (const r of rows) {
    const key = r.DEP_ID;
    if (!deptMap[key]) {
      deptMap[key] = {
        depId:        r.DEP_ID,
        departamento: r.DEPARTAMENTO,
        salarioBase:  0,
        patronal:     0,
        laboral:      0,
        totalIgss:    0
      };
    }
    deptMap[key].salarioBase += Number(r.SALARIO_BASE ?? 0);
    deptMap[key].patronal    += Number(r.PATRONAL     ?? 0);
    deptMap[key].laboral     += Number(r.LABORAL      ?? 0);
    deptMap[key].totalIgss   += Number(r.TOTAL_IGSS   ?? 0);
  }

  return Object.values(deptMap).map(d => ({
    ...d,
    salarioBase: round2(d.salarioBase),
    patronal:    round2(d.patronal),
    laboral:     round2(d.laboral),
    totalIgss:   round2(d.totalIgss)
  }));
}

function round2(n) {
  return Math.round(toNumber(n) * 100) / 100;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFilter(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function estadoNominaLabel(value) {
  const estado = normalizeFilter(value);
  if (estado === "A") return "Aprobado";
  if (estado === "P") return "Pendiente";
  if (estado === "B") return "Borrador";
  return cleanText(value);
}

function estadoCoincide(row, filtro) {
  const estadoNomina = normalizeFilter(row.ESTADO_NOMINA);
  const labelNomina = normalizeFilter(estadoNominaLabel(row.ESTADO_NOMINA));
  const estadoCalculado = normalizeFilter(row.ESTADO_CALCULADO);

  return estadoNomina === filtro
    || labelNomina === filtro
    || estadoCalculado === filtro;
}

function getPeriodoPagoFactor(diasPeriodo) {
  const dias = toNumber(diasPeriodo);
  if (dias >= 14 && dias <= 16) return 0.5;
  if (dias >= 28 && dias <= 31) return 1;
  return dias > 0 ? Math.min(dias / 30, 1) : 0;
}

function buildIgssRows(rawRows, estadoFiltro = null) {
  const filtro = normalizeFilter(estadoFiltro);

  return rawRows
    .map((r) => {
      const diasPeriodo = Math.max(0, toNumber(r.DIAS_PERIODO));
      const diasSuspendidos = Math.min(diasPeriodo, Math.max(0, toNumber(r.DIAS_SUSPENDIDOS)));
      const diasTrabajados = Math.max(0, diasPeriodo - diasSuspendidos);
      const salarioMensual = toNumber(r.SALARIO_BASE_MENSUAL);
      const factorPago = getPeriodoPagoFactor(diasPeriodo);
      const salarioBase = diasPeriodo > 0
        ? round2(salarioMensual * factorPago * (diasTrabajados / diasPeriodo))
        : 0;
      const patronal = round2(salarioBase * PATRONAL_RATE);
      const laboral = round2(salarioBase * LABORAL_RATE);
      const totalIgss = round2(patronal + laboral);
      const estadoCalculado = diasTrabajados <= 0
        ? "Suspendido"
        : diasSuspendidos > 0
          ? "Con suspension"
          : "Completo";

      return {
        ...r,
        DIAS_PERIODO: diasPeriodo,
        DIAS_SUSPENDIDOS: diasSuspendidos,
        DIAS_TRABAJADOS: diasTrabajados,
        SALARIO_BASE_MENSUAL: round2(salarioMensual),
        SALARIO_BASE: salarioBase,
        PATRONAL: patronal,
        LABORAL: laboral,
        TOTAL_IGSS: totalIgss,
        ESTADO_NOMINA: r.ESTADO,
        ESTADO_CALCULADO: estadoCalculado
      };
    })
    .filter((r) => {
      if (!filtro || filtro === "TODOS") return true;
      return estadoCoincide(r, filtro);
    });
}

function fmt(n) {
  return Number(n).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function getPeriodoParts(fechaInicio) {
  if (!fechaInicio) {
    return { mes: "", anio: "" };
  }

  const [year, month] = String(fechaInicio).slice(0, 10).split("-");
  const mes = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("es-GT", {
    month: "long"
  });

  return {
    mes: mes.charAt(0).toUpperCase() + mes.slice(1),
    anio: year
  };
}

function getEmployerInfo(req, rows) {
  const first = rows[0] ?? {};
  const sedeAddress = [
    first.SEDE_ZONA ? `Zona ${first.SEDE_ZONA}` : "",
    first.SEDE_MUNICIPIO,
    first.SEDE_DEPARTAMENTO
  ].filter(Boolean).join(", ");

  return {
    nombre: cleanText(req.query.patronoNombre || process.env.IGSS_PATRONO_NOMBRE, "InnovaTech"),
    nit: cleanText(req.query.patronoNit || process.env.IGSS_PATRONO_NIT),
    numeroPatronal: cleanText(req.query.numeroPatronal || process.env.IGSS_NUMERO_PATRONAL),
    direccionEmpresa: cleanText(req.query.direccionEmpresa || process.env.IGSS_DIRECCION_EMPRESA || sedeAddress),
    direccionPatrono: cleanText(req.query.direccionPatrono || process.env.IGSS_DIRECCION_PATRONO || sedeAddress),
    telefono: cleanText(req.query.telefono || process.env.IGSS_TELEFONO || first.SEDE_TELEFONO),
    apartadoPostal: cleanText(req.query.apartadoPostal || process.env.IGSS_APARTADO_POSTAL),
    numeroRecibo: cleanText(req.query.numeroRecibo || req.query.recibo || process.env.IGSS_NUMERO_RECIBO),
    hojaNo: cleanText(req.query.hojaNo || "1")
  };
}

function formatPeriodoLabel(fechaInicioStr) {
  if (!fechaInicioStr) return "";
  const [y, m] = fechaInicioStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-GT", {
    month: "long",
    year: "numeric"
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/igss/periodos
// Lista de períodos con nóminas generadas (para el selector del frontend)
// ─────────────────────────────────────────────────────────────────────────────
export async function getIgssPeriodos(req, res) {
  try {
    // Wrapped in subquery to avoid ORA-01791 (DISTINCT + ORDER BY on non-SELECT column)
    const sql = `
      SELECT PER_ID, PERIODO_INICIO, PERIODO_FIN
      FROM (
        SELECT DISTINCT
          PER.PER_ID,
          TO_CHAR(PER.PER_FECHA_INICIO, 'YYYY-MM-DD') AS PERIODO_INICIO,
          TO_CHAR(PER.PER_FECHA_FIN,   'YYYY-MM-DD')  AS PERIODO_FIN
        FROM EMP_PERIODO PER
        JOIN EMP_NOMINA  N ON N.PER_ID = PER.PER_ID
      )
      ORDER BY PERIODO_INICIO DESC
    `;

    const result = await executeQuery(sql);

    // Build human-readable label in JS (avoids Oracle NLS dependency)
    const rows = result.rows.map(r => ({
      ...r,
      PERIODO_NOMBRE: formatPeriodoLabel(r.PERIODO_INICIO)
    }));

    res.json(rows);
  } catch (error) {
    console.error("Error en getIgssPeriodos:", error);
    res.status(500).json({
      message: "Error obteniendo períodos IGSS",
      error: error.message
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/igss/reporte
// Datos JSON del reporte IGSS patronal (12.67%) + laboral (4.83%)
// Query params: periodoId, departamentoId, estado
// ─────────────────────────────────────────────────────────────────────────────
export async function getIgssReporte(req, res) {
  try {
    const { periodoId, departamentoId, estado } = req.query;

    const { sql, binds } = buildIgssQuery({ periodoId, departamentoId });
    const result = await executeQuery(sql, binds);
    const rows   = buildIgssRows(result.rows, estado);

    if (rows.length === 0) {
      return res.json({
        empleados:       [],
        totales:         { totalSalarioBase: 0, totalPatronal: 0, totalLaboral: 0, totalIgss: 0 },
        porDepartamento: [],
        resumen:         null
      });
    }

    const totales         = computeTotals(rows);
    const porDepartamento = computeByDepartamento(rows);

    const firstRow = rows[0];
    const resumen = {
      baseImponible:   totales.totalSalarioBase,
      patronal:        totales.totalPatronal,
      laboral:         totales.totalLaboral,
      totalIgss:       totales.totalIgss,
      fechaLimitePago: firstRow.FECHA_LIMITE_PAGO,
      periodoInicio:   firstRow.PERIODO_INICIO,
      periodoFin:      firstRow.PERIODO_FIN,
      estado: rows.every(r => r.ESTADO_CALCULADO === firstRow.ESTADO_CALCULADO)
        ? firstRow.ESTADO_CALCULADO
        : "Mixto"
    };

    const empleados = rows.map(r => ({
      empId:        r.EMP_ID,
      empleado:     r.EMPLEADO,
      dpi:          r.EMP_DPI,
      nit:          r.EMP_NIT,
      iniciales:    r.INICIALES,
      puesto:       r.PUESTO,
      diasPeriodo:  Number(r.DIAS_PERIODO ?? 0),
      diasSuspendidos: Number(r.DIAS_SUSPENDIDOS ?? 0),
      diasTrabajados: Number(r.DIAS_TRABAJADOS ?? 0),
      salarioBaseMensual: Number(r.SALARIO_BASE_MENSUAL ?? 0),
      salarioBase:  Number(r.SALARIO_BASE ?? 0),
      patronal:     Number(r.PATRONAL     ?? 0),
      laboral:      Number(r.LABORAL      ?? 0),
      totalIgss:    Number(r.TOTAL_IGSS   ?? 0),
      departamento: r.DEPARTAMENTO,
      depId:        r.DEP_ID,
      nomId:        r.NOM_ID,
      estado:       r.ESTADO_CALCULADO,
      estadoNomina: r.ESTADO_NOMINA,
      estadoNominaLabel: estadoNominaLabel(r.ESTADO_NOMINA)
    }));

    res.json({ empleados, totales, porDepartamento, resumen });
  } catch (error) {
    console.error("Error en getIgssReporte:", error);
    res.status(500).json({
      message: "Error generando reporte IGSS",
      error: error.message
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/igss/reporte/pdf
// Descarga el reporte IGSS en formato PDF (listo para presentar al IGSS)
// Query params: periodoId, departamentoId, estado
// ─────────────────────────────────────────────────────────────────────────────
function sendIgssPlanillaPdf(req, res, rows, totales, firstRow, periodoLabel) {
  const doc = new PDFDocument({ margin: 14, size: "A4", layout: "landscape" });
  const safePeriodo = cleanText(periodoLabel, "igss").replace(/\s+/g, "_");
  const employer = getEmployerInfo(req, rows);
  const periodo = getPeriodoParts(firstRow.PERIODO_INICIO);
  const departamentos = [...new Set(rows.map(r => cleanText(r.DEPARTAMENTO)).filter(Boolean))].join(", ");
  const sourceRows = rows.length ? rows : [{}];
  const pages = [];

  for (let i = 0; i < sourceRows.length; i += 16) {
    pages.push(sourceRows.slice(i, i + 16));
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="planilla_igss_${safePeriodo}.pdf"`);
  doc.pipe(res);

  const LEFT = 16;
  const TOP = 14;
  const WIDTH = doc.page.width - LEFT * 2;
  const BLACK = "#000000";
  const GRAY = "#f3f4f6";
  const PEACH = "#f5c99b";

  const text = (value, x, y, w, h, opts = {}) => {
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.size ?? 6)
      .fillColor(BLACK)
      .text(cleanText(value), x + 2, y + 2, {
        width: Math.max(w - 4, 1),
        height: Math.max(h - 3, 1),
        align: opts.align ?? "left",
        ellipsis: true
      });
  };

  const cell = (x, y, w, h, value = "", opts = {}) => {
    if (opts.fill) {
      doc.save().rect(x, y, w, h).fill(opts.fill).restore();
    }
    doc.save().lineWidth(opts.lineWidth ?? 0.6).strokeColor(BLACK).rect(x, y, w, h).stroke().restore();
    if (value !== null) text(value, x, y, w, h, opts);
  };

  const field = (label, value, x, y, w, labelW = 92) => {
    cell(x, y, labelW, 14, label, { size: 5.5, align: "center" });
    cell(x + labelW, y, w - labelW, 14, value, { size: 6.5, align: "center", bold: true });
  };

  const money = value => fmt(Number(value ?? 0));
  const totalTrabajadores = rows.length;

  pages.forEach((workers, pageIndex) => {
    if (pageIndex > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 14 });

    doc.font("Helvetica-Bold").fontSize(14).fillColor(BLACK)
      .text("Instituto Guatemalteco de Seguridad Social", LEFT, TOP + 10, { width: WIDTH, align: "center" });
    doc.fontSize(8).text("PLANILLA DE SEGURIDAD SOCIAL", LEFT, TOP + 29, { width: WIDTH, align: "center" });

    cell(LEFT + WIDTH - 96, TOP, 96, 28, "Formulario DP1-A\nHoja No.", { size: 6 });
    text(`${pageIndex + 1} de ${pages.length}`, LEFT + WIDTH - 52, TOP + 14, 50, 12, {
      size: 6,
      bold: true,
      align: "center"
    });

    const y1 = 60;
    field("1- Correspondiente al mes de", periodo.mes, LEFT, y1, 282, 130);
    field("de", periodo.anio, LEFT + 282, y1, 78, 20);
    field("16- No. de Recibo", employer.numeroRecibo, LEFT + WIDTH - 150, y1 - 16, 110, 65);
    field("2- Por el Periodo de", formatDate(firstRow.PERIODO_INICIO), LEFT + 80, y1 + 18, 260, 94);
    field("al", formatDate(firstRow.PERIODO_FIN), LEFT + 340, y1 + 18, 130, 20);
    field("de", periodo.anio, LEFT + 470, y1 + 18, 84, 20);
    field("3- Nombres de la Empresa", employer.nombre, LEFT, y1 + 36, 390, 120);
    field("5- Nombres del Patrono o Razon Social", employer.nombre, LEFT + 390, y1 + 36, 260, 140);
    field("7- No. Patronal", employer.numeroPatronal, LEFT + 650, y1 + 36, WIDTH - 650, 82);
    field("4- Direccion de la Empresa", employer.direccionEmpresa, LEFT, y1 + 54, 390, 120);
    field("6- Direccion de Patrono", employer.direccionPatrono, LEFT + 390, y1 + 54, 260, 120);
    field("Telefono", employer.telefono, LEFT + 650, y1 + 54, 88, 42);
    field("Apdo. Postal", employer.apartadoPostal, LEFT + 738, y1 + 54, WIDTH - 738, 50);

    cell(LEFT, y1 + 73, WIDTH, 16,
      `Departamento de la Republica donde laboran los trabajadores reportados en esta Planilla: ${departamentos || "-"}`,
      { size: 7, bold: true, fill: GRAY }
    );

    const tableY = y1 + 89;
    const cols = [24, 74, 168, 92, 38, 74, 74, 74, 74, WIDTH - 696];
    const headers = [
      "No.",
      "DPI",
      "Empleado",
      "Puesto",
      "Dias",
      "Salario base",
      "Patronal",
      "Laboral",
      "Total",
      "Estado"
    ];
    let x = LEFT;
    headers.forEach((header, index) => {
      cell(x, tableY, cols[index], 24, header, {
        size: index === 2 ? 6 : 5.4,
        bold: true,
        align: "center",
        fill: GRAY
      });
      x += cols[index];
    });

    for (let i = 0; i < 16; i += 1) {
      const r = workers[i] ?? {};
      const y = tableY + 24 + i * 12;
      const values = [
        rows.length ? pageIndex * 16 + i + 1 : "",
        cleanText(r.EMP_DPI || r.EMP_NIT || r.EMP_ID),
        r.EMPLEADO,
        r.PUESTO,
        r.DIAS_TRABAJADOS ?? "",
        r.SALARIO_BASE != null ? money(r.SALARIO_BASE) : "",
        r.PATRONAL != null ? money(r.PATRONAL) : "",
        r.LABORAL != null ? money(r.LABORAL) : "",
        r.TOTAL_IGSS != null ? money(r.TOTAL_IGSS) : "",
        cleanText(r.ESTADO_CALCULADO)
      ];
      x = LEFT;
      values.forEach((value, index) => {
        cell(x, y, cols[index], 12, value, {
          size: index === 2 ? 5.8 : 5.4,
          align: [4, 5, 6, 7, 8].includes(index) ? "right" : "left"
        });
        x += cols[index];
      });
    }

    const totalsY = tableY + 24 + 16 * 12;
    cell(LEFT, totalsY, cols[0] + cols[1], 20, `13- Total de\nTrabajadores\nNo. ${totalTrabajadores}`, {
      size: 5.4,
      bold: true
    });
    cell(LEFT + cols[0] + cols[1], totalsY, cols[2] + cols[3] + cols[4], 20,
      "Total salario base ajustado por dias trabajados", { size: 5.8, bold: true }
    );
    cell(LEFT + cols[0] + cols[1] + cols[2] + cols[3] + cols[4], totalsY, cols[5], 20, money(totales.totalSalarioBase), {
      size: 8,
      bold: true,
      align: "right"
    });

    const liquidY = totalsY + 28;
    cell(LEFT, liquidY, WIDTH, 13, "15- LIQUIDACION", { size: 7, bold: true, align: "center" });
    const lCols = [145, 150, 150, 150, 95, WIDTH - 690];
    const lHeaders = ["CONCEPTOS", "CUOTA PATRONAL", "CUOTA TRABAJADOR", "RECARGO POR MORA", "5% ADICIONAL", "TOTAL A PAGAR"];
    x = LEFT;
    lHeaders.forEach((header, index) => {
      cell(x, liquidY + 13, lCols[index], 14, header, { size: 6, bold: true, align: "center", fill: GRAY });
      x += lCols[index];
    });

    const liquidRows = [
      ["IGSS", money(totales.totalPatronal), money(totales.totalLaboral), "0.00", "0.00", money(totales.totalIgss)],
      ["INTECAP", "0.00", "0.00", "0.00", "0.00", "0.00"],
      ["IRTRA", "0.00", "0.00", "0.00", "0.00", "0.00"],
      ["TOTAL", money(totales.totalPatronal), money(totales.totalLaboral), "0.00", "0.00", money(totales.totalIgss)]
    ];
    liquidRows.forEach((row, rowIndex) => {
      x = LEFT;
      row.forEach((value, index) => {
        cell(x, liquidY + 27 + rowIndex * 14, lCols[index], 14, value, {
          size: 6.5,
          bold: rowIndex === liquidRows.length - 1,
          align: index === 0 ? "center" : "right"
        });
        x += lCols[index];
      });
    });

    const oathY = liquidY + 92;
    cell(LEFT, oathY, WIDTH, 14,
      "DECLARO BAJO JURAMENTO QUE ESTA PLANILLA INCLUYE A TODOS LOS TRABAJADORES QUE ESTUVIERON A MI SERVICIO DURANTE EL MES ARRIBA INDICADO Y QUE SUS SALARIOS ANOTADOS SON EXACTOS",
      { size: 4.8, bold: true, align: "center", fill: PEACH }
    );
    cell(LEFT, oathY + 28, 370, 28, "(LUGAR Y FECHA)", { size: 6.5, bold: true, align: "center" });
    cell(LEFT, oathY + 66, 370, 18, "(FIRMA DEL PATRONO O SU REPRESENTANTE LEGAL Y SELLO DE LA EMPRESA)", {
      size: 5.8,
      bold: true,
      align: "center"
    });
  });

  doc.end();
}

export async function getIgssFacturaPDF(req, res) {
  try {
    const { periodoId, departamentoId, estado } = req.query;

    const { sql, binds } = buildIgssQuery({ periodoId, departamentoId });
    const result = await executeQuery(sql, binds);
    const rows   = buildIgssRows(result.rows, estado);

    const totales = computeTotals(rows);

    const firstRow     = rows[0] ?? {};
    const periodoLabel = formatPeriodoLabel(firstRow.PERIODO_INICIO);

    sendIgssPlanillaPdf(req, res, rows, totales, firstRow, periodoLabel);
  } catch (error) {
    console.error("Error en getIgssFacturaPDF:", error);
    if (!res.headersSent) {
      res.status(500).json({
        message: "Error generando PDF de la factura IGSS",
        error: error.message
      });
    }
  }
}

export async function getIgssReportePDF(req, res) {
  try {
    const { periodoId, departamentoId, estado } = req.query;

    const { sql, binds } = buildIgssQuery({ periodoId, departamentoId });
    const result = await executeQuery(sql, binds);
    const rows   = buildIgssRows(result.rows, estado);

    const totales         = computeTotals(rows);
    const porDepartamento = computeByDepartamento(rows);

    const firstRow     = rows[0] ?? {};
    const periodoLabel = formatPeriodoLabel(firstRow.PERIODO_INICIO);

    // ── Inicializar documento PDF ─────────────────────────────────────────
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reporte_igss_${periodoLabel.replace(/\s+/g, "_")}.pdf"`
    );
    doc.pipe(res);

    const PAGE_W   = doc.page.width;
    const LEFT     = 40;
    const TEAL     = "#0d9488";
    const DARK     = "#0f172a";
    const MUTED    = "#64748b";
    const LIGHT_BG = "#f8fafc";
    const BORDER   = "#e2e8f0";

    // ── Encabezado ────────────────────────────────────────────────────────
    doc.rect(LEFT, 30, PAGE_W - 80, 50).fill(TEAL);
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#ffffff")
      .text("Reporte IGSS", LEFT + 12, 40);
    doc.fontSize(10).font("Helvetica").fillColor("#ccfbf1")
      .text(
        `Cuotas patronal ${(PATRONAL_RATE * 100).toFixed(2)}% y laboral ` +
        `${(LABORAL_RATE * 100).toFixed(2)}% · ${periodoLabel}`,
        LEFT + 12, 60
      );

    // ── Tarjetas resumen ─────────────────────────────────────────────────
    const cardY = 92;
    const cardW = (PAGE_W - 80 - 18) / 4;
    const cards = [
      { label: "Total salarios base",                                  value: `Q ${fmt(totales.totalSalarioBase)}`, color: DARK  },
      { label: `IGSS patronal (${(PATRONAL_RATE*100).toFixed(2)}%)`,   value: `Q ${fmt(totales.totalPatronal)}`,    color: "#15803d" },
      { label: `IGSS laboral (${(LABORAL_RATE*100).toFixed(2)}%)`,     value: `Q ${fmt(totales.totalLaboral)}`,     color: "#0369a1" },
      { label: "Total a enterar al IGSS",                              value: `Q ${fmt(totales.totalIgss)}`,        color: "#b91c1c" }
    ];

    cards.forEach((c, i) => {
      const cx = LEFT + i * (cardW + 6);
      doc.roundedRect(cx, cardY, cardW, 50, 4).stroke(BORDER);
      doc.fontSize(8).font("Helvetica").fillColor(MUTED)
        .text(c.label, cx + 8, cardY + 8, { width: cardW - 16 });
      doc.fontSize(14).font("Helvetica-Bold").fillColor(c.color)
        .text(c.value, cx + 8, cardY + 24, { width: cardW - 16 });
    });

    // ── Dos columnas: resumen obligación | por departamento ───────────────
    const sectionY  = cardY + 62;
    const halfW     = (PAGE_W - 80 - 12) / 2;

    // Columna izquierda: Resumen de obligación
    doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
      .text("Resumen de obligación", LEFT, sectionY);
    doc.fontSize(8).font("Helvetica").fillColor(MUTED)
      .text("Detalle de cuotas a pagar", LEFT, sectionY + 13);

    const resItems = [
      ["Base imponible",                             `Q ${fmt(totales.totalSalarioBase)}`],
      [`Patronal ${(PATRONAL_RATE*100).toFixed(2)}% (Empresa)`,  `Q ${fmt(totales.totalPatronal)}`],
      [`Laboral ${(LABORAL_RATE*100).toFixed(2)}% (Empleados)`,  `Q ${fmt(totales.totalLaboral)}`],
      ["Total IGSS",                                 `Q ${fmt(totales.totalIgss)}`],
      ["Fecha límite pago",                          firstRow.FECHA_LIMITE_PAGO ?? "-"],
      ["Estado",                                     firstRow.ESTADO ?? "-"]
    ];

    let ry = sectionY + 30;
    for (const [label, val] of resItems) {
      doc.rect(LEFT, ry, halfW, 14).fill(LIGHT_BG);
      doc.fontSize(8).font("Helvetica").fillColor("#374151")
        .text(label, LEFT + 6, ry + 3)
        .text(val, LEFT + halfW / 2, ry + 3, { width: halfW / 2 - 6, align: "right" });
      ry += 15;
    }

    // Columna derecha: Distribución por departamento
    const rightX = LEFT + halfW + 12;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
      .text("IGSS por departamento", rightX, sectionY);
    doc.fontSize(8).font("Helvetica").fillColor(MUTED)
      .text("Patronal vs Laboral este período", rightX, sectionY + 13);

    const dCols = [halfW * 0.38, halfW * 0.22, halfW * 0.22, halfW * 0.18];
    const dHead = ["Departamento", "Patronal", "Laboral", "Total"];
    let dy = sectionY + 30;

    doc.rect(rightX, dy, halfW, 14).fill("#f1f5f9");
    let dx = rightX;
    for (let i = 0; i < dHead.length; i++) {
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#374151")
        .text(dHead[i], dx + 4, dy + 4, { width: dCols[i] - 4 });
      dx += dCols[i];
    }
    dy += 14;

    doc.font("Helvetica").fillColor(DARK);
    for (const dept of porDepartamento) {
      if (dy > doc.page.height - 100) break; // safety
      const dVals = [
        dept.departamento,
        `Q ${fmt(dept.patronal)}`,
        `Q ${fmt(dept.laboral)}`,
        `Q ${fmt(dept.totalIgss)}`
      ];
      dx = rightX;
      for (let i = 0; i < dVals.length; i++) {
        doc.fontSize(7).text(dVals[i], dx + 4, dy + 3, { width: dCols[i] - 4 });
        dx += dCols[i];
      }
      dy += 13;
    }

    // ── Tabla de empleados ───────────────────────────────────────────────
    const tableY = Math.max(ry, dy) + 18;

    // Nueva página si no hay espacio
    const startTableY = tableY + 16 > doc.page.height - 80
      ? (() => { doc.addPage({ size: "A4", layout: "landscape" }); return 40; })()
      : tableY;

    doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
      .text("Detalle por empleado", LEFT, startTableY);

    const eCols  = [165, 115, 120, 85, 80, 72, 72, 68];
    const eHead  = ["Empleado", "Puesto", "Departamento", "Salario base",
                    `Patronal`, `Laboral`, "Total IGSS", "Estado"];
    let ey = startTableY + 16;

    doc.rect(LEFT, ey, eCols.reduce((a, b) => a + b, 0), 15).fill("#f1f5f9");
    let ex = LEFT;
    for (let i = 0; i < eHead.length; i++) {
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#374151")
        .text(eHead[i], ex + 4, ey + 4, { width: eCols[i] - 4 });
      ex += eCols[i];
    }
    ey += 15;

    doc.font("Helvetica").fillColor(DARK);
    let rowEven = false;
    for (const r of rows) {
      if (ey + 13 > doc.page.height - 40) {
        doc.addPage({ size: "A4", layout: "landscape" });
        ey = 40;
      }

      if (rowEven) {
        doc.rect(LEFT, ey, eCols.reduce((a, b) => a + b, 0), 13).fill(LIGHT_BG);
      }
      rowEven = !rowEven;

      const eVals = [
        r.EMPLEADO,
        r.PUESTO,
        r.DEPARTAMENTO,
        `Q ${fmt(Number(r.SALARIO_BASE ?? 0))}`,
        `Q ${fmt(Number(r.PATRONAL    ?? 0))}`,
        `Q ${fmt(Number(r.LABORAL     ?? 0))}`,
        `Q ${fmt(Number(r.TOTAL_IGSS  ?? 0))}`,
        r.ESTADO ?? "-"
      ];
      ex = LEFT;
      for (let i = 0; i < eVals.length; i++) {
        doc.fontSize(7).fillColor(DARK)
          .text(eVals[i], ex + 4, ey + 3, { width: eCols[i] - 4 });
        ex += eCols[i];
      }
      ey += 13;
    }

    // ── Pie de página ─────────────────────────────────────────────────────
    doc.fontSize(7).font("Helvetica").fillColor(MUTED)
      .text(
        `Generado el ${new Date().toLocaleDateString("es-GT")} · InnovaCode HR · Cuotas IGSS Guatemala`,
        LEFT, doc.page.height - 30,
        { width: PAGE_W - 80, align: "center" }
      );

    doc.end();
  } catch (error) {
    console.error("Error en getIgssReportePDF:", error);
    if (!res.headersSent) {
      res.status(500).json({
        message: "Error generando PDF del reporte IGSS",
        error: error.message
      });
    }
  }
}
