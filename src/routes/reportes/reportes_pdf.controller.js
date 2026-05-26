import PDFDocument from "pdfkit";
import { executeQuery } from "../../config/db.js";

const IGSS_LABORAL_RATE = 0.0483;
const DIAS_VACACIONES_ANIO = 15;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function fmtNumber(value) {
  return toNumber(value).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtQ(value) {
  return `Q ${fmtNumber(value)}`;
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseYear(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 1900 ? parsed : new Date().getFullYear();
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isoDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function diffYears(fromIso, to = new Date()) {
  if (!fromIso) return 0;
  const from = new Date(`${fromIso}T00:00:00`);
  if (Number.isNaN(from.getTime())) return 0;
  let years = to.getFullYear() - from.getFullYear();
  const anniversaryPassed =
    to.getMonth() > from.getMonth() ||
    (to.getMonth() === from.getMonth() && to.getDate() >= from.getDate());
  if (!anniversaryPassed) years -= 1;
  return Math.max(0, years);
}

function monthsInRange(hireIso, startDate, endDate, capDate = new Date()) {
  if (!hireIso) return 0;
  const hire = new Date(`${hireIso}T00:00:00`);
  if (Number.isNaN(hire.getTime()) || hire > endDate) return 0;

  const start = hire > startDate ? hire : startDate;
  const effectiveEnd = capDate < endDate ? capDate : endDate;
  if (start > effectiveEnd) return 0;

  const months =
    (effectiveEnd.getFullYear() - start.getFullYear()) * 12 +
    effectiveEnd.getMonth() - start.getMonth() + 1;
  return Math.max(0, Math.min(12, months));
}

function bonusPeriod(tipo, anio) {
  if (tipo === "bono14" || tipo === "bono_14") {
    return {
      label: `Bono 14 ${anio}`,
      start: new Date(anio - 1, 6, 1),
      end: new Date(anio, 5, 30),
      payDate: `Primera quincena de julio ${anio}`
    };
  }

  return {
    label: `Aguinaldo ${anio}`,
    start: new Date(anio - 1, 11, 1),
    end: new Date(anio, 10, 30),
    payDate: `Primera quincena de diciembre ${anio}`
  };
}

function pdfFilename(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function sendTabularPdf(res, { title, subtitle, filename, summary = [], columns, rows }) {
  const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
  const pageW = doc.page.width;
  const left = 36;
  const usableW = pageW - left * 2;
  const headerColor = "#0f766e";
  const dark = "#0f172a";
  const muted = "#64748b";
  const light = "#f8fafc";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  doc.rect(left, 28, usableW, 52).fill(headerColor);
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#ffffff").text(title, left + 12, 40);
  doc.font("Helvetica").fontSize(9).fillColor("#ccfbf1").text(subtitle || "", left + 12, 60, {
    width: usableW - 24
  });

  let y = 94;
  if (summary.length > 0) {
    const cardW = (usableW - 8 * (summary.length - 1)) / summary.length;
    summary.forEach((item, index) => {
      const x = left + index * (cardW + 8);
      doc.roundedRect(x, y, cardW, 44, 4).stroke("#e2e8f0");
      doc.font("Helvetica").fontSize(7.5).fillColor(muted).text(item.label, x + 7, y + 8, {
        width: cardW - 14
      });
      doc.font("Helvetica-Bold").fontSize(12).fillColor(item.color || dark).text(String(item.value), x + 7, y + 23, {
        width: cardW - 14
      });
    });
    y += 60;
  }

  const totalW = columns.reduce((sum, col) => sum + col.width, 0);

  function drawHeader() {
    doc.rect(left, y, totalW, 17).fill("#e2e8f0");
    let x = left;
    columns.forEach((col) => {
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#334155").text(col.header, x + 3, y + 5, {
        width: col.width - 6
      });
      x += col.width;
    });
    y += 17;
  }

  drawHeader();

  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor(muted).text("Sin registros para los filtros aplicados.", left, y + 14, {
      width: usableW,
      align: "center"
    });
  }

  rows.forEach((row, rowIndex) => {
    if (y + 16 > doc.page.height - 34) {
      doc.addPage({ size: "A4", layout: "landscape" });
      y = 36;
      drawHeader();
    }

    if (rowIndex % 2 === 1) {
      doc.rect(left, y, totalW, 16).fill(light);
    }

    let x = left;
    columns.forEach((col) => {
      const value = col.format ? col.format(row[col.key], row) : row[col.key];
      doc.font("Helvetica").fontSize(7).fillColor(dark).text(value ?? "-", x + 3, y + 4, {
        width: col.width - 6
      });
      x += col.width;
    });
    y += 16;
  });

  doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text(
    `Generado el ${new Date().toLocaleDateString("es-GT")} - InnovaCode HR`,
    left,
    doc.page.height - 24,
    { width: usableW, align: "center" }
  );

  doc.end();
}

async function fetchActiveEmployees({ departamentoId = null, sedeId = null } = {}) {
  const result = await executeQuery(
    `
      SELECT
        E.EMP_ID,
        E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO AS EMPLEADO,
        TO_CHAR(E.EMP_FECHA_CONTRATACION, 'YYYY-MM-DD') AS FECHA_CONTRATACION,
        NVL(D.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
        NVL(S.SED_NOMBRE, 'Sin sede') AS SEDE,
        NVL(P.PUE_NOMBRE, 'Sin puesto') AS PUESTO,
        NVL(P.PUE_SALARIO_BASE, 0) AS SALARIO_BASE
      FROM EMP_EMPLEADO E
      LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
      LEFT JOIN EMP_SEDE S ON S.SED_ID = E.SED_ID
      LEFT JOIN EMP_PUESTO P ON P.PUE_ID = E.PUE_ID
      WHERE NVL(E.EMP_ESTADO, 'A') = 'A'
        AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        AND (:sedeId IS NULL OR E.SED_ID = :sedeId)
      ORDER BY D.DEP_NOMBRE, E.EMP_APELLIDO, E.EMP_NOMBRE
    `,
    { departamentoId, sedeId }
  );

  return result.rows;
}

export async function getAguinaldoPDF(req, res) {
  try {
    const tipo = normalize(req.query.tipo).includes("BONO") ? "bono14" : "aguinaldo";
    const anio = parseYear(req.query.anio);
    const departamentoId = parseIntOrNull(req.query.departamentoId);
    const estadoFiltro = req.query.estado ? String(req.query.estado) : null;
    const periodo = bonusPeriod(tipo, anio);
    const employees = await fetchActiveEmployees({ departamentoId });
    const today = new Date();

    let rows = employees.map((emp) => {
      const mesesActuales = monthsInRange(emp.FECHA_CONTRATACION, periodo.start, periodo.end, today);
      const mesesTotales = monthsInRange(emp.FECHA_CONTRATACION, periodo.start, periodo.end, periodo.end);
      const salario = toNumber(emp.SALARIO_BASE);
      const proyeccion = round2((salario / 12) * mesesTotales);
      const provision = round2((salario / 12) * mesesActuales);
      const estado =
        mesesTotales === 12 && mesesActuales >= 12 ? "Completado" :
        mesesActuales > 0 ? "En curso" : "Pendiente";

      return {
        ...emp,
        MESES_LABORADOS: mesesActuales,
        PROVISION_ACUM: provision,
        PROYECCION_TOTAL: proyeccion,
        ESTADO: estado
      };
    });

    if (estadoFiltro) {
      rows = rows.filter((row) => row.ESTADO === estadoFiltro);
    }

    sendTabularPdf(res, {
      title: `Reporte de ${periodo.label}`,
      subtitle: `Periodo legal ${periodo.start.toLocaleDateString("es-GT")} al ${periodo.end.toLocaleDateString("es-GT")} - Pago: ${periodo.payDate}`,
      filename: `${pdfFilename(`reporte-${periodo.label}`)}.pdf`,
      summary: [
        { label: "Empleados con derecho", value: rows.filter((r) => r.PROYECCION_TOTAL > 0).length },
        { label: "Provision acumulada", value: fmtQ(rows.reduce((s, r) => s + r.PROVISION_ACUM, 0)), color: "#0369a1" },
        { label: "Proyeccion total", value: fmtQ(rows.reduce((s, r) => s + r.PROYECCION_TOTAL, 0)), color: "#b45309" }
      ],
      columns: [
        { header: "Empleado", key: "EMPLEADO", width: 150 },
        { header: "Departamento", key: "DEPARTAMENTO", width: 115 },
        { header: "Puesto", key: "PUESTO", width: 110 },
        { header: "Salario", key: "SALARIO_BASE", width: 75, format: fmtQ },
        { header: "Meses", key: "MESES_LABORADOS", width: 48 },
        { header: "Provision", key: "PROVISION_ACUM", width: 85, format: fmtQ },
        { header: "Proyeccion", key: "PROYECCION_TOTAL", width: 90, format: fmtQ },
        { header: "Estado", key: "ESTADO", width: 80 }
      ],
      rows
    });
  } catch (error) {
    console.error("Error en getAguinaldoPDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error generando PDF de aguinaldo", error: error.message });
  }
}

export async function getVacacionesPDF(req, res) {
  try {
    const departamentoId = parseIntOrNull(req.query.departamentoId);
    const sedeId = parseIntOrNull(req.query.sedeId);
    const antiguedadMin = parseIntOrNull(req.query.antiguedadMin);
    const estadoFiltro = req.query.estado ? String(req.query.estado) : null;
    const employees = await fetchActiveEmployees({ departamentoId, sedeId });

    const tomadasResult = await executeQuery(
      `
        SELECT C.EMP_ID, NVL(SUM(NVL(C.CTL_HORAS, 0)), 0) AS DIAS_DISFRUTADOS
        FROM EMP_CONTROL_LABORAL C
        WHERE UPPER(NVL(C.CTL_MOTIVO, '')) LIKE '%VACACION%'
        GROUP BY C.EMP_ID
      `
    );
    const tomadas = new Map(tomadasResult.rows.map((row) => [Number(row.EMP_ID), toNumber(row.DIAS_DISFRUTADOS)]));

    let rows = employees.map((emp) => {
      const anios = diffYears(emp.FECHA_CONTRATACION);
      const acumulados = anios * DIAS_VACACIONES_ANIO;
      const disfrutados = Math.min(acumulados, round2(tomadas.get(Number(emp.EMP_ID)) || 0));
      const pendientes = Math.max(0, round2(acumulados - disfrutados));
      const estado =
        anios === 0 ? "En proceso" :
        pendientes >= DIAS_VACACIONES_ANIO * 2 ? "Alerta" :
        pendientes >= DIAS_VACACIONES_ANIO ? "Pendiente" : "Al dia";

      return {
        ...emp,
        ANTIGUEDAD_ANIOS: anios,
        DIAS_ACUMULADOS: acumulados,
        DIAS_DISFRUTADOS: disfrutados,
        DIAS_PENDIENTES: pendientes,
        ESTADO: estado
      };
    });

    if (antiguedadMin) rows = rows.filter((row) => row.ANTIGUEDAD_ANIOS >= antiguedadMin);
    if (estadoFiltro) rows = rows.filter((row) => normalize(row.ESTADO) === normalize(estadoFiltro));

    sendTabularPdf(res, {
      title: "Reporte de Vacaciones",
      subtitle: "Dias acumulados, disfrutados y pendientes segun fecha de contratacion y control laboral",
      filename: "reporte-vacaciones.pdf",
      summary: [
        { label: "Empleados", value: rows.length },
        { label: "Dias acumulados", value: fmtNumber(rows.reduce((s, r) => s + r.DIAS_ACUMULADOS, 0)) },
        { label: "Dias pendientes", value: fmtNumber(rows.reduce((s, r) => s + r.DIAS_PENDIENTES, 0)), color: "#b45309" },
        { label: "Alertas", value: rows.filter((r) => r.ESTADO === "Alerta").length, color: "#b91c1c" }
      ],
      columns: [
        { header: "Empleado", key: "EMPLEADO", width: 155 },
        { header: "Departamento", key: "DEPARTAMENTO", width: 115 },
        { header: "Sede", key: "SEDE", width: 90 },
        { header: "Antiguedad", key: "ANTIGUEDAD_ANIOS", width: 70 },
        { header: "Acumulados", key: "DIAS_ACUMULADOS", width: 75, format: fmtNumber },
        { header: "Disfrutados", key: "DIAS_DISFRUTADOS", width: 75, format: fmtNumber },
        { header: "Pendientes", key: "DIAS_PENDIENTES", width: 75, format: fmtNumber },
        { header: "Estado", key: "ESTADO", width: 80 }
      ],
      rows
    });
  } catch (error) {
    console.error("Error en getVacacionesPDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error generando PDF de vacaciones", error: error.message });
  }
}

export async function getDescuentosPDF(req, res) {
  try {
    const departamentoId = parseIntOrNull(req.query.departamentoId);
    const estadoFiltro = req.query.estado ? String(req.query.estado) : null;
    const result = await executeQuery(
      `
        WITH ULTIMA_NOMINA AS (
          SELECT N.*, ROW_NUMBER() OVER (PARTITION BY N.EMP_ID ORDER BY N.NOM_ID DESC) AS RN
          FROM EMP_NOMINA N
        ),
        DET AS (
          SELECT
            D.NOM_ID,
            SUM(CASE WHEN UPPER(NVL(T.TDS_NOMBRE, '')) LIKE '%IGSS%' THEN NVL(D.DET_MONTO, 0) ELSE 0 END) AS IGSS_LABORAL,
            SUM(CASE WHEN UPPER(NVL(T.TDS_NOMBRE, '')) LIKE '%ISR%' THEN NVL(D.DET_MONTO, 0) ELSE 0 END) AS ISR_RETENIDO,
            SUM(CASE WHEN UPPER(NVL(T.TDS_NOMBRE, '')) LIKE '%PREST%' OR UPPER(NVL(T.TDS_NOMBRE, '')) LIKE '%CUOTA%' THEN NVL(D.DET_MONTO, 0) ELSE 0 END) AS CUOTA_PRESTAMO,
            SUM(CASE WHEN T.TDS_ID IS NOT NULL
                  AND UPPER(NVL(T.TDS_NOMBRE, '')) NOT LIKE '%IGSS%'
                  AND UPPER(NVL(T.TDS_NOMBRE, '')) NOT LIKE '%ISR%'
                  AND UPPER(NVL(T.TDS_NOMBRE, '')) NOT LIKE '%PREST%'
                  AND UPPER(NVL(T.TDS_NOMBRE, '')) NOT LIKE '%CUOTA%'
                THEN NVL(D.DET_MONTO, 0) ELSE 0 END) AS OTROS_DESCUENTOS
          FROM EMP_NOMINA_DETALLE D
          LEFT JOIN EMP_DESCUENTO T ON T.TDS_ID = D.TDS_ID
          GROUP BY D.NOM_ID
        )
        SELECT
          E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO AS EMPLEADO,
          NVL(DEP.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
          NVL(N.NOM_TOTAL_INGRESOS, NVL(P.PUE_SALARIO_BASE, 0)) AS SALARIO_BRUTO,
          NVL(D.IGSS_LABORAL, 0) AS IGSS_LABORAL,
          NVL(D.ISR_RETENIDO, 0) AS ISR_RETENIDO,
          NVL(D.CUOTA_PRESTAMO, 0) AS CUOTA_PRESTAMO,
          NVL(D.OTROS_DESCUENTOS, 0) AS OTROS_DESCUENTOS,
          NVL(N.NOM_TOTAL_DESCUENTO, NVL(D.IGSS_LABORAL, 0) + NVL(D.ISR_RETENIDO, 0) + NVL(D.CUOTA_PRESTAMO, 0) + NVL(D.OTROS_DESCUENTOS, 0)) AS TOTAL_DESCUENTOS,
          NVL(N.NOM_SALARIO_LIQUIDO, 0) AS SALARIO_LIQUIDO
        FROM EMP_EMPLEADO E
        LEFT JOIN ULTIMA_NOMINA N ON N.EMP_ID = E.EMP_ID AND N.RN = 1
        LEFT JOIN DET D ON D.NOM_ID = N.NOM_ID
        LEFT JOIN EMP_DEPARTAMENTO DEP ON DEP.DEP_ID = E.DEP_ID
        LEFT JOIN EMP_PUESTO P ON P.PUE_ID = E.PUE_ID
        WHERE NVL(E.EMP_ESTADO, 'A') = 'A'
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        ORDER BY DEP.DEP_NOMBRE, E.EMP_APELLIDO, E.EMP_NOMBRE
      `,
      { departamentoId }
    );

    let rows = result.rows.map((row) => {
      const salario = toNumber(row.SALARIO_BRUTO);
      const total = toNumber(row.TOTAL_DESCUENTOS);
      const pct = salario > 0 ? Math.round((total / salario) * 100) : 0;
      const estado = pct > 55 ? "Alerta" : pct > 35 ? "Descuento alto" : "Normal";
      return { ...row, PCT_DESCUENTO: pct, ESTADO: estado };
    });

    if (estadoFiltro) rows = rows.filter((row) => normalize(row.ESTADO) === normalize(estadoFiltro));

    sendTabularPdf(res, {
      title: "Reporte de Descuentos",
      subtitle: "Ultima nomina por empleado con desglose de descuentos registrados",
      filename: "reporte-descuentos.pdf",
      summary: [
        { label: "Empleados", value: rows.length },
        { label: "Total descuentos", value: fmtQ(rows.reduce((s, r) => s + toNumber(r.TOTAL_DESCUENTOS), 0)), color: "#b45309" },
        { label: "IGSS laboral", value: fmtQ(rows.reduce((s, r) => s + toNumber(r.IGSS_LABORAL), 0)), color: "#0369a1" },
        { label: "ISR retenido", value: fmtQ(rows.reduce((s, r) => s + toNumber(r.ISR_RETENIDO), 0)), color: "#b91c1c" }
      ],
      columns: [
        { header: "Empleado", key: "EMPLEADO", width: 145 },
        { header: "Departamento", key: "DEPARTAMENTO", width: 105 },
        { header: "Bruto", key: "SALARIO_BRUTO", width: 70, format: fmtQ },
        { header: "IGSS", key: "IGSS_LABORAL", width: 65, format: fmtQ },
        { header: "ISR", key: "ISR_RETENIDO", width: 65, format: fmtQ },
        { header: "Prestamo", key: "CUOTA_PRESTAMO", width: 75, format: fmtQ },
        { header: "Otros", key: "OTROS_DESCUENTOS", width: 65, format: fmtQ },
        { header: "Total desc.", key: "TOTAL_DESCUENTOS", width: 75, format: fmtQ },
        { header: "%", key: "PCT_DESCUENTO", width: 35, format: (v) => `${v}%` },
        { header: "Estado", key: "ESTADO", width: 75 }
      ],
      rows
    });
  } catch (error) {
    console.error("Error en getDescuentosPDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error generando PDF de descuentos", error: error.message });
  }
}

export async function getHorasExtraPDF(req, res) {
  try {
    const fechaInicio = isoDate(req.query.fechaInicio);
    const fechaFin = isoDate(req.query.fechaFin);
    const departamentoId = parseIntOrNull(req.query.departamentoId);

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: "Los parametros fechaInicio y fechaFin son requeridos" });
    }

    const result = await executeQuery(
      `
        WITH MARCAJES AS (
          SELECT
            E.EMP_ID,
            E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO AS EMPLEADO,
            NVL(D.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
            NVL(P.PUE_SALARIO_BASE, 0) AS SALARIO_BASE,
            CASE
              WHEN M.MAR_ENTRADA IS NOT NULL AND M.MAR_SALIDA IS NOT NULL THEN
                GREATEST(0, (M.MAR_SALIDA - M.MAR_ENTRADA) * 24 -
                  NVL((TO_NUMBER(SUBSTR(H.HOR_HORA_FIN, 1, 2)) * 60 + TO_NUMBER(SUBSTR(H.HOR_HORA_FIN, 4, 2)) -
                       TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 1, 2)) * 60 - TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 4, 2))) / 60, 8)
                )
              ELSE 0
            END AS EXTRA_HORAS
          FROM EMP_MARCAJE M
          JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
          LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
          LEFT JOIN EMP_PUESTO P ON P.PUE_ID = E.PUE_ID
          LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
          WHERE M.MAR_FECHA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')
            AND M.MAR_FECHA < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        )
        SELECT
          EMP_ID,
          EMPLEADO,
          DEPARTAMENTO,
          ROUND(MAX(SALARIO_BASE) / 240, 2) AS SALARIO_HORA,
          ROUND(SUM(EXTRA_HORAS), 2) AS HORAS_EXTRA
        FROM MARCAJES
        GROUP BY EMP_ID, EMPLEADO, DEPARTAMENTO
        ORDER BY SUM(EXTRA_HORAS) DESC, EMPLEADO
      `,
      { fechaInicio, fechaFin, departamentoId }
    );

    const rows = result.rows.filter((row) => toNumber(row.HORAS_EXTRA) > 0).map((row) => {
      const horasExtra = toNumber(row.HORAS_EXTRA);
      const salarioHora = toNumber(row.SALARIO_HORA);

      return {
        ...row,
        TOTAL_A_PAGAR: round2(horasExtra * salarioHora * 1.5),
        ALERTA: horasExtra > 20 ? "Si" : "No"
      };
    });

    sendTabularPdf(res, {
      title: "Reporte de Horas Extra",
      subtitle: `Periodo ${fechaInicio} al ${fechaFin}`,
      filename: `reporte-horas-extra-${fechaInicio}_${fechaFin}.pdf`,
      summary: [
        { label: "Empleados", value: rows.length },
        { label: "Total horas", value: fmtNumber(rows.reduce((s, r) => s + toNumber(r.HORAS_EXTRA), 0)) },
        { label: "Costo total", value: fmtQ(rows.reduce((s, r) => s + toNumber(r.TOTAL_A_PAGAR), 0)), color: "#b45309" },
        { label: "Alertas >20h", value: rows.filter((r) => r.ALERTA === "Si").length, color: "#b91c1c" }
      ],
      columns: [
        { header: "Empleado", key: "EMPLEADO", width: 170 },
        { header: "Departamento", key: "DEPARTAMENTO", width: 135 },
        { header: "Salario hora", key: "SALARIO_HORA", width: 90, format: fmtQ },
        { header: "Horas extra", key: "HORAS_EXTRA", width: 90, format: fmtNumber },
        { header: "Total a pagar", key: "TOTAL_A_PAGAR", width: 100, format: fmtQ },
        { header: "Alerta", key: "ALERTA", width: 70 }
      ],
      rows
    });
  } catch (error) {
    console.error("Error en getHorasExtraPDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error generando PDF de horas extra", error: error.message });
  }
}

export async function getLiquidacionPDF(req, res) {
  try {
    const fechaInicio = isoDate(req.query.fechaInicio);
    const fechaFin = isoDate(req.query.fechaFin);
    const departamentoId = parseIntOrNull(req.query.departamentoId);
    const empleadoId = parseIntOrNull(req.query.empleadoId);
    const motivoSalida = req.query.motivoSalida ? String(req.query.motivoSalida) : null;

    const result = await executeQuery(
      `
        SELECT
          E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO AS EMPLEADO,
          NVL(D.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
          NVL(L.LIQ_TIPO_RETIRO, 'SIN MOTIVO') AS MOTIVO_SALIDA,
          TO_CHAR(L.LIQ_FECHA_SALIDA, 'YYYY-MM-DD') AS FECHA_SALIDA,
          NVL(L.LIQ_INDEMNIZACION, 0) AS INDEMNIZACION,
          NVL(L.LIQ_VACACIONES_PAGADAS, 0) AS VACACIONES,
          NVL(L.LIQ_AGUINALDO_PROPORCIONAL, 0) AS AGUINALDO,
          NVL(L.LIQ_BONO14_PROPORCIONAL, 0) AS BONO14,
          NVL(L.LIQ_LIQUIDACION, 0) AS TOTAL_LIQUIDACION
        FROM EMP_LIQUIDACIONES L
        JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
        LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
        WHERE (:fechaInicio IS NULL OR L.LIQ_FECHA_SALIDA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD'))
          AND (:fechaFin IS NULL OR L.LIQ_FECHA_SALIDA < TO_DATE(:fechaFin, 'YYYY-MM-DD') + 1)
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
          AND (:motivoSalida IS NULL OR UPPER(L.LIQ_TIPO_RETIRO) = UPPER(:motivoSalida))
        ORDER BY L.LIQ_FECHA_SALIDA DESC, E.EMP_APELLIDO, E.EMP_NOMBRE
      `,
      { fechaInicio, fechaFin, departamentoId, empleadoId, motivoSalida }
    );

    const rows = result.rows;

    sendTabularPdf(res, {
      title: "Reporte de Liquidaciones",
      subtitle: fechaInicio && fechaFin ? `Periodo ${fechaInicio} al ${fechaFin}` : "Historico de liquidaciones",
      filename: "reporte-liquidacion.pdf",
      summary: [
        { label: "Liquidaciones", value: rows.length },
        { label: "Total liquidado", value: fmtQ(rows.reduce((s, r) => s + toNumber(r.TOTAL_LIQUIDACION), 0)), color: "#b91c1c" },
        { label: "Indemnizacion", value: fmtQ(rows.reduce((s, r) => s + toNumber(r.INDEMNIZACION), 0)) },
        { label: "Vacaciones", value: fmtQ(rows.reduce((s, r) => s + toNumber(r.VACACIONES), 0)) }
      ],
      columns: [
        { header: "Empleado", key: "EMPLEADO", width: 145 },
        { header: "Departamento", key: "DEPARTAMENTO", width: 105 },
        { header: "Motivo", key: "MOTIVO_SALIDA", width: 95 },
        { header: "Salida", key: "FECHA_SALIDA", width: 70 },
        { header: "Indemnizacion", key: "INDEMNIZACION", width: 85, format: fmtQ },
        { header: "Vacaciones", key: "VACACIONES", width: 80, format: fmtQ },
        { header: "Aguinaldo", key: "AGUINALDO", width: 80, format: fmtQ },
        { header: "Bono 14", key: "BONO14", width: 75, format: fmtQ },
        { header: "Total", key: "TOTAL_LIQUIDACION", width: 85, format: fmtQ }
      ],
      rows
    });
  } catch (error) {
    console.error("Error en getLiquidacionPDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error generando PDF de liquidacion", error: error.message });
  }
}

export async function getKpiPDF(req, res) {
  try {
    const periodo = req.query.periodo ? String(req.query.periodo) : null;
    const departamentoId = parseIntOrNull(req.query.departamentoId);
    const kpiId = parseIntOrNull(req.query.kpiId);
    const empleadoId = parseIntOrNull(req.query.empleadoId);

    const result = await executeQuery(
      `
        SELECT
          KR.KRE_ID,
          E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO AS EMPLEADO,
          NVL(D.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
          K.KPI_NOMBRE,
          K.KPI_TIPO,
          NVL(K.KPI_VALOR, 0) AS META,
          NVL(KR.KRE_MONTO_TOTAL, 0) AS RESULTADO,
          CASE
            WHEN NVL(KR.KRE_CALCULO, 0) > 0 THEN KR.KRE_CALCULO
            WHEN NVL(K.KPI_VALOR, 0) > 0 THEN ROUND(NVL(KR.KRE_MONTO_TOTAL, 0) / K.KPI_VALOR * 100, 2)
            ELSE 0
          END AS CUMPLIMIENTO,
          TO_CHAR(KR.KRE_FECHA, 'YYYY-MM') AS PERIODO
        FROM EMP_KPI_RESULTADO KR
        JOIN EMP_KPI K ON K.KPI_ID = KR.KPI_ID
        LEFT JOIN EMP_EMPLEADO E ON E.EMP_ID = KR.EMP_ID
        LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
        WHERE (:periodo IS NULL OR TO_CHAR(KR.KRE_FECHA, 'YYYY-MM') = :periodo)
          AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
          AND (:kpiId IS NULL OR K.KPI_ID = :kpiId)
          AND (:empleadoId IS NULL OR E.EMP_ID = :empleadoId)
        ORDER BY KR.KRE_FECHA DESC, K.KPI_NOMBRE, EMPLEADO
      `,
      { periodo, departamentoId, kpiId, empleadoId }
    );

    const rows = result.rows.map((row) => ({
      ...row,
      ESTADO: toNumber(row.CUMPLIMIENTO) >= 100 ? "Superado" : toNumber(row.CUMPLIMIENTO) >= 70 ? "En proceso" : "No alcanzado"
    }));

    const promedio = rows.length
      ? round2(rows.reduce((s, r) => s + toNumber(r.CUMPLIMIENTO), 0) / rows.length)
      : 0;

    sendTabularPdf(res, {
      title: "Reporte KPI",
      subtitle: periodo ? `Periodo ${periodo}` : "Todos los periodos",
      filename: "reporte-kpi.pdf",
      summary: [
        { label: "Registros", value: rows.length },
        { label: "Promedio cumplimiento", value: `${fmtNumber(promedio)}%`, color: "#0369a1" },
        { label: "Superados", value: rows.filter((r) => r.ESTADO === "Superado").length, color: "#15803d" },
        { label: "No alcanzados", value: rows.filter((r) => r.ESTADO === "No alcanzado").length, color: "#b91c1c" }
      ],
      columns: [
        { header: "Empleado", key: "EMPLEADO", width: 145 },
        { header: "Departamento", key: "DEPARTAMENTO", width: 110 },
        { header: "KPI", key: "KPI_NOMBRE", width: 140 },
        { header: "Tipo", key: "KPI_TIPO", width: 70 },
        { header: "Meta", key: "META", width: 65, format: fmtNumber },
        { header: "Resultado", key: "RESULTADO", width: 75, format: fmtNumber },
        { header: "%", key: "CUMPLIMIENTO", width: 55, format: (v) => `${fmtNumber(v)}%` },
        { header: "Estado", key: "ESTADO", width: 85 }
      ],
      rows
    });
  } catch (error) {
    console.error("Error en getKpiPDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error generando PDF de KPI", error: error.message });
  }
}

export async function getIsrProyeccion(req, res) {
  try {
    const periodoId = parseIntOrNull(req.query.per_id ?? req.query.periodoId);

    if (!periodoId) {
      return res.status(400).json({ message: "El parametro per_id o periodoId es requerido" });
    }

    const periodoRes = await executeQuery(
      `
        SELECT
          PER_ID,
          EXTRACT(YEAR FROM PER_FECHA_INICIO) AS ANIO,
          TO_CHAR(PER_FECHA_INICIO, 'YYYY-MM-DD') AS FECHA_INICIO,
          TO_CHAR(PER_FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN
        FROM EMP_PERIODO
        WHERE PER_ID = :periodoId
      `,
      { periodoId }
    );

    if (periodoRes.rows.length === 0) {
      return res.status(404).json({ message: "Periodo no encontrado" });
    }

    const anio = Number(periodoRes.rows[0].ANIO);
    const result = await executeQuery(
      `
        WITH RENTA AS (
          SELECT
            N.EMP_ID,
            SUM(N.NOM_TOTAL_INGRESOS) AS RENTA_ACUMULADA
          FROM EMP_NOMINA N
          JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
          WHERE EXTRACT(YEAR FROM P.PER_FECHA_INICIO) = :anio
            AND P.PER_ID <= :periodoId
          GROUP BY N.EMP_ID
        ),
        ISR AS (
          SELECT
            N.EMP_ID,
            SUM(CASE WHEN UPPER(NVL(D.TDS_NOMBRE, '')) LIKE '%ISR%' THEN NVL(DET.DET_MONTO, 0) ELSE 0 END) AS ISR_RETENIDO
          FROM EMP_NOMINA N
          JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
          LEFT JOIN EMP_NOMINA_DETALLE DET ON DET.NOM_ID = N.NOM_ID
          LEFT JOIN EMP_DESCUENTO D ON D.TDS_ID = DET.TDS_ID
          WHERE EXTRACT(YEAR FROM P.PER_FECHA_INICIO) = :anio
            AND P.PER_ID <= :periodoId
          GROUP BY N.EMP_ID
        )
        SELECT
          E.EMP_ID,
          E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO AS EMPLEADO,
          NVL(DEP.DEP_NOMBRE, 'Sin departamento') AS DEPARTAMENTO,
          NVL(PUE.PUE_NOMBRE, 'Sin puesto') AS PUESTO,
          NVL(PUE.PUE_SALARIO_BASE, 0) AS SALARIO_MENSUAL,
          NVL(R.RENTA_ACUMULADA, 0) AS RENTA_ACUMULADA,
          NVL(I.ISR_RETENIDO, 0) AS ISR_RETENIDO
        FROM EMP_EMPLEADO E
        LEFT JOIN RENTA R ON R.EMP_ID = E.EMP_ID
        LEFT JOIN ISR I ON I.EMP_ID = E.EMP_ID
        LEFT JOIN EMP_DEPARTAMENTO DEP ON DEP.DEP_ID = E.DEP_ID
        LEFT JOIN EMP_PUESTO PUE ON PUE.PUE_ID = E.PUE_ID
        WHERE NVL(E.EMP_ESTADO, 'A') = 'A'
        ORDER BY DEP.DEP_NOMBRE, E.EMP_APELLIDO, E.EMP_NOMBRE
      `,
      { anio, periodoId }
    );

    const empleados = result.rows.map((row) => {
      const salarioMensual = toNumber(row.SALARIO_MENSUAL);
      const rentaProyectada = salarioMensual * 12;
      const igss = rentaProyectada * IGSS_LABORAL_RATE;
      const rentaImponible = Math.max(0, rentaProyectada - igss - 48000 - 12000);
      const isrProyectado = rentaImponible <= 300000
        ? rentaImponible * 0.05
        : 15000 + (rentaImponible - 300000) * 0.07;
      const isrPendiente = Math.max(0, isrProyectado - toNumber(row.ISR_RETENIDO));

      return {
        empId: row.EMP_ID,
        empleado: row.EMPLEADO,
        departamento: row.DEPARTAMENTO,
        puesto: row.PUESTO,
        salarioMensual: round2(salarioMensual),
        rentaAcumulada: round2(row.RENTA_ACUMULADA),
        rentaProyectada: round2(rentaProyectada),
        isrRetenido: round2(row.ISR_RETENIDO),
        isrProyectado: round2(isrProyectado),
        isrPendiente: round2(isrPendiente)
      };
    });

    res.json({
      periodo: periodoRes.rows[0],
      empleados,
      resumen: {
        totalEmpleados: empleados.length,
        totalRentaAcumulada: round2(empleados.reduce((s, e) => s + e.rentaAcumulada, 0)),
        totalIsrProyectado: round2(empleados.reduce((s, e) => s + e.isrProyectado, 0)),
        totalIsrPendiente: round2(empleados.reduce((s, e) => s + e.isrPendiente, 0))
      }
    });
  } catch (error) {
    console.error("Error en getIsrProyeccion:", error);
    res.status(500).json({ message: "Error generando proyeccion ISR", error: error.message });
  }
}

export async function getIsrProyeccionPDF(req, res) {
  const jsonRes = {
    statusCode: 200,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  await getIsrProyeccion(req, jsonRes);

  if (jsonRes.statusCode >= 400) {
    return res.status(jsonRes.statusCode).json(jsonRes.payload);
  }

  const data = jsonRes.payload;
  sendTabularPdf(res, {
    title: "Proyeccion ISR",
    subtitle: `Periodo ${data.periodo.FECHA_INICIO} al ${data.periodo.FECHA_FIN}`,
    filename: `reporte-isr-proyeccion-${data.periodo.PER_ID}.pdf`,
    summary: [
      { label: "Empleados", value: data.resumen.totalEmpleados },
      { label: "Renta acumulada", value: fmtQ(data.resumen.totalRentaAcumulada) },
      { label: "ISR proyectado", value: fmtQ(data.resumen.totalIsrProyectado), color: "#b45309" },
      { label: "ISR pendiente", value: fmtQ(data.resumen.totalIsrPendiente), color: "#b91c1c" }
    ],
    columns: [
      { header: "Empleado", key: "empleado", width: 150 },
      { header: "Departamento", key: "departamento", width: 115 },
      { header: "Puesto", key: "puesto", width: 105 },
      { header: "Salario", key: "salarioMensual", width: 75, format: fmtQ },
      { header: "Renta acum.", key: "rentaAcumulada", width: 85, format: fmtQ },
      { header: "ISR retenido", key: "isrRetenido", width: 85, format: fmtQ },
      { header: "ISR proyect.", key: "isrProyectado", width: 85, format: fmtQ },
      { header: "Pendiente", key: "isrPendiente", width: 85, format: fmtQ }
    ],
    rows: data.empleados
  });
}

export async function getDashboardEjecutivoPDF(req, res) {
  try {
    const fechaInicio = isoDate(req.query.fechaInicio);
    const fechaFin = isoDate(req.query.fechaFin);
    const now = new Date();
    const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const inicio = fechaInicio || defaultStart;
    const fin = fechaFin || defaultEnd;
    const departamentoId = parseIntOrNull(req.query.departamentoId);

    const [empleadosRes, planillaRes, horasRes, liquidacionesRes, puntualidadRes] = await Promise.all([
      executeQuery(
        `
          SELECT COUNT(*) AS TOTAL
          FROM EMP_EMPLEADO E
          WHERE NVL(E.EMP_ESTADO, 'A') = 'A'
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        `,
        { departamentoId }
      ),
      executeQuery(
        `
          SELECT NVL(SUM(N.NOM_TOTAL_INGRESOS), 0) AS TOTAL
          FROM EMP_NOMINA N
          JOIN EMP_PERIODO P ON P.PER_ID = N.PER_ID
          JOIN EMP_EMPLEADO E ON E.EMP_ID = N.EMP_ID
          WHERE P.PER_FECHA_INICIO <= TO_DATE(:fin, 'YYYY-MM-DD')
            AND P.PER_FECHA_FIN >= TO_DATE(:inicio, 'YYYY-MM-DD')
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        `,
        { inicio, fin, departamentoId }
      ),
      executeQuery(
        `
          SELECT NVL(SUM(NVL(C.CTL_HORAS, 0)), 0) AS TOTAL
          FROM EMP_CONTROL_LABORAL C
          JOIN EMP_EMPLEADO E ON E.EMP_ID = C.EMP_ID
          WHERE C.CTL_FECHA_INICIO >= TO_DATE(:inicio, 'YYYY-MM-DD')
            AND C.CTL_FECHA_INICIO < TO_DATE(:fin, 'YYYY-MM-DD') + 1
            AND UPPER(NVL(C.CTL_MOTIVO, '')) LIKE '%HORA%EXTRA%'
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        `,
        { inicio, fin, departamentoId }
      ),
      executeQuery(
        `
          SELECT COUNT(*) AS TOTAL, NVL(SUM(L.LIQ_LIQUIDACION), 0) AS MONTO
          FROM EMP_LIQUIDACIONES L
          JOIN EMP_EMPLEADO E ON E.EMP_ID = L.EMP_ID
          WHERE L.LIQ_FECHA_SALIDA >= TO_DATE(:inicio, 'YYYY-MM-DD')
            AND L.LIQ_FECHA_SALIDA < TO_DATE(:fin, 'YYYY-MM-DD') + 1
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        `,
        { inicio, fin, departamentoId }
      ),
      executeQuery(
        `
          SELECT
            SUM(CASE
              WHEN M.MAR_ENTRADA IS NOT NULL
               AND (H.HOR_HORA_INICIO IS NULL OR
                (TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'HH24')) * 60 + TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'MI'))) <=
                (TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 1, 2)) * 60 + TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 4, 2)) + 10))
              THEN 1 ELSE 0 END) AS PUNTUALES,
            COUNT(*) AS TOTAL
          FROM EMP_MARCAJE M
          JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
          LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
          WHERE M.MAR_FECHA >= TO_DATE(:inicio, 'YYYY-MM-DD')
            AND M.MAR_FECHA < TO_DATE(:fin, 'YYYY-MM-DD') + 1
            AND (:departamentoId IS NULL OR E.DEP_ID = :departamentoId)
        `,
        { inicio, fin, departamentoId }
      )
    ]);

    const totalMarcajes = toNumber(puntualidadRes.rows[0]?.TOTAL);
    const rows = [
      { INDICADOR: "Empleados activos", VALOR: String(toNumber(empleadosRes.rows[0]?.TOTAL)), DETALLE: "Conteo de empleados activos" },
      { INDICADOR: "Costo de planilla", VALOR: fmtQ(planillaRes.rows[0]?.TOTAL), DETALLE: "Ingresos de nomina en el periodo" },
      { INDICADOR: "Puntualidad", VALOR: totalMarcajes > 0 ? `${fmtNumber(toNumber(puntualidadRes.rows[0]?.PUNTUALES) / totalMarcajes * 100)}%` : "0.00%", DETALLE: "Marcajes puntuales sobre total de marcajes" },
      { INDICADOR: "Horas extra", VALOR: fmtNumber(horasRes.rows[0]?.TOTAL), DETALLE: "Horas extra registradas en control laboral" },
      { INDICADOR: "Liquidaciones", VALOR: String(toNumber(liquidacionesRes.rows[0]?.TOTAL)), DETALLE: fmtQ(liquidacionesRes.rows[0]?.MONTO) }
    ];

    sendTabularPdf(res, {
      title: "Dashboard Ejecutivo",
      subtitle: `Periodo ${inicio} al ${fin}`,
      filename: `dashboard-ejecutivo-${inicio}_${fin}.pdf`,
      summary: rows.slice(0, 4).map((row) => ({ label: row.INDICADOR, value: row.VALOR })),
      columns: [
        { header: "Indicador", key: "INDICADOR", width: 180 },
        { header: "Valor", key: "VALOR", width: 160 },
        { header: "Detalle", key: "DETALLE", width: 420 }
      ],
      rows
    });
  } catch (error) {
    console.error("Error en getDashboardEjecutivoPDF:", error);
    if (!res.headersSent) res.status(500).json({ message: "Error generando PDF de dashboard ejecutivo", error: error.message });
  }
}
