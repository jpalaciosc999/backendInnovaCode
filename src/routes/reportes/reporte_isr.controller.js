import PDFDocument from "pdfkit";
import { executeQuery } from "../../config/db.js";

// ─── Constantes ISR Guatemala — Decreto 10-2012 Régimen Opcional Simplificado ────
// Gastos deducibles fijos: Q 12,000 anuales (Art. 72 — Relación de dependencia)
// Ejemplo verificado: Q 66,000 renta − Q 12,000 deducciones = Q 54,000 → ISR Q 2,700
const GASTOS_DEDUCIBLES_ANUALES = 12000;
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
function buildIsrQuery({ anio, departamentoId }) {
  const binds = { anio: Number(anio) };
  const outerConditions = [];

  if (departamentoId) {
    outerConditions.push("E.DEP_ID = :departamentoId");
    binds.departamentoId = Number(departamentoId);
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
        -- ISR retenido real buscado por nombre del tipo de descuento
        SELECT
          N.EMP_ID,
          SUM(DET.DET_MONTO) AS ISR_RETENIDO_DB
        FROM EMP_NOMINA_DETALLE DET
        JOIN EMP_NOMINA     N   ON N.NOM_ID   = DET.NOM_ID
        JOIN EMP_PERIODO    PER ON PER.PER_ID = N.PER_ID
        JOIN EMP_DESCUENTO  DSC ON DSC.TDS_ID = DET.TDS_ID
        WHERE EXTRACT(YEAR FROM PER.PER_FECHA_INICIO) = :anio
          AND UPPER(DSC.TDS_NOMBRE) LIKE '%ISR%'
        GROUP BY N.EMP_ID
      )
    SELECT
      E.EMP_ID,
      E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO          AS EMPLEADO,
      UPPER(SUBSTR(E.EMP_NOMBRE, 1, 1)
            || SUBSTR(E.EMP_APELLIDO, 1, 1))         AS INICIALES,
      COALESCE(PUE.PUE_NOMBRE, 'Sin puesto')         AS PUESTO,
      COALESCE(PUE.PUE_SALARIO_BASE, 0)              AS SAL_MENSUAL,
      D.DEP_ID,
      COALESCE(D.DEP_NOMBRE, 'Sin departamento')     AS DEPARTAMENTO,
      COALESCE(RA.RENTA_BRUTA, 0)                    AS RENTA_ANUAL,
      COALESCE(ISR.ISR_RETENIDO_DB, 0)               AS ISR_RETENIDO_DB,
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

    // ── Query principal por empleado ──────────────────────────────────────
    const { sql, binds } = buildIsrQuery({ anio, departamentoId });
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
      const mesesConNomina  = Number(r.MESES_CON_NOMINA ?? 0);
      const rentaAnual      = round2(Number(r.RENTA_ANUAL ?? 0));
      // Gastos deducibles fijos Q 12,000 — Art. 72 Decreto 10-2012
      const deducciones     = GASTOS_DEDUCIBLES_ANUALES;
      const rentaImponible  = round2(Math.max(0, rentaAnual - deducciones));
      const isrCalculado    = calcularISR(rentaImponible);
      const isrMensual      = round2(isrCalculado / 12);
      const isrRetenido     = hayIsrEnDB
        ? round2(Number(r.ISR_RETENIDO_DB ?? 0))
        : isrCalculado;   // fallback: asumir retención correcta si no hay registros
      const diferencia      = round2(isrCalculado - isrRetenido);
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
        deducciones,
        rentaImponible,
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
    const anio           = Number(req.query.anio) || new Date().getFullYear();
    const departamentoId = req.query.departamentoId || null;

    const { sql, binds } = buildIsrQuery({ anio, departamentoId });
    const empResult = await executeQuery(sql, binds);
    const rawRows   = empResult.rows;

    const hayIsrEnDB = rawRows.some(r => Number(r.ISR_RETENIDO_DB) > 0);

    const empleados = rawRows.map(r => {
      const mesesConNomina  = Number(r.MESES_CON_NOMINA ?? 0);
      const rentaAnual      = round2(Number(r.RENTA_ANUAL ?? 0));
      const deducciones     = GASTOS_DEDUCIBLES_ANUALES;
      const rentaImponible  = round2(Math.max(0, rentaAnual - deducciones));
      const isrCalculado    = calcularISR(rentaImponible);
      const isrMensual      = round2(isrCalculado / 12);
      const isrRetenido     = hayIsrEnDB
        ? round2(Number(r.ISR_RETENIDO_DB ?? 0))
        : isrCalculado;
      const diferencia      = round2(isrCalculado - isrRetenido);
      const salMensual      = Number(r.SAL_MENSUAL) > 0
        ? round2(Number(r.SAL_MENSUAL))
        : (mesesConNomina > 0 ? round2(rentaAnual / mesesConNomina) : 0);

      return {
        empleado: r.EMPLEADO, iniciales: r.INICIALES, puesto: r.PUESTO,
        departamento: r.DEPARTAMENTO,
        salMensual, salAnual: round2(salMensual * 12),
        rentaAnual, deducciones, rentaImponible,
        isrCalculado, isrRetenido, diferencia,
        isrMensual, isrAnual: isrCalculado,
        baseImponible: rentaImponible,
        estado: isrCalculado > 0 ? estadoISR(isrCalculado, isrRetenido) : "No afecto"
      };
    });

    const totalRentaImponible = round2(empleados.reduce((s, e) => s + e.rentaImponible, 0));
    const totalIsrRetenido    = round2(empleados.reduce((s, e) => s + e.isrRetenido,    0));
    const afectos             = empleados.filter(e => e.isrCalculado > 0).length;
    const noAfectos           = empleados.length - afectos;

    // ── Armar PDF ─────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reporte_isr_${anio}.pdf"`
    );
    doc.pipe(res);

    const PAGE_W = doc.page.width;
    const LEFT   = 40;
    const INDIGO = "#4338ca";
    const DARK   = "#0f172a";
    const MUTED  = "#64748b";
    const BORDER = "#e2e8f0";

    // Encabezado
    doc.rect(LEFT, 30, PAGE_W - 80, 52).fill(INDIGO);
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#ffffff")
      .text("Reporte ISR Anual", LEFT + 12, 40);
    doc.fontSize(9).font("Helvetica").fillColor("#c7d2fe")
      .text(
        `Retenciones acumuladas · Declaración anual SAT · Año ${anio}`,
        LEFT + 12, 60
      );

    // Tarjetas resumen
    const cardY = 94;
    const cardW = (PAGE_W - 80 - 18) / 4;
    const cards = [
      { label: "Total renta imponible",  value: `Q ${fmt(totalRentaImponible)}`, color: "#1d4ed8" },
      { label: "ISR retenido acumulado", value: `Q ${fmt(totalIsrRetenido)}`,    color: "#b91c1c" },
      { label: "Empleados afectos",      value: String(afectos),                 color: "#b45309" },
      { label: "Empleados no afectos",   value: String(noAfectos),               color: "#15803d" }
    ];
    cards.forEach((c, i) => {
      const cx = LEFT + i * (cardW + 6);
      doc.roundedRect(cx, cardY, cardW, 48, 4).stroke(BORDER);
      doc.fontSize(8).font("Helvetica").fillColor(MUTED)
        .text(c.label, cx + 8, cardY + 8, { width: cardW - 16 });
      doc.fontSize(13).font("Helvetica-Bold").fillColor(c.color)
        .text(c.value, cx + 8, cardY + 24, { width: cardW - 16 });
    });

    // Tramos ISR
    const tramosY = cardY + 62;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
      .text("Tramos ISR Guatemala — Decreto 10-2012", LEFT, tramosY);

    const tramos = tramosIsrGt(anio);
    let ty = tramosY + 14;
    for (const t of tramos) {
      doc.fontSize(8.5).font("Helvetica").fillColor("#374151")
        .text(t.descripcion, LEFT, ty)
        .font("Helvetica-Bold")
        .text(t.valor, LEFT + 200, ty);
      ty += 13;
    }

    // Tabla de empleados
    const tableY = ty + 12;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
      .text("Detalle por empleado", LEFT, tableY);

    const cols  = ["Empleado","Departamento","Renta anual","Deducciones","Renta imponible","ISR calculado","ISR retenido","Diferencia","Estado"];
    const widths = [140, 110, 80, 80, 90, 82, 82, 68, 62];
    let ey = tableY + 14;

    // Encabezado tabla
    doc.rect(LEFT, ey, widths.reduce((a,b)=>a+b,0), 16).fill("#f1f5f9");
    doc.fillColor("#374151").fontSize(7.5).font("Helvetica-Bold");
    let ex = LEFT;
    for (let i = 0; i < cols.length; i++) {
      doc.text(cols[i], ex + 3, ey + 4, { width: widths[i] - 3 });
      ex += widths[i];
    }
    ey += 16;

    // Filas
    doc.fillColor(DARK).font("Helvetica").fontSize(7.5);
    for (const e of empleados) {
      if (ey + 14 > doc.page.height - 40) {
        doc.addPage({ size: "A4", layout: "landscape" });
        ey = 40;
      }
      const vals = [
        e.empleado, e.departamento,
        `Q ${fmt(e.rentaAnual)}`, `Q ${fmt(e.deducciones)}`,
        `Q ${fmt(e.rentaImponible)}`, `Q ${fmt(e.isrCalculado)}`,
        `Q ${fmt(e.isrRetenido)}`, `Q ${fmt(e.diferencia)}`,
        e.estado
      ];
      ex = LEFT;
      for (let i = 0; i < vals.length; i++) {
        doc.text(vals[i], ex + 3, ey + 3, { width: widths[i] - 3 });
        ex += widths[i];
      }
      ey += 14;
    }

    // Pie de página
    doc.fontSize(7.5).font("Helvetica").fillColor("#94a3b8")
      .text(
        `Generado el ${new Date().toLocaleDateString("es-GT")} · InnovaCode HR · Año fiscal ${anio}`,
        LEFT, doc.page.height - 28,
        { width: PAGE_W - 80, align: "center" }
      );

    doc.end();
  } catch (error) {
    console.error("Error en getIsrReportePDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error generando PDF del reporte ISR", error: error.message });
    }
  }
}

// ─── Tramos ISR estáticos (Decreto 10-2012) ───────────────────────────────────
function tramosIsrGt(anio) {
  return [
    { descripcion: "Hasta Q 300,000",       valor: "5%" },
    { descripcion: "Excedente Q 300,000",    valor: "7%" },
    { descripcion: "Crédito IVA facturas",   valor: "Deducible" },
    { descripcion: "IGSS laboral (4.83%)",   valor: "Deducible" },
    { descripcion: "Fecha declaración",      valor: `Marzo ${anio + 1}` }
  ];
}
