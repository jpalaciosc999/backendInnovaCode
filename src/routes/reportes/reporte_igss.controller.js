import PDFDocument from "pdfkit";
import { executeQuery } from "../../config/db.js";

const PATRONAL_RATE = 0.1267;
const LABORAL_RATE  = 0.0483;

// ─────────────────────────────────────────────────────────────────────────────
// Query builder interno
// ─────────────────────────────────────────────────────────────────────────────

function buildIgssQuery(params) {
  const { periodoId, departamentoId, estado } = params;

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

  if (estado && estado !== "Todos") {
    conditions.push("N.NOM_ESTADO = :estado");
    binds.estado = estado;
  }

  const whereClause = conditions.length > 0
    ? "WHERE " + conditions.join(" AND ")
    : "";

  const PRATE = PATRONAL_RATE;
  const LRATE = LABORAL_RATE;

  const sql = `
    SELECT
      E.EMP_ID,
      E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO                              AS EMPLEADO,
      UPPER(SUBSTR(E.EMP_NOMBRE, 1, 1)
            || SUBSTR(E.EMP_APELLIDO, 1, 1))                             AS INICIALES,
      PUE.PUE_NOMBRE                                                      AS PUESTO,
      COALESCE(PUE.PUE_SALARIO_BASE, N.NOM_TOTAL_INGRESOS, 0)            AS SALARIO_BASE,
      ROUND(COALESCE(PUE.PUE_SALARIO_BASE, N.NOM_TOTAL_INGRESOS, 0) * ${PRATE}, 2)             AS PATRONAL,
      ROUND(COALESCE(PUE.PUE_SALARIO_BASE, N.NOM_TOTAL_INGRESOS, 0) * ${LRATE},  2)            AS LABORAL,
      ROUND(COALESCE(PUE.PUE_SALARIO_BASE, N.NOM_TOTAL_INGRESOS, 0) * (${PRATE} + ${LRATE}), 2) AS TOTAL_IGSS,
      D.DEP_ID,
      D.DEP_NOMBRE                                                        AS DEPARTAMENTO,
      N.NOM_ID,
      N.NOM_ESTADO                                                        AS ESTADO,
      PER.PER_ID,
      TO_CHAR(PER.PER_FECHA_INICIO, 'YYYY-MM-DD')                        AS PERIODO_INICIO,
      TO_CHAR(PER.PER_FECHA_FIN,   'YYYY-MM-DD')                         AS PERIODO_FIN,
      TO_CHAR(
        ADD_MONTHS(TRUNC(PER.PER_FECHA_FIN, 'MM'), 1) + 19,
        'DD/MM/YYYY'
      )                                                                   AS FECHA_LIMITE_PAGO
    FROM EMP_NOMINA N
    JOIN      EMP_EMPLEADO     E   ON E.EMP_ID   = N.EMP_ID
    LEFT JOIN EMP_PUESTO       PUE ON PUE.PUE_ID = E.PUE_ID
    JOIN      EMP_DEPARTAMENTO D   ON D.DEP_ID   = E.DEP_ID
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
  return Math.round(n * 100) / 100;
}

function fmt(n) {
  return Number(n).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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

    const { sql, binds } = buildIgssQuery({ periodoId, departamentoId, estado });
    const result = await executeQuery(sql, binds);
    const rows   = result.rows;

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
      estado: rows.every(r => r.ESTADO === firstRow.ESTADO) ? firstRow.ESTADO : "Mixto"
    };

    const empleados = rows.map(r => ({
      empId:        r.EMP_ID,
      empleado:     r.EMPLEADO,
      iniciales:    r.INICIALES,
      puesto:       r.PUESTO,
      salarioBase:  Number(r.SALARIO_BASE ?? 0),
      patronal:     Number(r.PATRONAL     ?? 0),
      laboral:      Number(r.LABORAL      ?? 0),
      totalIgss:    Number(r.TOTAL_IGSS   ?? 0),
      departamento: r.DEPARTAMENTO,
      depId:        r.DEP_ID,
      nomId:        r.NOM_ID,
      estado:       r.ESTADO
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
export async function getIgssReportePDF(req, res) {
  try {
    const { periodoId, departamentoId, estado } = req.query;

    const { sql, binds } = buildIgssQuery({ periodoId, departamentoId, estado });
    const result = await executeQuery(sql, binds);
    const rows   = result.rows;

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
