import PDFDocument from "pdfkit";
import { executeQuery } from "../../config/db.js";

// ─── Constantes ISR Guatemala — Decreto 10-2012 Régimen Opcional Simplificado ────
// Base de calculo usada en el reporte ISR del frontend: IGSS + IVA + minimo vital.
const GASTOS_DEDUCIBLES_ANUALES = 12000;
const MINIMO_VITAL_ANUAL = 48000;
const TASA_IGSS_LABORAL = 0.0483;
const ISR_TRAMO1_LIMITE = 300000;  // Q 300,000
const ISR_TRAMO1_RATE   = 0.05;    // 5 %
const ISR_TRAMO2_RATE   = 0.07;    // 7 % sobre el excedente

const MES_CORTO = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function fmt(n) {
  return Number(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Calcula ISR anual por tramos según Decreto 10-2012 */
function calcularISR(rentaImponible) {
  if (rentaImponible <= 0) return 0;
  if (rentaImponible <= ISR_TRAMO1_LIMITE) {
    return round2(rentaImponible * ISR_TRAMO1_RATE);
  }
  return round2(
    ISR_TRAMO1_LIMITE * ISR_TRAMO1_RATE +
    (rentaImponible - ISR_TRAMO1_LIMITE) * ISR_TRAMO2_RATE
  );
}

/** Estado del empleado respecto a su ISR */
function estadoISR(isrCalculado, isrRetenido) {
  const diff = round2(isrCalculado - isrRetenido);
  if (diff === 0) return "Al día";
  if (diff > 0)  return "Diferencia";
  return "Adelantado";
}

/**
 * Construye el SQL principal con CTE.
 * REGLA: nunca interpolar datos de req; solo constantes numéricas del código.
 * REGLA: no usar DISTINCT + ORDER BY sobre columna no seleccionada (ORA-01791).
 */
function buildIsrQuery({ anio, departamentoId, empleadoId }) {
  const binds = { anio: Number(anio) };
  const outerConditions = [];

  if (departamentoId) {
    outerConditions.push("E.DEP_ID = :departamentoId");
    binds.departamentoId = Number(departamentoId);
  }

  if (empleadoId) {
    outerConditions.push("E.EMP_ID = :empleadoId");
    binds.empleadoId = Number(empleadoId);
  }

  const outerWhere = outerConditions.length > 0
    ? "WHERE " + outerConditions.join(" AND ")
    : "";

  // ❌ ORA-01791 evitado: :anio se usa dentro de cada CTE, no en ORDER BY exterior
  const sql = `
    WITH
      RENTA_ANUAL AS (
        SELECT
          N.EMP_ID,
          SUM(N.NOM_TOTAL_INGRESOS) AS RENTA_BRUTA,
          COUNT(N.NOM_ID)           AS MESES_CON_NOMINA
        FROM EMP_NOMINA N
        JOIN EMP_PERIODO PER ON PER.PER_ID = N.PER_ID
        WHERE EXTRACT(YEAR FROM PER.PER_FECHA_INICIO) = :anio
        GROUP BY N.EMP_ID
      ),
      ISR_DB AS (
        -- Descuentos e ingresos especiales buscados por nombre del catalogo
        SELECT
          N.EMP_ID,
          SUM(CASE
            WHEN UPPER(DSC.TDS_NOMBRE) LIKE '%ISR%' THEN DET.DET_MONTO
            ELSE 0
          END) AS ISR_RETENIDO_DB,
          SUM(CASE
            WHEN UPPER(DSC.TDS_NOMBRE) LIKE '%IGSS%' THEN DET.DET_MONTO
            ELSE 0
          END) AS IGSS_RETENIDO_DB,
          SUM(CASE
            WHEN ING.TIS_ID IS NOT NULL AND (
              UPPER(ING.TIS_NOMBRE) LIKE '%BONO%' OR
              UPPER(ING.TIS_NOMBRE) LIKE '%BONIFIC%' OR
              UPPER(ING.TIS_NOMBRE) LIKE '%AGUINALDO%'
            ) THEN DET.DET_MONTO
            ELSE 0
          END) AS BONIFICACIONES_DB
        FROM EMP_NOMINA_DETALLE DET
        JOIN EMP_NOMINA     N   ON N.NOM_ID   = DET.NOM_ID
        JOIN EMP_PERIODO    PER ON PER.PER_ID = N.PER_ID
        LEFT JOIN EMP_DESCUENTO DSC ON DSC.TDS_ID = DET.TDS_ID
        LEFT JOIN EMP_INGRESO   ING ON ING.TIS_ID = DET.TIS_ID
        WHERE EXTRACT(YEAR FROM PER.PER_FECHA_INICIO) = :anio
        GROUP BY N.EMP_ID
      )
    SELECT
      E.EMP_ID,
      COALESCE(TO_CHAR(E.EMP_NIT), '')                  AS EMP_NIT,
      COALESCE(TO_CHAR(E.EMP_DPI), '')                  AS EMP_DPI,
      E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO          AS EMPLEADO,
      UPPER(SUBSTR(E.EMP_NOMBRE, 1, 1)
            || SUBSTR(E.EMP_APELLIDO, 1, 1))         AS INICIALES,
      COALESCE(PUE.PUE_NOMBRE, 'Sin puesto')         AS PUESTO,
      COALESCE(PUE.PUE_SALARIO_BASE, 0)              AS SAL_MENSUAL,
      D.DEP_ID,
      COALESCE(D.DEP_NOMBRE, 'Sin departamento')     AS DEPARTAMENTO,
      COALESCE(RA.RENTA_BRUTA, 0)                    AS RENTA_ANUAL,
      COALESCE(ISR.ISR_RETENIDO_DB, 0)               AS ISR_RETENIDO_DB,
      COALESCE(ISR.IGSS_RETENIDO_DB, 0)              AS IGSS_RETENIDO_DB,
      COALESCE(ISR.BONIFICACIONES_DB, 0)             AS BONIFICACIONES_DB,
      COALESCE(RA.MESES_CON_NOMINA, 0)               AS MESES_CON_NOMINA
    FROM RENTA_ANUAL RA
    JOIN      EMP_EMPLEADO    E   ON E.EMP_ID   = RA.EMP_ID
    LEFT JOIN EMP_PUESTO      PUE ON PUE.PUE_ID = E.PUE_ID
    LEFT JOIN EMP_DEPARTAMENTO D  ON D.DEP_ID   = E.DEP_ID
    LEFT JOIN ISR_DB          ISR ON ISR.EMP_ID  = RA.EMP_ID
    ${outerWhere}
    ORDER BY D.DEP_NOMBRE, E.EMP_APELLIDO, E.EMP_NOMBRE
  `;

  return { sql, binds };
}

/** Construye los 12 meses del año con ISR mensual y acumulado */
function buildMensualData(dbRows, totalIsrCalculado) {
  // Mapea lo que vino de la BD (meses con registros de descuento ISR)
  const porMes = {};
  for (const r of dbRows) {
    porMes[Number(r.MES)] = round2(Number(r.ISR_MENSUAL ?? 0));
  }

  // Si no hay datos de ISR en BD, prorratea el ISR calculado entre 12 meses
  const usarFallback = Object.keys(porMes).length === 0 && totalIsrCalculado > 0;

  const meses = [];
  let acumulado = 0;
  for (let m = 1; m <= 12; m++) {
    const isrMes = usarFallback
      ? round2(totalIsrCalculado / 12)
      : (porMes[m] ?? 0);
    acumulado = round2(acumulado + isrMes);
    meses.push({ mes: m, mesNombre: MES_CORTO[m], isrMensual: isrMes, acumulado });
  }
  return meses;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/isr/anios
// Años fiscales con nóminas generadas (para el selector del dashboard)
// ─────────────────────────────────────────────────────────────────────────────
function cleanPdfText(value, fallback = "") {
  const text = String(value ?? fallback ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function rightText(doc, text, x, y, width, options = {}) {
  doc.text(text, x, y, { width, align: "right", ...options });
}

function drawCell(doc, x, y, width, height, text = "", options = {}) {
  const {
    align = "left",
    bold = false,
    size = 7.5,
    fill = null,
    color = "#111827",
    valign = "center",
    padding = 4
  } = options;

  if (fill) {
    doc.rect(x, y, width, height).fillAndStroke(fill, "#c9c9c9");
  } else {
    doc.rect(x, y, width, height).stroke("#c9c9c9");
  }

  doc.font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .fillColor(color);

  const textHeight = doc.heightOfString(String(text), { width: width - padding * 2, align });
  const textY = valign === "top"
    ? y + padding
    : y + Math.max(3, (height - textHeight) / 2);

  doc.text(String(text), x + padding, textY, {
    width: width - padding * 2,
    align
  });
}

function drawMoneyCell(doc, x, y, width, height, value, options = {}) {
  const text = value === "" || value === null || value === undefined ? "" : fmt(value);
  drawCell(doc, x, y, width, height, text, {
    align: "right",
    color: "#1f3a5f",
    ...options
  });
}

function drawEmptyRows(doc, x, y, widths, rowHeight, rows) {
  for (let r = 0; r < rows; r++) {
    let cx = x;
    for (const width of widths) {
      drawCell(doc, cx, y + r * rowHeight, width, rowHeight, "");
      cx += width;
    }
  }
}

function patronoInfo() {
  return {
    nit: cleanPdfText(process.env.ISR_PATRONO_NIT || process.env.EMPRESA_NIT, "CF"),
    nombre: cleanPdfText(process.env.ISR_PATRONO_NOMBRE || process.env.EMPRESA_NOMBRE, "INNOVACODE"),
    direccion: cleanPdfText(process.env.ISR_PATRONO_DIRECCION || process.env.EMPRESA_DIRECCION, "Ciudad de Guatemala")
  };
}

function fmtQ(n) {
  return `Q ${fmt(n)}`;
}

function drawLabelValue(doc, label, value, x, y, width) {
  doc.font("Helvetica").fontSize(8).fillColor("#64748b")
    .text(label, x, y, { width });
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a")
    .text(cleanPdfText(value, "-"), x, y + 11, { width });
}

function drawConstanciaRow(doc, label, value, x, y, labelW, valueW, options = {}) {
  const bold = Boolean(options.bold);
  const fill = options.fill || null;
  const color = options.color || "#0f172a";

  if (fill) {
    doc.rect(x, y, labelW + valueW, 25).fill(fill);
  }

  doc.rect(x, y, labelW, 25).stroke("#cbd5e1");
  doc.rect(x + labelW, y, valueW, 25).stroke("#cbd5e1");
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(color)
    .text(label, x + 8, y + 8, { width: labelW - 16 });
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(color)
    .text(fmtQ(value), x + labelW + 8, y + 8, { width: valueW - 16, align: "right" });
}

function constanciaNumero(anio, empleado) {
  const emp = String(empleado.empId || "0").padStart(4, "0");
  return `ISR-${anio}-${emp}`;
}

function buildEmpleadoIsr(row, hayIsrEnDB) {
  const mesesConNomina = Number(row.MESES_CON_NOMINA ?? 0);
  const mesesCalculo = mesesConNomina > 0 ? mesesConNomina : 12;
  const rentaAnual = round2(Number(row.RENTA_ANUAL ?? 0));
  const bonificaciones = round2(Number(row.BONIFICACIONES_DB ?? 0));
  const igss = round2(rentaAnual * TASA_IGSS_LABORAL);
  const creditoIva = round2(GASTOS_DEDUCIBLES_ANUALES * (mesesCalculo / 12));
  const minimoVital = round2(MINIMO_VITAL_ANUAL * (mesesCalculo / 12));
  const totalDeducciones = round2(igss + creditoIva + minimoVital);
  const rentaImponible = round2(Math.max(0, rentaAnual - totalDeducciones));
  const isrCalculado = calcularISR(rentaImponible);
  const isrMensual = round2(isrCalculado / mesesCalculo);
  const isrRetenido = hayIsrEnDB
    ? round2(Number(row.ISR_RETENIDO_DB ?? 0))
    : isrCalculado;
  const diferencia = round2(isrCalculado - isrRetenido);
  const salMensual = Number(row.SAL_MENSUAL) > 0
    ? round2(Number(row.SAL_MENSUAL))
    : (mesesConNomina > 0 ? round2(rentaAnual / mesesConNomina) : 0);
  const salarioOrdinarioAnual = round2(Math.max(0, rentaAnual - bonificaciones));

  return {
    empId: row.EMP_ID,
    nit: row.EMP_NIT,
    dpi: row.EMP_DPI,
    empleado: row.EMPLEADO,
    iniciales: row.INICIALES,
    puesto: row.PUESTO,
    depId: row.DEP_ID,
    departamento: row.DEPARTAMENTO,
    mesesConNomina,
    salMensual,
    salAnual: round2(salMensual * 12),
    salarioOrdinarioAnual,
    bonificaciones,
    rentaAnual,
    igss,
    creditoIva,
    minimoVital,
    deducciones: totalDeducciones,
    totalDeducciones,
    rentaImponible,
    tasa: isrCalculado > 0 ? (rentaImponible <= ISR_TRAMO1_LIMITE ? "5%" : "5% + 7%") : "No afecto",
    isrCalculado,
    isrRetenido,
    diferencia,
    isrMensual,
    isrAnual: isrCalculado,
    baseImponible: rentaImponible,
    afecto: isrCalculado > 0,
    estado: isrCalculado > 0 ? estadoISR(isrCalculado, isrRetenido) : "No afecto"
  };
}

function drawIsrConstanciaPage(doc, empleado, anio, index, totalPages) {
  const patrono = patronoInfo();
  const left = 44;
  const top = 38;
  const width = doc.page.width - 88;
  const blue = "#1f4e9a";
  const dark = "#0f172a";
  const muted = "#64748b";
  const line = "#cbd5e1";
  const today = new Date();
  const nitContribuyente = cleanPdfText(empleado.nit || empleado.dpi || empleado.empId, "CF");
  const docNo = constanciaNumero(anio, empleado);
  const qrSize = 72;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff");
  doc.rect(left, top, width, 78).stroke(line);
  doc.rect(left, top, 110, 78).fillAndStroke("#f8fafc", line);
  doc.font("Helvetica-Bold").fontSize(29).fillColor(blue)
    .text("SAT", left + 24, top + 15, { width: 62, align: "center" });
  doc.font("Helvetica").fontSize(6.5).fillColor(muted)
    .text("Superintendencia de Administracion Tributaria", left + 9, top + 48, { width: 92, align: "center" })
    .text("Guatemala, C.A.", left + 9, top + 58, { width: 92, align: "center" });

  doc.font("Helvetica-Bold").fontSize(15).fillColor(dark)
    .text("CONSTANCIA DE RETENCION ISR", left + 122, top + 14, { width: width - 260, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(muted)
    .text("Documento fiscal interno para proyecto universitario", left + 122, top + 35, { width: width - 260, align: "center" })
    .text(`Periodo fiscal ${anio}`, left + 122, top + 51, { width: width - 260, align: "center" });

  doc.rect(left + width - 130, top, 130, 78).stroke(line);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(muted)
    .text("Documento No.", left + width - 118, top + 12, { width: 106, align: "center" });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(dark)
    .text(docNo, left + width - 118, top + 27, { width: 106, align: "center" });
  doc.font("Helvetica").fontSize(7.2).fillColor(muted)
    .text(`Fecha: ${today.toLocaleDateString("es-GT")}`, left + width - 118, top + 51, { width: 106, align: "center" });

  let y = top + 100;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
  doc.rect(left, y, width, 22).fill(blue);
  doc.text("DATOS DEL AGENTE RETENEDOR", left + 10, y + 7, { width: width - 20 });
  y += 32;
  drawLabelValue(doc, "Nombre o razon social", patrono.nombre.toUpperCase(), left, y, 245);
  drawLabelValue(doc, "NIT", patrono.nit, left + 260, y, 100);
  drawLabelValue(doc, "Direccion fiscal", patrono.direccion, left + 370, y, width - 370);

  y += 48;
  doc.rect(left, y, width, 22).fill(blue);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
    .text("DATOS DEL CONTRIBUYENTE", left + 10, y + 7, { width: width - 20 });
  y += 32;
  drawLabelValue(doc, "Empleado", cleanPdfText(empleado.empleado).toUpperCase(), left, y, 245);
  drawLabelValue(doc, "NIT / CUI", nitContribuyente, left + 260, y, 100);
  drawLabelValue(doc, "Puesto", empleado.puesto, left + 370, y, width - 370);
  y += 34;
  drawLabelValue(doc, "Departamento", empleado.departamento, left, y, 170);
  drawLabelValue(doc, "Meses con nomina", empleado.mesesConNomina, left + 185, y, 110);
  drawLabelValue(doc, "Estado ISR", empleado.estado, left + 310, y, 130);

  y += 52;
  doc.rect(left, y, width, 22).fill(blue);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
    .text("DETALLE DEL CALCULO", left + 10, y + 7, { width: width - 20 });
  y += 30;

  const labelW = width - 150;
  const valueW = 150;
  drawConstanciaRow(doc, "Salario ordinario anual", empleado.salarioOrdinarioAnual, left, y, labelW, valueW);
  y += 25;
  drawConstanciaRow(doc, "Bonificaciones / aguinaldo / bono 14", empleado.bonificaciones, left, y, labelW, valueW);
  y += 25;
  drawConstanciaRow(doc, "Total ingresos devengados", empleado.rentaAnual, left, y, labelW, valueW, { bold: true, fill: "#f8fafc" });
  y += 25;
  drawConstanciaRow(doc, "IGSS laboral retenido", empleado.igss, left, y, labelW, valueW);
  y += 25;
  drawConstanciaRow(doc, "Deduccion legal anual ISR", empleado.deducciones, left, y, labelW, valueW);
  y += 25;
  drawConstanciaRow(doc, "Total deducciones", empleado.totalDeducciones, left, y, labelW, valueW, { bold: true, fill: "#f8fafc" });
  y += 25;
  drawConstanciaRow(doc, "Renta imponible", empleado.rentaImponible, left, y, labelW, valueW, { bold: true });
  y += 25;
  drawConstanciaRow(doc, "ISR anual calculado", empleado.isrCalculado, left, y, labelW, valueW);
  y += 25;
  drawConstanciaRow(doc, "ISR retenido al trabajador", empleado.isrRetenido, left, y, labelW, valueW, { bold: true, fill: "#eff6ff", color: blue });
  y += 25;
  drawConstanciaRow(doc, "Diferencia por ajustar", empleado.diferencia, left, y, labelW, valueW);

  y += 50;
  doc.roundedRect(left, y, width - qrSize - 18, 74, 4).stroke(line);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(dark)
    .text("Observaciones", left + 10, y + 10, { width: width - qrSize - 38 });
  doc.font("Helvetica").fontSize(8).fillColor(muted)
    .text("Esta constancia simula el formato de retencion de ISR para fines academicos. La validez fiscal real requiere emision y autorizacion por los sistemas oficiales correspondientes.", left + 10, y + 27, {
      width: width - qrSize - 38
    });

  const qrX = left + width - qrSize;
  doc.rect(qrX, y, qrSize, qrSize).stroke(line);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const on = (row * 17 + col * 11 + empleado.empId + anio) % 4 === 0;
      if (on) doc.rect(qrX + 8 + col * 6, y + 8 + row * 6, 5, 5).fill(dark);
    }
  }

  const signY = doc.page.height - 92;
  doc.moveTo(left + 28, signY).lineTo(left + 215, signY).stroke(line);
  doc.moveTo(left + width - 215, signY).lineTo(left + width - 28, signY).stroke(line);
  doc.font("Helvetica").fontSize(8).fillColor(muted)
    .text("Firma agente retenedor", left + 28, signY + 8, { width: 187, align: "center" })
    .text("Firma trabajador", left + width - 215, signY + 8, { width: 187, align: "center" });

  doc.font("Helvetica").fontSize(7).fillColor("#94a3b8")
    .text(`Pagina ${index} de ${totalPages} - Generado por InnovaCode HR`, left, doc.page.height - 30, {
      width,
      align: "center"
    });
}

function drawSatIsrPage(doc, empleado, anio, index, totalPages) {
  const left = 28;
  const top = 26;
  const width = doc.page.width - 56;
  const line = "#c9c9c9";
  const headerFill = "#f7f7f7";
  const satBlue = "#1f4e9a";
  const patrono = patronoInfo();
  const formNo = String(1415000000 + Number(anio) * 1000 + Number(empleado.empId || index)).slice(0, 10);
  const nit = cleanPdfText(empleado.nit || empleado.dpi || empleado.empId, "CF");
  const rentaExenta = empleado.deducciones;
  const rentaNeta = round2(Math.max(0, empleado.rentaAnual - rentaExenta));

  doc.lineWidth(0.8).strokeColor(line).fillColor("#111827");
  doc.font("Helvetica").fontSize(7)
    .text(new Date().toLocaleDateString("es-GT"), left, 10, { width: 80 });
  doc.font("Helvetica-Bold").fontSize(7.5)
    .text("Calculo ISR Asalariados - Portal SAT", left, 10, { width, align: "center" });

  doc.rect(left, top, width, 64).stroke(line);
  drawCell(doc, left, top, 125, 64, "", { fill: "#ffffff" });
  doc.font("Helvetica-Bold").fontSize(28).fillColor(satBlue)
    .text("SAT", left + 28, top + 16, { width: 75, align: "center" });
  doc.font("Helvetica").fontSize(6).fillColor("#334155")
    .text("Superintendencia de Administracion Tributaria", left + 8, top + 45, { width: 110, align: "center" })
    .text("Republica de Guatemala C.A.", left + 8, top + 53, { width: 110, align: "center" });

  drawCell(doc, left + 125, top, width - 250, 64, "", { fill: "#ffffff" });
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827")
    .text("DECLARACION JURADA ANTE EL", left + 130, top + 8, { width: width - 260, align: "center" })
    .text("PATRONO", left + 130, top + 25, { width: width - 260, align: "center" });
  doc.font("Helvetica").fontSize(11)
    .text("DEL IMPUESTO SOBRE LA RENTA", left + 130, top + 43, { width: width - 260, align: "center" });

  drawCell(doc, left + width - 125, top, 125, 64, "", { fill: "#ffffff" });
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827")
    .text("SAT-1901", left + width - 120, top + 10, { width: 115, align: "center" });
  doc.font("Helvetica").fontSize(7)
    .text("Release 1.0", left + width - 120, top + 31, { width: 115, align: "center" });
  doc.font("Helvetica-Bold").fontSize(7)
    .text(`No. ${formNo}`, left + width - 120, top + 48, { width: 115, align: "center" });

  let y = top + 84;
  drawCell(doc, left, y, 145, 18, "NIT del contribuyente", { bold: true, align: "center", fill: headerFill });
  drawCell(doc, left + 145, y, width - 145, 18, "Apellidos y Nombres", { bold: true, align: "center", fill: headerFill });
  y += 18;
  drawCell(doc, left, y, 145, 22, nit, { align: "center" });
  drawCell(doc, left + 145, y, width - 145, 22, cleanPdfText(empleado.empleado).toUpperCase(), { align: "center", size: 7 });

  y += 40;
  drawCell(doc, left, y, 145, 22, "", {});
  drawCell(doc, left + 145, y, width - 145, 22, `Año: ${anio}`, { bold: true, size: 8 });

  y += 40;
  drawCell(doc, left, y, width, 24, "RENTAS BRUTAS", { bold: true, align: "center", size: 9, fill: "#ffffff" });
  y += 24;
  const rentasWidths = [80, width - 190, 110];
  drawCell(doc, left, y, rentasWidths[0], 18, "NIT", { bold: true, align: "center", fill: headerFill });
  drawCell(doc, left + rentasWidths[0], y, rentasWidths[1], 18, "Nombre Razon o Denominacion Social", { bold: true, align: "center", fill: headerFill });
  drawCell(doc, left + rentasWidths[0] + rentasWidths[1], y, rentasWidths[2], 18, "Monto", { bold: true, align: "center", fill: headerFill });
  y += 18;
  drawCell(doc, left, y, width, 18, "Patrono ante quien presenta la declaracion:", { bold: true, align: "center", fill: "#ffffff" });
  y += 18;
  drawCell(doc, left, y, rentasWidths[0], 20, patrono.nit, { align: "center" });
  drawCell(doc, left + rentasWidths[0], y, rentasWidths[1], 20, patrono.nombre.toUpperCase(), { align: "center" });
  drawMoneyCell(doc, left + rentasWidths[0] + rentasWidths[1], y, rentasWidths[2], 20, empleado.rentaAnual, { bold: true });
  y += 20;
  drawCell(doc, left, y, width, 18, "Detalle de otros patronos:", { bold: true, align: "center", fill: "#ffffff" });
  y += 18;
  drawEmptyRows(doc, left, y, rentasWidths, 18, 5);
  y += 90;
  drawCell(doc, left, y, width, 18, "Detalle de otros expatronos:", { bold: true, align: "center", fill: "#ffffff" });
  y += 18;
  drawEmptyRows(doc, left, y, rentasWidths, 18, 5);
  y += 90;
  drawCell(doc, left, y, width - 110, 20, "TOTAL RENTAS BRUTAS:", { bold: true });
  drawMoneyCell(doc, left + width - 110, y, 110, 20, empleado.rentaAnual, { bold: true });

  y += 24;
  drawCell(doc, left, y, width, 22, "DETERMINACION DE LA RENTA NETA", { bold: true, align: "center", size: 9, fill: "#ffffff" });
  y += 22;
  const labelW = width - 220;
  const amountW = 110;
  const labels = [
    ["Indemnizaciones o Pensiones por causa de muerte o incapacidad", ""],
    ["Indemnizaciones por tiempo servido", ""],
    ["Remuneraciones de diplomaticos, agentes consulares y demas representantes acreditados ante el gobierno de Guatemala", ""],
    ["Gastos de representacion y viaticos comprobables, dentro y fuera del pais", ""],
    ["Aguinaldo hasta el (100%) del sueldo o salario ordinario mensual", ""],
    ["Bonificacion anual (Bono 14) de trabajadores, hasta el (100%) del sueldo del salario ordinario mensual", ""]
  ];

  for (const [label, value] of labels) {
    drawCell(doc, left, y, labelW, 20, label, { valign: "top", size: 6.6 });
    drawMoneyCell(doc, left + labelW, y, amountW, 20, value);
    drawCell(doc, left + labelW + amountW, y, amountW, 20, "");
    y += 20;
  }

  drawCell(doc, left, y, labelW, 20, "Total Rentas exentas", { bold: true });
  drawMoneyCell(doc, left + labelW, y, amountW, 20, rentaExenta, { bold: true });
  drawCell(doc, left + labelW + amountW, y, amountW, 20, "");
  y += 20;
  drawCell(doc, left, y, labelW, 20, "(=) Renta Neta", { bold: true });
  drawMoneyCell(doc, left + labelW, y, amountW, 20, rentaNeta, { bold: true });
  drawCell(doc, left + labelW + amountW, y, amountW, 20, "");

  const footerY = doc.page.height - 30;
  doc.font("Helvetica").fontSize(7).fillColor("#111827")
    .text("https://portal.sat.gob.gt/portal/calculo-isr-asalariados/", left, footerY, { width: width / 2 });
  rightText(doc, "1/2", left + width / 2, footerY, width / 2);
}

function drawSatIsrSecondPage(doc, empleado, anio) {
  const left = 28;
  const top = 26;
  const width = doc.page.width - 56;
  const line = "#c9c9c9";
  const labelW = width - 220;
  const amountW = 110;

  doc.lineWidth(0.8).strokeColor(line).fillColor("#111827");
  doc.font("Helvetica").fontSize(7)
    .text(new Date().toLocaleDateString("es-GT"), left, 10, { width: 80 });
  doc.font("Helvetica-Bold").fontSize(7.5)
    .text("Calculo ISR Asalariados - Portal SAT", left, 10, { width, align: "center" });

  drawCell(doc, left, top, width, 68, "", { fill: "#ffffff" });
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827")
    .text("SAT-1901", left + width - 130, top + 12, { width: 120, align: "center" });
  doc.font("Helvetica-Bold").fontSize(13)
    .text("DETERMINACION DEL IMPUESTO", left, top + 22, { width, align: "center" });
  doc.font("Helvetica").fontSize(9)
    .text(`Periodo fiscal ${anio}`, left, top + 44, { width, align: "center" });

  let y = top + 96;
  drawCell(doc, left, y, width, 24, "CALCULO DEL IMPUESTO SOBRE LA RENTA", { bold: true, align: "center", size: 9, fill: "#ffffff" });
  y += 24;

  const rows = [
    ["Renta neta", round2(Math.max(0, empleado.rentaAnual - empleado.deducciones))],
    ["Deducciones aplicables", empleado.deducciones],
    ["Renta imponible", empleado.rentaImponible],
    ["ISR anual calculado", empleado.isrCalculado],
    ["ISR retenido por el patrono", empleado.isrRetenido],
    ["Diferencia por retener / ajustar", empleado.diferencia]
  ];

  for (const [label, value] of rows) {
    drawCell(doc, left, y, labelW, 22, label, { bold: String(label).includes("ISR") || String(label).includes("imponible") });
    drawMoneyCell(doc, left + labelW, y, amountW, 22, value, { bold: String(label).includes("ISR") || String(label).includes("imponible") });
    drawCell(doc, left + labelW + amountW, y, amountW, 22, "");
    y += 22;
  }

  y += 28;
  drawCell(doc, left, y, width, 22, "OBSERVACIONES", { bold: true, align: "center", size: 9, fill: "#ffffff" });
  y += 22;
  drawCell(doc, left, y, width, 54, `Estado ISR: ${empleado.estado}`, { bold: true, valign: "top" });

  const footerY = doc.page.height - 30;
  doc.font("Helvetica").fontSize(7).fillColor("#111827")
    .text("https://portal.sat.gob.gt/portal/calculo-isr-asalariados/", left, footerY, { width: width / 2 });
  rightText(doc, "2/2", left + width / 2, footerY, width / 2);
}

export async function getIsrAnios(req, res) {
  try {
    // ✅ Subquery wrapper: evita ORA-01791 (DISTINCT + ORDER BY columna no seleccionada)
    const sql = `
      SELECT ANIO FROM (
        SELECT DISTINCT
          EXTRACT(YEAR FROM PER.PER_FECHA_INICIO) AS ANIO
        FROM EMP_PERIODO PER
        JOIN EMP_NOMINA N ON N.PER_ID = PER.PER_ID
      )
      ORDER BY ANIO DESC
    `;

    const result = await executeQuery(sql);
    res.json(result.rows.map(r => Number(r.ANIO)));
  } catch (error) {
    console.error("Error en getIsrAnios:", error);
    res.status(500).json({ message: "Error obteniendo años fiscales ISR", error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/isr/reporte?anio=2025&departamentoId=
// Datos JSON del reporte ISR anual por empleado
// ─────────────────────────────────────────────────────────────────────────────
export async function getIsrReporte(req, res) {
  try {
    const anio          = Number(req.query.anio) || new Date().getFullYear();
    const departamentoId = req.query.departamentoId || null;
    const empleadoId     = req.query.empleadoId || null;

    // ── Query principal por empleado ──────────────────────────────────────
    const { sql, binds } = buildIsrQuery({ anio, departamentoId, empleadoId });
    const empResult = await executeQuery(sql, binds);
    const rawRows   = empResult.rows;

    if (rawRows.length === 0) {
      return res.json({
        anio,
        empleados: [], totales: null, mensual: [],
        tramosIsr: tramosIsrGt(anio)
      });
    }

    // ── Calcular ISR en JS por empleado ───────────────────────────────────
    const hayIsrEnDB = rawRows.some(r => Number(r.ISR_RETENIDO_DB) > 0);

    const empleados = rawRows.map(r => {
      const calculo = buildEmpleadoIsr(r, hayIsrEnDB);
      const mesesConNomina  = Number(r.MESES_CON_NOMINA ?? 0);
      const rentaAnual      = calculo.rentaAnual;
      // Misma base que la tabla ISR: IGSS + IVA + minimo vital prorrateados.
      const deducciones     = calculo.totalDeducciones;
      const rentaImponible  = calculo.rentaImponible;
      const isrCalculado    = calculo.isrCalculado;
      const isrMensual      = calculo.isrMensual;
      const isrRetenido     = calculo.isrRetenido;
      const diferencia      = calculo.diferencia;
      // Salario mensual: desde puesto o prorrateado desde nóminas reales
      const salMensual      = Number(r.SAL_MENSUAL) > 0
        ? round2(Number(r.SAL_MENSUAL))
        : (mesesConNomina > 0 ? round2(rentaAnual / mesesConNomina) : 0);
      const salAnual        = round2(salMensual * 12);

      return {
        empId:          r.EMP_ID,
        empleado:       r.EMPLEADO,
        iniciales:      r.INICIALES,
        puesto:         r.PUESTO,
        depId:          r.DEP_ID,
        departamento:   r.DEPARTAMENTO,
        mesesConNomina,
        // Campos imagen 1: Renta anual / Deducciones / Renta imponible / ISR calculado / ISR retenido / Diferencia
        rentaAnual,
        igss: calculo.igss,
        creditoIva: calculo.creditoIva,
        minimoVital: calculo.minimoVital,
        deducciones,
        totalDeducciones: deducciones,
        rentaImponible,
        tasa: calculo.tasa,
        isrCalculado,
        isrRetenido,
        diferencia,
        // Campos adicionales para dashboard
        salMensual,
        salAnual,
        isrMensual,
        baseImponible:  rentaImponible,   // alias para compatibilidad
        isrAnual:       isrCalculado,     // alias
        afecto:         isrCalculado > 0,
        estado:         isrCalculado > 0 ? estadoISR(isrCalculado, isrRetenido) : "No afecto"
      };
    });

    // ── Totales generales ─────────────────────────────────────────────────
    const afectos       = empleados.filter(e =>  e.afecto);
    const noAfectos     = empleados.filter(e => !e.afecto);
    const isrAnualTotal = round2(empleados.reduce((s, e) => s + e.isrCalculado,   0));
    const isrMensualTotal = round2(isrAnualTotal / 12);

    const totales = {
      // Nombres imagen 1
      totalRentaImponible:  round2(empleados.reduce((s, e) => s + e.rentaImponible, 0)),
      totalIsrCalculado:    isrAnualTotal,
      totalIsrRetenido:     round2(empleados.reduce((s, e) => s + e.isrRetenido,    0)),
      totalDiferencia:      round2(empleados.reduce((s, e) => s + e.diferencia,     0)),
      empleadosAfectos:     afectos.length,
      empleadosNoAfectos:   noAfectos.length,
      // Aliases para dashboard / imagen 2
      empleadosActivos:     empleados.length,
      totalBaseImponible:   round2(empleados.reduce((s, e) => s + e.rentaImponible, 0)),
      isrMensualTotal,
      isrAnualAcumulado:    isrAnualTotal
    };

    // ── Resumen SAT ───────────────────────────────────────────────────────
    const resumenSAT = {
      periodoFiscal:      anio,
      fechaDeclaracion:   `Marzo ${anio + 1}`,
      afectosISR:         afectos.length,
      noAfectosISR:       noAfectos.length,
      baseImponibleTotal: totales.totalRentaImponible,
      isrMensualRetener:  isrMensualTotal,
      isrAnualTotal
    };

    // ── Desglose por departamento ─────────────────────────────────────────
    const deptMap = {};
    for (const e of empleados) {
      const k = e.depId ?? "SIN";
      if (!deptMap[k]) {
        deptMap[k] = { depId: e.depId, departamento: e.departamento,
                       rentaImponible: 0, isrCalculado: 0, isrRetenido: 0 };
      }
      deptMap[k].rentaImponible = round2(deptMap[k].rentaImponible + e.rentaImponible);
      deptMap[k].isrCalculado   = round2(deptMap[k].isrCalculado   + e.isrCalculado);
      deptMap[k].isrRetenido    = round2(deptMap[k].isrRetenido    + e.isrRetenido);
    }
    const porDepartamento = Object.values(deptMap);

    // ── Datos mensuales para el gráfico ──────────────────────────────────
    const mensualSql = `
      SELECT
        EXTRACT(MONTH FROM PER.PER_FECHA_INICIO) AS MES,
        SUM(DET.DET_MONTO)                       AS ISR_MENSUAL
      FROM EMP_NOMINA_DETALLE DET
      JOIN EMP_NOMINA    N   ON N.NOM_ID   = DET.NOM_ID
      JOIN EMP_PERIODO   PER ON PER.PER_ID = N.PER_ID
      JOIN EMP_DESCUENTO DSC ON DSC.TDS_ID = DET.TDS_ID
      WHERE EXTRACT(YEAR FROM PER.PER_FECHA_INICIO) = :anio
        AND UPPER(DSC.TDS_NOMBRE) LIKE '%ISR%'
      GROUP BY EXTRACT(MONTH FROM PER.PER_FECHA_INICIO)
      ORDER BY MES
    `;
    const mensualResult = await executeQuery(mensualSql, { anio });
    const mensual = buildMensualData(mensualResult.rows, totales.totalIsrCalculado);

    res.json({
      anio,
      empleados,
      totales,
      resumenSAT,
      porDepartamento,
      mensual,
      tramosIsr:         tramosIsrGt(anio),
      fuenteIsrRetenido: hayIsrEnDB ? "DB" : "CALCULADO"
    });
  } catch (error) {
    console.error("Error en getIsrReporte:", error);
    res.status(500).json({ message: "Error generando reporte ISR anual", error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/isr/reporte/pdf?anio=2025&departamentoId=
// Descarga el reporte ISR en PDF listo para presentar a SAT
// ─────────────────────────────────────────────────────────────────────────────
export async function getIsrReportePDF(req, res) {
  try {
    const anio = Number(req.query.anio) || new Date().getFullYear();
    const departamentoId = req.query.departamentoId || null;

    const { sql, binds } = buildIsrQuery({ anio, departamentoId });
    const empResult = await executeQuery(sql, binds);
    const rawRows = empResult.rows;

    if (rawRows.length === 0) {
      return res.status(404).json({ message: "No se encontraron datos ISR para generar el reporte" });
    }

    const hayIsrEnDB = rawRows.some(r => Number(r.ISR_RETENIDO_DB) > 0);
    const empleados = rawRows.map(r => buildEmpleadoIsr(r, hayIsrEnDB));
    const totalRentaImponible = round2(empleados.reduce((s, e) => s + e.rentaImponible, 0));
    const totalIsrRetenido = round2(empleados.reduce((s, e) => s + e.isrRetenido, 0));
    const afectos = empleados.filter(e => e.isrCalculado > 0).length;
    const noAfectos = empleados.length - afectos;

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="reporte_isr_${anio}.pdf"`);
    doc.pipe(res);

    const pageW = doc.page.width;
    const left = 40;
    const indigo = "#4338ca";
    const dark = "#0f172a";
    const muted = "#64748b";
    const border = "#e2e8f0";

    doc.rect(left, 30, pageW - 80, 52).fill(indigo);
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#ffffff")
      .text("Reporte ISR Anual", left + 12, 40);
    doc.fontSize(9).font("Helvetica").fillColor("#c7d2fe")
      .text(`Retenciones acumuladas - Declaracion anual SAT - Año ${anio}`, left + 12, 60);

    const cardY = 94;
    const cardW = (pageW - 80 - 18) / 4;
    const cards = [
      { label: "Total renta imponible", value: `Q ${fmt(totalRentaImponible)}`, color: "#1d4ed8" },
      { label: "ISR retenido acumulado", value: `Q ${fmt(totalIsrRetenido)}`, color: "#b91c1c" },
      { label: "Empleados afectos", value: String(afectos), color: "#b45309" },
      { label: "Empleados no afectos", value: String(noAfectos), color: "#15803d" }
    ];

    cards.forEach((card, index) => {
      const x = left + index * (cardW + 6);
      doc.roundedRect(x, cardY, cardW, 48, 4).stroke(border);
      doc.fontSize(8).font("Helvetica").fillColor(muted)
        .text(card.label, x + 8, cardY + 8, { width: cardW - 16 });
      doc.fontSize(13).font("Helvetica-Bold").fillColor(card.color)
        .text(card.value, x + 8, cardY + 24, { width: cardW - 16 });
    });

    let y = cardY + 62;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(dark)
      .text("Tramos ISR Guatemala - Decreto 10-2012", left, y);
    y += 14;

    for (const tramo of tramosIsrGt(anio)) {
      doc.fontSize(8.5).font("Helvetica").fillColor("#374151")
        .text(tramo.descripcion, left, y)
        .font("Helvetica-Bold")
        .text(tramo.valor, left + 200, y);
      y += 13;
    }

    y += 12;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(dark)
      .text("Detalle por empleado", left, y);
    y += 14;

    const cols = ["Empleado", "Departamento", "Renta anual", "Deducciones", "Renta imponible", "ISR calculado", "ISR retenido", "Diferencia", "Estado"];
    const widths = [140, 110, 80, 80, 90, 82, 82, 68, 62];

    const drawHeader = () => {
      doc.rect(left, y, widths.reduce((a, b) => a + b, 0), 16).fill("#f1f5f9");
      doc.fillColor("#374151").fontSize(7.5).font("Helvetica-Bold");
      let x = left;
      for (let i = 0; i < cols.length; i++) {
        doc.text(cols[i], x + 3, y + 4, { width: widths[i] - 3 });
        x += widths[i];
      }
      y += 16;
    };

    drawHeader();
    doc.fillColor(dark).font("Helvetica").fontSize(7.5);

    for (const empleado of empleados) {
      if (y + 14 > doc.page.height - 40) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 40 });
        y = 40;
        drawHeader();
      }

      const values = [
        empleado.empleado,
        empleado.departamento,
        `Q ${fmt(empleado.rentaAnual)}`,
        `Q ${fmt(empleado.deducciones)}`,
        `Q ${fmt(empleado.rentaImponible)}`,
        `Q ${fmt(empleado.isrCalculado)}`,
        `Q ${fmt(empleado.isrRetenido)}`,
        `Q ${fmt(empleado.diferencia)}`,
        empleado.estado
      ];

      let x = left;
      for (let i = 0; i < values.length; i++) {
        doc.text(values[i], x + 3, y + 3, { width: widths[i] - 3 });
        x += widths[i];
      }
      y += 14;
    }

    doc.fontSize(7.5).font("Helvetica").fillColor("#94a3b8")
      .text(`Generado el ${new Date().toLocaleDateString("es-GT")} - InnovaCode HR - Año fiscal ${anio}`, left, doc.page.height - 28, {
        width: pageW - 80,
        align: "center"
      });

    doc.end();
  } catch (error) {
    console.error("Error en getIsrReportePDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error generando PDF del reporte ISR", error: error.message });
    }
  }
}

export async function getIsrFacturaPDF(req, res) {
  try {
    const anio           = Number(req.query.anio) || new Date().getFullYear();
    const departamentoId = req.query.departamentoId || null;
    const empleadoId     = req.query.empleadoId || null;

    const { sql, binds } = buildIsrQuery({ anio, departamentoId, empleadoId });
    const empResult = await executeQuery(sql, binds);
    const rawRows   = empResult.rows;

    const hayIsrEnDB = rawRows.some(r => Number(r.ISR_RETENIDO_DB) > 0);

    const empleados = rawRows.map(r => buildEmpleadoIsr(r, hayIsrEnDB));

    if (empleados.length === 0) {
      return res.status(404).json({ message: "No se encontraron datos ISR para generar el formato SAT-1901" });
    }

    // ── Armar PDF ─────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 0, size: "A4", layout: "portrait" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sat_1901_isr_${anio}${empleadoId ? `_empleado_${empleadoId}` : ""}.pdf"`
    );
    doc.pipe(res);

    empleados.forEach((empleado, index) => {
      if (index > 0) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
      drawSatIsrPage(doc, empleado, anio, index + 1, empleados.length);
      doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
      drawSatIsrSecondPage(doc, empleado, anio);
    });

    doc.end();
  } catch (error) {
    console.error("Error en getIsrFacturaPDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error generando PDF de la factura ISR", error: error.message });
    }
  }
}

// ─── Tramos ISR estáticos (Decreto 10-2012) ───────────────────────────────────
// GET /api/reportes/isr/constancia/pdf?anio=2026&empleadoId=1
// Genera una constancia simple de retencion ISR con apariencia fiscal.
export async function getIsrConstanciaPDF(req, res) {
  try {
    const anio = Number(req.query.anio || req.query.anioFiscal) || new Date().getFullYear();
    const departamentoId = req.query.departamentoId || null;
    const empleadoId = req.query.empleadoId || null;

    const { sql, binds } = buildIsrQuery({ anio, departamentoId, empleadoId });
    const empResult = await executeQuery(sql, binds);
    const rawRows = empResult.rows;

    if (rawRows.length === 0) {
      return res.status(404).json({ message: "No se encontraron datos ISR para generar la constancia" });
    }

    const hayIsrEnDB = rawRows.some(r => Number(r.ISR_RETENIDO_DB) > 0);
    const empleados = rawRows.map(r => buildEmpleadoIsr(r, hayIsrEnDB));
    const doc = new PDFDocument({ margin: 0, size: "A4", layout: "portrait" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="constancia_isr_${anio}${empleadoId ? `_empleado_${empleadoId}` : ""}.pdf"`
    );
    doc.pipe(res);

    empleados.forEach((empleado, index) => {
      if (index > 0) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
      drawIsrConstanciaPage(doc, empleado, anio, index + 1, empleados.length);
    });

    doc.end();
  } catch (error) {
    console.error("Error en getIsrConstanciaPDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error generando constancia ISR", error: error.message });
    }
  }
}

function tramosIsrGt(anio) {
  return [
    { descripcion: "Hasta Q 300,000",       valor: "5%" },
    { descripcion: "Excedente Q 300,000",    valor: "7%" },
    { descripcion: "Crédito IVA facturas",   valor: "Deducible" },
    { descripcion: "IGSS laboral (4.83%)",   valor: "Deducible" },
    { descripcion: "Fecha declaración",      valor: `Marzo ${anio + 1}` }
  ];
}
